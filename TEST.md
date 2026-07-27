# Meld Control — Test Guide

How to verify every feature and API call in this project. There are two layers:

1. **Automated tests** (`npm test`) — run with zero external dependencies using
   Node's built-in test runner. They cover **every REST endpoint** and **all the
   DOM-free frontend logic**. No live Meld Studio required.
2. **Manual UI checks** — a per-feature checklist for the browser-side rendering
   and interactions that can only be verified against a running Meld.

---

## 1. Automated tests

### Running

```bash
npm test          # runs everything under test/ via `node --test`
```

Requires Node 18+ (developed on Node 25). No `npm install` needed beyond the
existing `express` / `ws` deps — the tests use `node:test`, `node:assert`, and the
global `fetch`.

Expected tail:

```
ℹ tests 78
ℹ pass 78
ℹ fail 0
```

### What the automated tests cover

| File | Scope |
|------|-------|
| `test/helpers.js` | Test harness: a **fake Meld** that records every method call, and `startServer()` which mounts the real Express app (`buildApp` from `server.js`) against it on an ephemeral port. |
| `test/api.test.js` | **Every REST endpoint** — asserts each route calls the correct `meld.*` method with the correct arguments, plus validation (400) and disconnected (503) paths. |
| `test/frontend.test.js` | **DOM-free frontend logic** in `public/js/catalog.js` (command catalog + pure helpers `groupTracks`, `busScenes`, `isMediaLayer`, `gainPctOf`) and `public/js/replay.js` (the Instant Replay planner `replayPlan` + `clampDismissSec`). |

#### API endpoint coverage (`test/api.test.js`)

Every route in `server.js` is exercised:

| Endpoint | Asserts | Feature |
|----------|---------|---------|
| `GET /api/session` | returns cache (session + version); 503 when disconnected | core |
| `GET /api/version` | returns version | core |
| `GET /api/debug/meld` | enumerates keys, marks signals vs functions | discovery |
| `POST /api/scene/:id/show` | `showScene(id)` | scenes |
| `POST /api/scene/:id/switch` | `showScene(id)` | scenes |
| `POST /api/scene/:id/stage` | `setStagedScene(id)` | 5 |
| `POST /api/scene/staged/show` | `showStagedScene()` — **route ordering** (not shadowed by `:id/show`) | 5 (TAKE) |
| `POST /api/layer/:id/toggle` | `toggleLayer(sceneId, id)` + 400 without `sceneId` | layers |
| `POST /api/effect/:id/toggle` | `toggleEffect(scene, layer, id)` + 400 | layers |
| `POST /api/track/:id/mute` | `toggleMute(id)` | audio |
| `POST /api/track/:id/monitor` | `toggleMonitor(id)` | audio |
| `POST /api/track/:id/gain` | `setGain(id, gain)` + 400 + **gain:0 accepted** | audio |
| `POST /api/track/observer/register` | `registerTrackObserver(id, ctx)` + 400 | 6 |
| `POST /api/track/observer/unregister` | `unregisterTrackObserver(id, ctx)` | 6 |
| `POST /api/stream/toggle` | `toggleStream()` | transport |
| `POST /api/record/toggle` | `toggleRecord()` | transport |
| `POST /api/command` | `sendCommand(cmd)` for all 10 deck commands + 400 | 3 |
| `POST /api/stream-event` | `sendStreamEvent(type)` and `(type, data)` + 400 (bridge only; Widgets UI removed) | — |
| `POST /api/property/:id` | `setProperty(id, prop, value)` incl. rename + 400 | 1 |
| `POST /api/property/:id/batch` | one `setProperty` per prop, correct order + `count` + 400 | 1 |
| `POST /api/call-function/:id` | `callFunction(id, cmd)` and `callFunctionWithArgs(id, cmd, args)` + 400 | 2 |
| any mutating route, disconnected | 503 `Not connected to Meld Studio` | core |

#### Frontend logic coverage (`test/frontend.test.js`)

| Suite | Asserts | Feature |
|-------|---------|---------|
| command catalog | includes explicit `start*/stop*` stream+record variants, all capture/camera commands, every command has a label | 3 |
| `replayPlan` | Instant Replay macro emits `recordClip → wait → replay.show → countdown → replay.dismiss` in order; the pre-dismiss wait is flagged `countdown` and honors `dismissDelayMs`; `autoDismiss:false` stops after show; `autoShow:false` records only; zero delays drop wait steps but keep commands | 3 |
| `clampDismissSec` | clamps auto-dismiss seconds to `[1,120]` + rounds; genuine non-numbers → 15s default; empty-ish (`''`/`null`) → 1s floor | 3 |
| `replayPlan` position | with a preset position, emits a `setPosition` step ordered *after* show and *before* dismiss; survives `autoDismiss:false`; the position is sanitized in-plan | 3 |
| `sanitizePos` | coerces numeric strings, defaults non-numeric fields to a PiP box | 3 |
| `pickNewItemId` | diffs before/after session snapshots to find the item that appeared on `replay.show`; prefers a geometry-bearing then replay-named item; `null` when nothing new | 3 |
| `isMediaLayer` | true only when `mediaSource` present | 2 |
| `groupTracks` | global tracks → global group; layer-parented track resolves **layer → scene**; unresolvable parent → "Other" (never dropped); scenes ordered by index; empty input safe | 7 |
| `busScenes` | picks `current` (PGM) and `staged` (PVW); null when none flagged; excludes non-scenes | 5 |
| `gainPctOf` | formats linear gain as %, null → 100% | audio |

> **Note on `groupTracks`:** this directly validates the FUTURE_PLAN Feature 7
> correction — that `track.parent` is a **layer** id, so grouping under a scene
> must hop `track.parent → layer → layer.parent`.

### Design note: why the split

`server.js` was refactored so route registration lives in `buildApp(bridge)` and
`main()` only runs under `if (require.main === module)`. That lets tests inject a
fake bridge and hit real routes with no socket to Meld. The frontend's pure logic
lives in `public/js/catalog.js` behind a `typeof module` export guard (a no-op in
the browser), so the same code the page runs is unit-tested in node.

The **browser rendering** (markup produced by `render-commands.js`,
`render-media.js`, `render-replay.js`, the switcher in `render-scenes.js`) and
**pointer interactions / timers** (e.g. the Instant Replay runner + countdown in
`render-replay.js`) are not automated (that would need jsdom / a headless
browser). They're covered by the manual checklist below — the *pure* replay
planner underneath the runner is unit-tested.

---

## 2. Manual UI checks

### Setup

```bash
npm start
# open http://127.0.0.1:3000 with Meld Studio running
```

Status dot should go green and show `v2` (transform + rename need API v2+).

A fast smoke test **without** Meld (verifies the server + assets, not the live
data):

```bash
HTTP_PORT=3999 node server.js
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3999/js/catalog.js  # -> 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3999/api/session    # -> 503 (no Meld)
```

### Feature 1 — Layer transform editor (already shipped)
- [ ] Layers tab → pick a scene → a layer card shows X/Y/W/H/rotation inputs.
- [ ] With API v2+, the "Visual editor" fold shows a stage; drag/resize/rotate the
      box → Meld updates live; releasing settles to Meld's echoed values.
- [ ] Editing a number input applies on change.
- [ ] On API v1, the visual editor is replaced by a "needs v2+" hint.

### Feature 2 — Media playback controls
- [ ] A layer with a `mediaSource` shows a **Media** section with Play / Pause;
      layers without one do not.
- [ ] Play → media plays in Meld; Pause → pauses.
- [ ] (No scrub bar — the API exposes no playhead, so it was removed.)

### Feature 3 — Command deck
- [ ] Commands tab shows grouped decks: **Capture / Camera / Streaming / Recording**.
- [ ] Screenshot, Screenshot V, Save Clip, Show/Dismiss Replay each fire (toast).
- [ ] Virtual Camera toggles.
- [ ] Start/Stop Stream and Start/Stop Record use the explicit variants (a toast
      appears; state can't drift because start≠stop).

### Feature 3 (deep dive) — Instant Replay panel
- [ ] Commands tab shows an **Instant Replay** panel above the command deck.
- [ ] Tapping **▶ Instant Replay** runs the macro end-to-end: status shows
      *Saving clip… → Showing replay → auto-dismiss countdown → Replay dismissed*.
      In Meld: a clip saves, the replay shows, then dismisses on its own.
- [ ] While the countdown runs, **+10s** extends it and **Dismiss now** ends it
      immediately (fires `meld.replay.dismiss`).
- [ ] The auto-dismiss delay field defaults to **15**, is editable, and clamps to
      1–120s; unchecking **Auto-dismiss** disables the field and the macro stops
      after Show (replay stays up until you Dismiss manually).
- [ ] Tapping Instant Replay again mid-run restarts cleanly (no double timers).
- [ ] **Position replay** (checkbox) reveals X/Y/W/H fields (px on 1920×1080). With
      it on, run Instant Replay → the shown replay jumps to that box. Status briefly
      reads *Positioning replay…*.
- [ ] **Discovery check (needs a live build):** confirm the replay actually moves.
      If it doesn't, watch for the status *"couldn't find a layer to position"* —
      that means `replay.show` doesn't surface a session item we can target on your
      build, and positioning isn't possible there (the replay still plays).
- [ ] **Expected limitation:** the countdown is *our* client-side timer — if you
      dismiss inside Meld, our UI keeps counting and just fires a harmless no-op
      dismiss (Meld exposes no replay state to sync against).

### Feature 4 — Widgets tab — REMOVED
Scrapped per request (widgets didn't trigger reliably against the live build). The
generic `POST /api/stream-event` bridge endpoint remains for future use.

### Feature 5 — Program/Preview switcher
- [ ] Scenes tab has a **Simple / Switcher** toggle.
- [ ] In Switcher: a green **PREVIEW** column and red **PROGRAM** column, plus a
      **TAKE** button.
- [ ] Click a scene in PREVIEW → it stages (green outline); PROGRAM shows the live
      scene (red outline).
- [ ] **TAKE** cuts staged → program; the columns re-highlight. TAKE is disabled
      when nothing is staged.
- [ ] Switching back to Simple restores the tap-to-switch grid.

### Feature 6 — Live audio feedback / observers
- [ ] Open the Audio tab → the browser registers a track observer per track
      (`POST /api/track/observer/register`); leaving the tab unregisters them.
      Verify in the Network panel or server logs.
- [ ] Mute/unmute a track **in Meld's own UI** → the card's Mute button reflects
      it live (via the `gain` WS message).
- [ ] **Expected limitation:** the fader does **not** move from `gainUpdated`
      (that signal is a live meter, not a stored value — the fader is write-only).

### Feature 7 — Grouped audio tracks
- [ ] Audio tab is split into a **Global** group (mic/desktop) and per-scene
      groups.
- [ ] A layer-associated audio track appears under **its scene** (resolved via its
      parent layer), not under a scene literally named after the layer id.
- [ ] A track whose parent can't be resolved appears under **Other** (nothing
      silently disappears).

---

## Adding tests

- **New endpoint:** add a case to `test/api.test.js`. Use `callOf(meld, 'method')`
  to assert the recorded call; add a 400 case for any required body field.
- **New frontend logic:** keep it DOM-free and export it from
  `public/js/catalog.js` (behind the existing `module.exports` guard), then add a
  suite to `test/frontend.test.js`.
- **New command:** just extend `COMMAND_GROUPS` in `catalog.js` — the catalog
  tests assert coverage and the deck renderer picks it up automatically.
