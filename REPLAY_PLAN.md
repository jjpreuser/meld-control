# Feature 3 (deep dive) — Clip & Replay

A working doc to develop the clip/replay workflow further. The basic one-tap
commands already ship in the Commands tab; this is where we design what "deeper"
looks like. Edit freely.

**Status:** ✅ Instant Replay SHIPPED — one-tap macro (save → show → 15s
auto-dismiss, editable) with a countdown pill (+10s / Dismiss now), in the
Commands tab. API fully mapped (3 commands, no readback). Raw Save/Show/Dismiss
buttons remain in the deck.

Files: [public/js/replay.js](public/js/replay.js) (pure planner, unit-tested),
[public/js/render-replay.js](public/js/render-replay.js) (panel + runner +
countdown), [public/css/replay.css](public/css/replay.css). Tests in
[test/frontend.test.js](test/frontend.test.js).
**Reference:** [WebChannel API — Commands & Events](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md#commands--events)

---

## What we have today

Three fire-and-forget `sendCommand` buttons in the Capture group of the Commands
tab ([public/js/catalog.js](public/js/catalog.js) → `COMMAND_GROUPS`):

| Button | Command | Effect |
|--------|---------|--------|
| Save Clip | `meld.recordClip` | Saves a replay clip of the recent buffer |
| Show Replay | `meld.replay.show` | Shows the replay layer for the **last** clip |
| Dismiss Replay | `meld.replay.dismiss` | Dismisses all active replay layers |

Each is a single `POST /api/command` with `{ command }`. Stateless — no session
state comes back, so the UI can't currently tell whether a replay is on screen.

## Known API limits — CONFIRMED against the docs (2026-07-27)

Read the full [WebChannel API](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md).
The **entire** replay surface is three fire-and-forget `sendCommand` strings — nothing more:

| Command | Doc description | Params |
|---------|-----------------|--------|
| `meld.recordClip` | "Records a clip" | none |
| `meld.replay.show` | "Show replay layer for last clip" | none |
| `meld.replay.dismiss` | "Dismiss all active replay layers" | none |

There is **no state to read back**, confirmed by the doc's full inventory:

- **Signals** (complete list): `gainUpdated`, `sessionChanged`, `isStreamingChanged`,
  `isRecordingChanged`. **None for replay.**
- **Status properties** (complete list): `isStreaming`, `isRecording`. **No
  `isReplaying` / replay-active flag.**
- **Session-item properties:** `type, index, name, current, staged, parent,
  monitoring, muted, visible, height, width, x, y, rotation, source, url,
  mediaSource, isPlaying, enabled`. Nothing replay-related (`isPlaying` is media).

Consequences, now settled (were "open"):

- `meld.replay.show` only ever targets the **last** clip — no clip id / picker,
  and no way to build one.
- No replay-active flag → **buttons cannot be state-aware** (can't disable Show when
  nothing's clipped, or Dismiss when nothing's shown). They stay stateless.
- No list of saved clips is exposed.
- No "record N seconds" parameter — buffer length is Meld-side only.

> Still worth a one-time `GET /api/debug/meld` against the live build to see if the
> object exposes anything **undocumented**; but the plan should not depend on it.
> If something turns up, record it here and revisit "state-aware buttons".

## What "deeper" can be — the design space, given the constraints

Because there's no readback, everything we can build is **client-side sequencing
and timing** on top of the three commands. That still covers the real workflow:

> *big moment happens → tap once → clip is saved, shown, and auto-dismissed.*

Decisions (settled 2026-07-27, all shipped):

- [x] **Auto-show after save** — one "Instant Replay" button = `recordClip`, wait a
      beat, then `replay.show`. (The wait matters — see timing note below.)
- [x] **Timed auto-dismiss** — after showing, fire `replay.dismiss` after a
      configurable delay, with a visible countdown + Dismiss-now / +10s.
- [x] **Dedicated Replay panel** — its own card above the command grid (big touch
      targets for phone-as-deck) + the countdown UI.
- [x] **Default delay 15s, user-editable** (clamped 1–120s).

State-aware buttons are **off the table** (no replay-state signal) — dropped.

## Recommended build (my pick)

A small **Replay panel** with one primary action + manual controls:

1. **▶ Instant Replay** (primary) — runs the macro: `recordClip` → delay →
   `replay.show` → countdown → `replay.dismiss`. One tap covers the whole moment.
2. **Save / Show / Dismiss** — the three raw commands stay, for manual control.
3. **Countdown pill** while a replay is on screen, with **Dismiss now** and
   **+10s**. Purely client-side (we're just tracking our own timer, since Meld
   won't tell us the real state — see caveat).

### Timing note
`recordClip` and `replay.show` are async on Meld's side; showing immediately after
saving may race the clip finalizing. The macro needs a short delay between them
(start ~600ms, make it configurable) — this is guesswork we tune against the live
build, since there's no "clip ready" signal.

### Honesty caveat (no readback)
Our countdown reflects **our** timer, not Meld's actual replay state. If the user
dismisses inside Meld, or a replay ends on its own, our UI won't know. We show the
timer as "our auto-dismiss," not "replay is playing," to avoid lying to the user.

## Implementation notes (when we build)

- **No bridge/server changes** — reuse the existing `POST /api/command`. The whole
  feature is front-end.
- **Pure core, testable in node:** put the macro as a pure planner in
  `public/js/replay.js`, e.g. `replayPlan({ autoShow, showDelayMs, autoDismiss,
  dismissDelayMs })` → an ordered list of steps `[{cmd:'meld.recordClip'},
  {wait: 600}, {cmd:'meld.replay.show'}, {wait: 10000},
  {cmd:'meld.replay.dismiss'}]`. Unit-test that shape in `test/frontend.test.js`
  (matches the existing `catalog.js` export-guard pattern — no browser needed).
- **Runner + UI stay thin:** a separate function walks the plan, POSTing each `cmd`
  to `/api/command` and honoring `wait` (with the countdown pill + cancel/extend).
  Keep DOM/timer code out of the pure planner so tests don't need jsdom.
- **Countdown owns only our timer** — expose cancel/extend; never claim to know
  Meld's real replay state (see caveat above).
- Keep the three raw buttons in `COMMAND_GROUPS` as-is; the panel is additive.
