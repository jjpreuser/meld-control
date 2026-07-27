# Feature 6 (deep dive) — Live audio feedback

A working doc to develop live audio further. The core question: **what does
`gainUpdated` actually carry on this build** — a live meter, or a usable stored
fader value — and what can we bind to the movement you're seeing. Edit freely.

**Status:** observers wired; fader is write-only pending the question below.
**Reference:** [WebChannel API — Signals](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md#signals) · [Audio Control](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md#audio-control)

---

## What we have today

- **Grouping (Feature 7):** Audio tab split into Global + per-scene groups.
- **Observers (Feature 6):** on opening the Audio tab we `registerTrackObserver`
  for every visible track (context `meld-control-web`) and unregister on leaving
  ([public/js/render-audio.js](public/js/render-audio.js) → `syncTrackObservers`).
- **Mute sync:** the `gain` WebSocket message updates the Mute button live.
- **Fader is write-only:** we send `setGain` on drag but do **not** move the
  slider from incoming `gainUpdated`.

## Why the fader is write-only right now

Discovery against a live Meld (2026-07-16, noted in
[public/js/main.js](public/js/main.js)): `gainUpdated` did **not** fire in response
to `setGain` and never reported a stored fader value — it looked like a **live
audio meter** (continuous level), not the gain setting. Binding the slider to it
would make the thumb jitter with audio. So we deliberately ignore `msg.gain` and
only apply `msg.muted`.

## The movement you're seeing — to pin down

You mentioned seeing movement and offered to explain. Capture it here so we can
decide what to bind:

- [ ] **What moves?** fader thumb / % readout / mute button / something else
- [ ] **When?**
  - only when you change gain in **Meld's own UI** → suggests a real stored value
    we *could* two-way bind
  - on its own / continuously while audio plays → confirms it's a **meter**
  - only on mute/unmute → that's already handled
- [ ] **How often / how fast?** occasional discrete jumps vs smooth continuous
- [ ] **Values:** does `msg.gain` look like 0.0–1.0 fader positions, or like
      fluctuating level readings?

> Quick capture: open devtools → Network/WS, watch the `gain` frames while you (a)
> do nothing, (b) speak into the mic, (c) drag Meld's own fader. Paste a few
> frames here.

## Decision tree (once the above is known)

- **If it's a meter (continuous levels):**
  build a **level indicator** — a small VU-style bar per track fed by the `gain`
  message, kept visually separate from the fader (which stays write-only). Note
  the API has no true dB/peak, so label it a relative activity meter.
- **If it carries a real stored gain (fires on Meld-side changes):**
  add **two-way fader sync** — move the slider from `gainUpdated` *unless* the user
  is actively dragging (guard already exists for mute; extend to gain). Debounce
  so it doesn't fight in-flight `setGain` echoes.
- **If both (meter + occasional value):** need a way to tell them apart in the
  payload (magnitude, frequency, or an extra field). Investigate the frame shape.

## Implementation notes (when we build)

- The `gain` broadcast already exists in [server.js](server.js); no bridge change
  needed to *consume* more of it. If we need to distinguish meter vs value we may
  add fields to that broadcast.
- Keep the drag guard: never move the slider while `document.activeElement` is that
  slider (pattern already in `updateTrackCard`).
- A level meter should be its own element (e.g. `.track-meter`) so a redraw of the
  card doesn't fight the animation; update it in place like `updateTrackCard`.
- Tests: any "meter value → bar width/height" or "should we adopt this gain?"
  decision should be a pure function unit-tested in `test/frontend.test.js`.
