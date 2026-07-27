// Feature 3 (deep dive) — Instant Replay panel + macro runner (browser side).
//
// The pure planner lives in replay.js; this drives it against POST /api/command
// and owns the auto-dismiss countdown UI. IMPORTANT: the countdown reflects OUR
// timer only — Meld exposes no replay state, so we never claim to know whether a
// replay is truly on screen (see REPLAY_PLAN.md). If the user dismisses inside
// Meld, our countdown keeps running harmlessly and just fires a no-op dismiss.

let replayRunToken = 0;        // bumped on each run/cancel to invalidate the old run
let replayCountdownInt = null; // handle for the 1s countdown tick
let replayExtendFn = () => {}; // rebound while a countdown is live (+10s)
let replayDismissFn = () => {}; // rebound while a countdown is live (dismiss now)

function renderReplay() {
  const el = $('replayPanel');
  if (!el) return;
  const sec = clampDismissSec(replaySettings.dismissSec);
  el.innerHTML = `
    <div class="replay-head">
      <span class="replay-title">Instant Replay</span>
      <span class="replay-hint">Save · show · auto-dismiss — one tap</span>
    </div>
    <button class="btn btn-replay-go" data-action="instant-replay">▶ Instant Replay</button>
    <div class="replay-opts">
      <label class="replay-opt">
        <input type="checkbox" id="replayAutoDismiss" ${replaySettings.autoDismiss ? 'checked' : ''}>
        Auto-dismiss after
      </label>
      <input type="number" id="replayDismissSec" class="replay-sec" min="1" max="120"
             value="${sec}" ${replaySettings.autoDismiss ? '' : 'disabled'}>
      <span class="replay-unit">s</span>
    </div>
    <div class="replay-status" id="replayStatus" aria-live="polite"></div>
    <p class="replay-note">Clip length is set in Meld's own replay settings — the API
      can't change it here.</p>
  `;
}

function replayStepLabel(cmd) {
  return {
    'meld.recordClip': 'Saving clip…',
    'meld.replay.show': 'Showing replay',
    'meld.replay.dismiss': 'Dismissing replay',
  }[cmd] || cmd;
}

function setReplayStatus(text, clearAfterMs) {
  const s = $('replayStatus');
  if (!s) return;
  s.textContent = text;
  if (clearAfterMs) setTimeout(() => { if (s.textContent === text) s.textContent = ''; }, clearAfterMs);
}

function renderReplayCountdown(secLeft) {
  const s = $('replayStatus');
  if (!s) return;
  s.innerHTML = `
    <span class="replay-count">On screen — auto-dismiss in ${secLeft}s</span>
    <button class="btn btn-sm" data-action="replay-extend">+10s</button>
    <button class="btn btn-sm btn-danger" data-action="replay-dismiss-now">Dismiss now</button>
  `;
}

function replayDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wait `ms` while showing a live countdown. Resolves early if this run was
// superseded (token changed) or the user hit "Dismiss now"; "+10s" pushes the
// deadline out. Deadline-based so extending is just arithmetic.
function replayCountdownWait(ms, token) {
  return new Promise((resolve) => {
    let deadline = Date.now() + ms;
    replayExtendFn = () => { deadline += 10000; };
    replayDismissFn = () => { deadline = 0; };
    clearInterval(replayCountdownInt);
    const tick = () => {
      if (token !== replayRunToken) { clearInterval(replayCountdownInt); return resolve(); }
      const left = Math.max(0, deadline - Date.now());
      renderReplayCountdown(Math.ceil(left / 1000));
      if (left <= 0) { clearInterval(replayCountdownInt); resolve(); }
    };
    replayCountdownInt = setInterval(tick, 250);
    tick();
  });
}

async function runInstantReplay() {
  const token = ++replayRunToken; // starting a run cancels any in-flight one
  const steps = replayPlan({
    autoShow: true,
    autoDismiss: replaySettings.autoDismiss,
    dismissDelayMs: clampDismissSec(replaySettings.dismissSec) * 1000,
  });
  const btn = document.querySelector('[data-action="instant-replay"]');
  if (btn) btn.disabled = true;
  try {
    for (const step of steps) {
      if (token !== replayRunToken) return; // superseded by a newer run
      if (step.cmd) {
        setReplayStatus(replayStepLabel(step.cmd));
        await API.post('/api/command', { command: step.cmd }).catch(() => {});
      } else if (step.countdown) {
        await replayCountdownWait(step.wait, token);
      } else if (step.wait) {
        await replayDelay(step.wait);
      }
    }
    if (token === replayRunToken) setReplayStatus('Replay dismissed', 1800);
  } finally {
    if (btn) btn.disabled = false;
    replayExtendFn = () => {};
    replayDismissFn = () => {};
  }
}
