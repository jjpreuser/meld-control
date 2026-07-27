# Feature 3 (deep dive) — Clip & Replay

A working doc to develop the clip/replay workflow further. The basic one-tap
commands already ship in the Commands tab; this is where we design what "deeper"
looks like. Edit freely.

**Status:** command buttons live; deeper workflow = TBD.
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

## Known API limits (from the docs)

- `meld.replay.show` only targets the **last** clip — no clip id / picker.
- No signal or property reports replay state (on-screen? which clip? duration?).
- No list of saved clips is exposed.
- Everything is one-shot; there is no "record N seconds" parameter.

> Verify against the live build with `GET /api/debug/meld` — there may be
> undocumented replay properties/signals we could bind (e.g. a replay-active
> flag). Record anything found here.

## Open questions (fill in)

- [ ] What is the real streamer workflow? e.g. *big moment happens → tap Save Clip
      → tap Show Replay → auto-dismiss after N s.*
- [ ] Do we want an **auto-show after save** toggle (Save Clip immediately followed
      by Show Replay)?
- [ ] Do we want a **timed auto-dismiss** (show, then fire `replay.dismiss` after a
      configurable delay)?
- [ ] Is a bigger, dedicated **Replay panel** wanted (large Save / Show / Dismiss
      buttons + a countdown while shown), separate from the general command grid?
- [ ] Does the live `meld` object expose any replay state we can reflect (so Show
      can disable when nothing's clipped, Dismiss when nothing's shown)?

## Ideas / candidate builds

1. **Replay macro button** — one button that does Save → wait → Show, with a small
   settings row (buffer length is Meld-side, so this is just command sequencing).
2. **Auto-dismiss timer** — after Show Replay, start a client-side timer that fires
   `meld.replay.dismiss` after e.g. 15s; show a countdown. Purely client-side, no
   new API.
3. **Dedicated Replay card** — its own section/panel with large touch targets for
   a phone-as-deck use case.
4. **State-aware buttons** — *only if* discovery finds a replay-state property/
   signal; otherwise buttons stay stateless.

## Implementation notes (when we build)

- No bridge changes needed for command sequencing — reuse `POST /api/command`.
- Put any macro/sequence logic in a small `public/js/replay.js`; keep the raw
  buttons in the catalog.
- Add tests: sequence/timer logic should be a pure function (e.g. "given these
  toggles, emit this ordered list of commands") so it unit-tests in
  `test/frontend.test.js` without a browser, matching the existing pattern.
- If discovery reveals replay state, add a bridge broadcast like the existing
  `isStreaming` one and reflect it in the buttons.
