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
  // Preset on-screen position for the shown replay, or null to leave it where
  // Meld places it. Pixels on a 1920x1080 canvas (same model as the transform
  // editor). Applied by finding the item that appears when replay.show fires and
  // setProperty-ing its geometry — best effort, since Meld exposes no replay id.
  position: null,       // { x, y, width, height } | null
  positionDelayMs: 250, // gap after show before the replay item is in the session
};

// Coerce a position object to finite pixel numbers with sane fallbacks.
function sanitizePos(pos) {
  const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    x: n(pos && pos.x, 0),
    y: n(pos && pos.y, 0),
    width: n(pos && pos.width, 640),
    height: n(pos && pos.height, 360),
  };
}

// Given the session.items maps captured just BEFORE and just AFTER firing
// replay.show, return the id of a newly-appeared, positionable item (the replay
// layer). Prefers an added item that carries geometry, then one that looks
// replay-named; falls back to the first added id. null if nothing new appeared.
function pickNewItemId(beforeItems, afterItems) {
  beforeItems = beforeItems || {};
  afterItems = afterItems || {};
  const added = Object.keys(afterItems).filter((id) => !(id in beforeItems));
  if (!added.length) return null;
  const hasGeom = (it) => it && (it.width != null || it.height != null || it.x != null);
  const geom = added.filter((id) => hasGeom(afterItems[id]));
  const pool = geom.length ? geom : added;
  const replayish = pool.find((id) => {
    const it = afterItems[id] || {};
    return /replay/i.test(`${it.name || ''} ${it.type || ''}`);
  });
  return replayish || pool[0];
}

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
    if (o.position) {
      if (o.positionDelayMs > 0) steps.push({ wait: o.positionDelayMs });
      steps.push({ setPosition: sanitizePos(o.position) });
    }
    if (o.autoDismiss) {
      if (o.dismissDelayMs > 0) steps.push({ wait: o.dismissDelayMs, countdown: true });
      steps.push({ cmd: 'meld.replay.dismiss' });
    }
  }
  return steps;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { REPLAY_DEFAULTS, clampDismissSec, replayPlan, sanitizePos, pickNewItemId };
}
