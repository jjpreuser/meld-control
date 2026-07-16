# Meld Control — Overhaul Plan

_Quality check & overhaul of the Meld Studio remote-control bridge._
_Created: 2026-07-16_

## What this project is

A web-based remote control for a streamer's [Meld Studio](https://meldstudio.co/).
A Node bridge ([server.js](server.js)) connects to Meld's local WebSocket via `QWebChannel`,
caches session state, and exposes a REST API + a WS feed. The browser UI in [public/](public/)
lets a phone/tablet drive scenes, layers, audio, and stream commands.

```
Browser (phone/tablet)  --HTTP + WS-->  Node bridge (server.js)  --QWebChannel/WS-->  Meld Studio (:13376)
   public/*.js                            Express :3000
```

---

## Quality report

### Real bugs

1. **Event-listener leak** — [render.js:168](public/render.js#L168) attaches a `change` listener
   inside `renderLayers()`, which runs on every session update. Each render stacks another listener
   on `#layerList`, so one property edit eventually fires N duplicate POST requests.
2. **Typing gets wiped out** — `renderLayers()` rebuilds the whole `innerHTML` on every WebSocket
   update, destroying any input you're editing mid-keystroke.
3. **`gain` updates silently dropped** — the server broadcasts `{type:'gain', ...}` from
   `gainUpdated`, but the client only handles `type:'update'`.

### Dead / half-finished code

4. **No gain UI** despite `/api/track/:id/gain` on the server and an orphan `.transition-bar` +
   `#transitionDurationLabel` CSS block ([style.css:588-655](public/style.css#L588)) with no HTML.
5. **Duplicate actions** — `mute` and `track-mute` in [app.js](public/app.js#L68-L75) are identical.
6. **Four separate `document.addEventListener('click')`** blocks that could be one delegated handler.
7. `renderLayers()` runs on every update even when the Scenes tab is showing.

### Robustness / hygiene

8. **After a Meld restart**, reconnected browsers show stale data until the next change event.
9. **No auth** — anyone on the network can control the stream (fine over Tailscale, risky on open LAN).
10. **Stray files** — `nul` (Windows redirect artifact), a committed `server.log`; Dockerfile uses
    the deprecated `npm install --production`.

---

## Decisions

- **Build both** the gain faders and the scene-transition control.
- The **gain API is confirmed**; the **transition API is not** — Phase 2b starts with discovery
  against the live Meld before any UI is built. If Meld doesn't expose it, we cut it.

---

## Implementation plan

### Phase 1 — Bug fixes (server.js + public/)
1. Kill the listener leak — remove the `change` listener from inside [render.js:168](public/render.js#L168);
   add one delegated `change` handler in [app.js](public/app.js) `init()`.
2. Stop clobbering edits — in `applySession`, skip re-rendering the layers list while an input inside
   `#layerList` has focus (guard on `document.activeElement`).
3. Route gain messages — handle `msg.type === 'gain'` in [app.js](public/app.js) `ws.onmessage`.
4. Re-broadcast on reconnect — in [server.js](server.js) `connect()`, broadcast the fresh session after
   the QWebChannel re-binds (not only on first `initialize()`).

### Phase 2a — Audio gain faders (Audio tab)
5. Add a range slider + value readout to each track card in `renderAudio()` ([render.js](public/render.js)).
6. Wire slider `input`/`change` -> `POST /api/track/:id/gain` (debounced).
7. On WS `gain` messages, live-update the slider + mute state.
8. **Discovery:** register a track observer and read what `gainUpdated` reports to confirm the gain
   field name/range (linear 0-1 vs dB) before finalizing the slider scale.

### Phase 2b — Transition control (discovery-gated)
9. Probe the live `meld` object for transition methods/properties.
   - **If found:** build the transition-bar (type dropdown + duration slider) the orphan CSS styles,
     add a server endpoint, wire it up.
   - **If not found:** delete the dead `.transition-bar` CSS and report back.

### Phase 3 — Refactor, polish, cleanup
10. Consolidate the four click handlers into one; drop the duplicate `mute`/`track-mute` action.
11. Skip `renderLayers()` when the Layers tab isn't visible.
12. Add a proper **disconnected** overlay/empty state.
13. UI polish pass (spacing, active-state consistency, faders).
14. Housekeeping: delete `nul`, `git rm --cached server.log`, switch Dockerfile to `npm ci --omit=dev`.

### Out of scope (flagged, not doing unless requested)
- **Authentication.** The bridge binds `0.0.0.0` with no auth — safe over Tailscale, risky on open LAN.

---

## Order of work

**Phase 1 -> 2a -> 2b discovery -> 3**, checking in after Phase 1 lands so the bug fixes can be
verified before the bigger build.
