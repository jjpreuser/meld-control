# Meld Control — Future Development Plan

A roadmap of features we can build on top of the Meld Studio WebChannel API.

**Reference:** [Meld Studio WebChannel API](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md)
Transport: Qt WebChannel over `ws://127.0.0.1:13376`, wrapped by [`qwebchannel.js`](qwebchannel.js) and exposed as REST by [`server.js`](server.js).

---

## Current status

The bridge in [`server.js`](server.js) already wraps **the entire documented API** — every property, signal, and method has a REST endpoint. The gap is on the **frontend** ([public/js/actions.js](public/js/actions.js)), which today only surfaces:

- Scene switch / stage
- Layer visibility toggle
- Track mute / monitor / gain
- Effect toggle

Everything below is about turning already-bridged capabilities into real features, plus a few new bridge endpoints where noted.

### API surface reference (what the `meld` object exposes)

| Kind | Name | Signature / notes |
|------|------|-------------------|
| Property | `isStreaming` | bool |
| Property | `isRecording` | bool |
| Property | `session` | `{ items: { [id]: item } }` — scenes, tracks, layers, effects |
| Property | `version` | number (undefined ⇒ v1) |
| Signal | `sessionChanged` | () |
| Signal | `isStreamingChanged` | () |
| Signal | `isRecordingChanged` | () |
| Signal | `gainUpdated` | (trackId, gain, muted) — real-time |
| Method | `showScene(id)` | switch program to scene |
| Method | `setStagedScene(id)` | prepare scene (preview) |
| Method | `showStagedScene()` | cut staged → program |
| Method | `toggleMute(trackId)` | |
| Method | `toggleMonitor(trackId)` | |
| Method | `setGain(trackId, gain)` | gain 0.0–1.0 |
| Method | `registerTrackObserver(trackId, ctx)` | subscribe to live track updates |
| Method | `unregisterTrackObserver(trackId, ctx)` | |
| Method | `toggleLayer(sceneId, layerId)` | |
| Method | `toggleEffect(sceneId, layerId, effectId)` | |
| Method | `toggleStream()` | |
| Method | `toggleRecord()` | |
| Method | `callFunction(layerId, command)` | e.g. "play", "pause" |
| Method | `callFunctionWithArgs(layerId, command, args[])` | e.g. "seekTo", [seconds] |
| Method | `sendCommand(command)` | see command list below |
| Method | `sendStreamEvent(type, data?)` | widget events, see below |
| Method | `setProperty(objectId, prop, value)` | **v2+**; `parent`/`type`/`index` ignored |

### Session item shapes

- **scene** — `type`, `index`, `name`, `current` (live now), `staged` (prepared)
- **track** — `type`, `parent?` (**layer id**; absent ⇒ global), `name`, `monitoring`, `muted`
- **layer** — `type`, `parent` (scene id), `index`, `name`, `visible`, `width`, `height`, `x`, `y`, `rotation`, `source?` (image path), `url?` (browser source), `mediaSource?` (media path)
- **effect** — `type`, `parent` (layer id), `name`, `enabled`

---

## Feature 1 — Layer transform editor (`setProperty`) — ✅ IMPLEMENTED

**Impact: highest. Effort: high. Requires API v2+.**

> **Built (2026-07-16):** number inputs for x/y/w/h/rotation were already wired to
> `POST /api/property/:id`. Added on top:
> - `POST /api/property/:id/batch` in [server.js](server.js) (one round-trip for a whole gesture).
> - A visual editor in [public/js/transform.js](public/js/transform.js) + [public/css/transform.css](public/css/transform.css): a scaled 16:9 stage per layer card with a drag-to-move / corner-resize / rotate box (rotation-aware, opposite-corner-pinned resize), debounced batch POSTs, and live-synced number inputs. Sibling layers draw as context outlines.
> - Gated behind `apiVersion >= 2` (shows a hint otherwise), tracked via a new `apiVersion` global set in [render.js](public/js/render.js) and a `transformDragging` guard in [render-layers.js](public/js/render-layers.js) so session echoes don't tear down an in-flight drag.
> - **Assumption to verify against a live Meld:** the stage assumes a 1920×1080 canvas and that layer `x,y` is the top-left with `rotation` about centre. If your build uses normalized coords or a centre origin, adjust `TRANSFORM_CANVAS_W/H` / the origin math at the top of [transform.js](public/js/transform.js).

### What it does
`setProperty(objectId, propertyName, value)` mutates any writable property of a session item live. For **layers** this means we can move, resize, rotate, show/hide, and hot-swap the source of any layer without touching Meld's UI:

- Position: `x`, `y`
- Size: `width`, `height`
- Orientation: `rotation`
- Visibility: `visible`
- Content: `source` (image path), `url` (browser source), `mediaSource` (media file path)

> **`setProperty` is not layer-only.** The API doc lists writable props on every item type:
> - **Layers:** `name`, `visible`, `x`, `y`, `width`, `height`, `rotation`
> - **Tracks:** `name`, `muted`, `monitoring`
> - **Scenes:** `name`
> - **Effects:** `name`, `enabled`
>
> Two cheap wins fall out of this (both gated on v2+):
> 1. **Rename** any scene/layer/track/effect via a small inline edit affordance.
> 2. **Set explicit state** for mute/monitor/effect-enabled (`setProperty(id, "muted", true)`) instead of the toggle methods, so a button can't drift out of sync — same reasoning Feature 3 gives for preferring `start*/stop*` over `toggle*`.

> API note: `setProperty` is **Version 2+** only, and it silently ignores `parent`, `type`, and `index`. Guard on `bridge.cache.version >= 2` before showing this UI.
> Ref: *Property Management* section of the [WebChannel API docs](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md).

### How it works
1. Read the layer's current `x/y/width/height/rotation` from `session.items[layerId]`.
2. Render a bounding box on a scaled canvas that represents the scene (e.g. 1920×1080 mapped to the container width).
3. On drag/resize/rotate, compute new pixel values and `POST /api/property/:id` with `{ property, value }`.
4. `sessionChanged` fires back, refreshing the cache and re-rendering the box (closed loop — no local guessing).

### How we build it
- **Bridge:** already done — [`server.js`](server.js) exposes `POST /api/property/:id` (body `{ property, value }`). No change needed. Consider a **batch** variant `POST /api/property/:id/batch` that accepts `{ props: { x, y, width, height } }` and loops `setProperty`, to avoid four round-trips per drag.
- **Throttle:** debounce drags to ~30–60ms like the existing gain slider pattern (`gainTimers` in [actions.js](public/js/actions.js)) so we don't flood the socket.
- **Frontend:** new `public/js/transform.js` + a canvas overlay in the layers tab. Add a "Transform" toggle on each layer card (reuse the `expandedProps` pattern already in [actions.js](public/js/actions.js)).
- **Source swap:** simple text inputs for `url` / `source` / `mediaSource` with an "Apply" button → `POST /api/property/:id`.

### Reference
- [WebChannel API — Property Management](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md#property-management) (`setProperty`)
- [WebChannel API — Layer item type](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md) (writable geometry props)

---

## Feature 2 — Media playback controls (`callFunction` / `callFunctionWithArgs`)

**Impact: medium-high. Effort: medium.**

### What it does
Layers backed by a `mediaSource` can be driven with:
- `callFunction(layerId, "play")`
- `callFunction(layerId, "pause")`
- `callFunctionWithArgs(layerId, "seekTo", [seconds])`

This lets us build a transport bar (play / pause / scrub) for video/audio media layers.

### How it works
1. Detect media layers by presence of `mediaSource` on the layer item.
2. Render play/pause buttons + a scrub slider.
3. Play/pause → `POST /api/call-function/:id` with `{ command: "play" }`.
4. Scrub → `POST /api/call-function/:id` with `{ command: "seekTo", args: [seconds] }`.

### How we build it
- **Bridge:** already done — `POST /api/call-function/:id` handles both the arg-less and args forms (see [server.js](server.js)).
- **Frontend:** new `public/js/render-media.js`, shown inside the layer card when `mediaSource` is present.
- **Caveat:** the API does **not** expose current playback position or duration. The scrub bar is fire-and-forget (send absolute seconds); we can't show a live playhead unless we add our own timer estimate starting from the last `play`. Document this limitation in the UI.

### Reference
- [WebChannel API — Media Playback](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md#media-playback) (`callFunction`, `callFunctionWithArgs`)

---

## Feature 3 — One-tap command deck (`sendCommand`)

**Impact: medium. Effort: low.**

### What it does
`sendCommand(command)` fires named global actions. Several are not surfaced in the UI yet:

| Command | Action |
|---------|--------|
| `meld.screenshot` | Screenshot (horizontal) |
| `meld.screenshot.vertical` | Screenshot (vertical) |
| `meld.toggleVirtualCameraAction` | Toggle virtual camera |
| `meld.recordClip` | Save a replay clip |
| `meld.replay.show` | Show replay |
| `meld.replay.dismiss` | Dismiss replay |
| `meld.startStreamingAction` / `meld.stopStreamingAction` / `meld.toggleStreamingAction` | Streaming (explicit variants) |
| `meld.startRecordingAction` / `meld.stopRecordingAction` / `meld.toggleRecordingAction` | Recording (explicit variants) |

### How it works
Each is a single `POST /api/command` with `{ command }`. Stateless, fire-and-forget.

### How we build it
- **Bridge:** already done — `POST /api/command`.
- **Frontend:** a grid of big deck-style buttons (there's already `public/css/commands.css`). Group into: Capture (screenshots, clip, replay), Camera (virtual cam), and explicit Stream/Record start/stop.
- Prefer the explicit `start*/stop*` command variants over `toggle*` where the UI already knows current state (from `isStreaming`/`isRecording`) so the button can't get out of sync.

### Reference
- [WebChannel API — Commands & Events](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md#commands--events) (`sendCommand` full command list)

---

## Feature 4 — Stream widgets tab (`sendStreamEvent`)

**Impact: medium (high fun-value). Effort: low.**

### What it does
`sendStreamEvent(type, data?)` dispatches events to Meld's on-stream widgets:

| Widget | Events | Data |
|--------|--------|------|
| Stopwatch | `STOPWATCH_RESET`, `STOPWATCH_PAUSE`, `STOPWATCH_RESUME` | — |
| Countdown | `COUNTDOWN_RESET`, `COUNTDOWN_PAUSE`, `COUNTDOWN_RESUME` | — |
| Confetti | `CONFETTIFALL_TRIGGER`, `CONFETTIPOP_TRIGGER` | — |
| Subathon timer | `SUBATHONTIMER_RESET`, `SUBATHONTIMER_PAUSE`, `SUBATHONTIMER_RESUME`, `SUBATHONTIMER_ADDTIME` | ADDTIME needs `{ amount: number }` |
| Wheel | `WHEELSPIN_SPIN` | — |
| Counter | `COUNTER_INCREMENT`, `COUNTER_DECREMENT` | — |

### How it works
Each button → `POST /api/stream-event` with `{ type }`, or `{ type, data }` for `SUBATHONTIMER_ADDTIME` (e.g. `{ amount: 60 }`).

### How we build it
- **Bridge:** already done — `POST /api/stream-event` (handles both `{type}` and `{type, data}`).
- **Frontend:** new `public/js/render-widgets.js` + a "Widgets" tab. One card per widget with its buttons; the subathon add-time card has a number input for `amount`.
- These are stateless triggers — no session state to reconcile, so no `sessionChanged` handling needed.

### Reference
- [WebChannel API — Widget Events](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md#widget-events) (`sendStreamEvent` full event list)

---

## Feature 5 — Program / Preview switcher (`setStagedScene` + `showStagedScene`)

**Impact: medium. Effort: medium.**

### What it does
Turn the existing stage endpoints into a proper vision-mixer layout:
- **Program (PGM):** the scene with `current: true`.
- **Preview (PVW):** the scene with `staged: true`, set via `setStagedScene(id)`.
- **CUT/TAKE:** `showStagedScene()` promotes preview → program.

### How it works
1. Two columns of scene buttons: clicking a scene in the PVW column → `POST /api/scene/:id/stage`.
2. A big TAKE button → `POST /api/scene/staged/show`.
3. `sessionChanged` updates which scene shows `current`/`staged`, and the columns re-highlight.

### How we build it
- **Bridge:** already done — `/api/scene/:id/stage` and `/api/scene/staged/show`.
- **Frontend:** new layout mode in [render-scenes.js](public/js/render-scenes.js) reading `current`/`staged` flags. Could be a toggle between "simple" (current tap-to-switch) and "switcher" modes.

### Reference
- [WebChannel API — Scene Control](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md#scene-control) (`showScene`, `setStagedScene`, `showStagedScene`)

---

## Feature 6 — Live audio feedback (`gainUpdated` + track observers)

**Impact: medium. Effort: medium.**

### What it does
`gainUpdated(trackId, gain, muted)` fires in **real time** as gain/mute change (from Meld's own UI, hardware, or other clients). We already broadcast it (see the `gain` message in [server.js](server.js)) but the frontend may not consume it to move sliders live.

`registerTrackObserver(trackId, context)` / `unregisterTrackObserver(...)` subscribe/unsubscribe a track for detailed updates — call register when a track card becomes visible, unregister when it's hidden.

### How it works
1. On the socket `gain` message, find the slider for `trackId` and set its value + mute state — unless the user is actively dragging it (guard against fighting the user).
2. Register observers for visible tracks on render; unregister on teardown.

### How we build it
- **Bridge:** already done — the signal is broadcast, and `/api/track/observer/register` + `/unregister` exist.
- **Frontend:** consume the `gain` websocket message in [main.js](public/js/main.js)/[state.js](public/js/state.js); add register/unregister calls in [render-audio.js](public/js/render-audio.js).
- **Limitation:** `gainUpdated` reports the **gain setting**, not actual output levels. True VU/peak meters are **not** available in this API — do not promise level meters.

### Reference
- [WebChannel API — Signals](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md#signals) (`gainUpdated`)
- [WebChannel API — Audio Control](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md#audio-control) (`registerTrackObserver`, `unregisterTrackObserver`)

---

## Feature 7 — Group global vs scene audio tracks

**Impact: low. Effort: low.**

### What it does
A track's `parent` field is the **layer id** it belongs to (layer-associated audio, e.g. a browser/media source's own audio), or **absent** for a global track (mic, desktop audio). Group the audio tab into "Global" and per-layer/per-scene sections so the mixer matches Meld's mental model.

> **Correction:** an earlier draft assumed `track.parent` was a *scene* id — the API doc says it is a **layer** id. To place a track under a scene, resolve `track.parent` (layer) → `layer.parent` (scene). Verify against a live session with `GET /api/debug/meld` before building, since track shapes are exactly the kind of thing docs get wrong.

### How we build it
- **Frontend only:** in [render-audio.js](public/js/render-audio.js), partition tracks by `item.parent` presence. Tracks with a `parent` resolve through `session.items[parent]` (the layer) to that layer's scene for section grouping. No bridge change.

### Reference
- [WebChannel API — Audio Track item type](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md) (`parent` optional = layer id; absent = global track)

---

## Discovery task — audit the live `meld` object

Before building, run the existing debug endpoint against a **running** Meld instance:

```
GET /api/debug/meld
```

It enumerates every key on the live `meld` object and marks signals vs values (see [server.js](server.js)). The published docs may lag the shipped build — this reveals any **undocumented** properties, signals, or methods we could bridge. Record findings back into this file.

---

## Known API limitations (not buildable — request upstream if needed)

- **No real audio metering** — only the gain *setting* is exposed, not dB/peak output levels.
- **No transition type/duration** control (cut only via staged scene).
- **No create/delete** of scenes, layers, tracks, or effects — we can only toggle/transform existing items.
- **No media playback position/duration** readback — scrubbing is fire-and-forget.
- **No chat / alerts / event ingestion.**

---

## Suggested build order

1. **Feature 4 (Widgets)** — lowest effort, self-contained, high visible value.
2. **Feature 3 (Command deck)** — low effort, all endpoints exist.
3. **Feature 7 (Audio grouping)** + **Feature 6 (live gain)** — polish the mixer.
4. **Feature 5 (PGM/PVW switcher)** — medium, satisfying.
5. **Feature 2 (Media transport)** — medium.
6. **Feature 1 (Transform editor)** — highest impact, biggest lift; do last, gated on API v2+.
