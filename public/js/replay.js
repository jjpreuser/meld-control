// Feature 3 (deep dive) — Instant Replay macro planner (DOM-free, unit-tested).
//
// The Meld replay API is three fire-and-forget commands with ZERO readback
// (confirmed against the WebChannel docs — see REPLAY_PLAN.md):
//   meld.recordClip / meld.replay.show / meld.replay.dismiss — no params, no
//   state signal, no clip list. So "instant replay" is pure client-side
//   sequencing: save a clip, show it after a short delay (the clip needs a beat
//   to finalize and there is no "clip ready" signal), then auto-dismiss after a
//   user-set delay.
//
// This file is the pure planner: options -> ordered step list. It runs
// identically in the browser and under `node --test` (the module.exports guard
// at the bottom is a no-op in the browser). The browser-only runner + countdown
// UI live in render-replay.js and drive these steps via POST /api/command.

const REPLAY_DEFAULTS = {
  autoShow: true,       // recordClip is always sent; also show the replay after it
  showDelayMs: 600,     // gap between recordClip and replay.show (tune vs live Meld)
  autoDismiss: true,    // fire replay.dismiss after the clip has been on screen
  dismissDelayMs: 15000, // user-editable; default 15s per spec
};

// Clamp a user-entered auto-dismiss value (seconds) to a sane range. Non-numbers
// fall back to the default; result is a whole number of seconds in [1, 120].
function clampDismissSec(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return REPLAY_DEFAULTS.dismissDelayMs / 1000;
  return Math.min(120, Math.max(1, Math.round(n)));
}

// Pure planner. Returns an ordered list where each step is either:
//   { cmd }              -> POST /api/command { command: cmd }
//   { wait }             -> pause for `wait` ms
//   { wait, countdown }  -> pause for `wait` ms, showing the auto-dismiss countdown
function replayPlan(opts) {
  const o = Object.assign({}, REPLAY_DEFAULTS, opts || {});
  const steps = [{ cmd: 'meld.recordClip' }];
  if (o.autoShow) {
    if (o.showDelayMs > 0) steps.push({ wait: o.showDelayMs });
    steps.push({ cmd: 'meld.replay.show' });
    if (o.autoDismiss) {
      if (o.dismissDelayMs > 0) steps.push({ wait: o.dismissDelayMs, countdown: true });
      steps.push({ cmd: 'meld.replay.dismiss' });
    }
  }
  return steps;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { REPLAY_DEFAULTS, clampDismissSec, replayPlan };
}
