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
  const p = replaySettings.position;
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
    <div class="replay-opts">
      <label class="replay-opt">
        <input type="checkbox" id="replayPosEnabled" ${p.enabled ? 'checked' : ''}>
        Position replay <span class="replay-unit">(px on 1920×1080)</span>
      </label>
    </div>
    ${p.enabled ? `
      ${replayStageHtml()}
      <div class="transform-hint">Drag to place · drag a corner to resize.</div>
      <div class="replay-pos">
        <label class="replay-field">X <input type="number" id="replayPosX" class="replay-num" value="${p.x}"></label>
        <label class="replay-field">Y <input type="number" id="replayPosY" class="replay-num" value="${p.y}"></label>
        <label class="replay-field">W <input type="number" id="replayPosW" class="replay-num" value="${p.width}"></label>
        <label class="replay-field">H <input type="number" id="replayPosH" class="replay-num" value="${p.height}"></label>
      </div>` : ''}
    <div class="replay-status" id="replayStatus" aria-live="polite"></div>
    <p class="replay-note">Clip length is set in Meld's own replay settings — the API
      can't change it here. Positioning moves the item that appears when the replay
      shows; if your build doesn't expose it, the replay still plays (just unmoved).</p>
  `;
}

// ---- visual position editor ------------------------------------------------
// A drag/resize box bound to the replay POSITION PRESET (replaySettings.position),
// not a live layer — the preset is applied later, when the replay appears. Reuses
// the transform editor's stage/box/handle CSS and its 1920x1080 canvas model
// (TRANSFORM_CANVAS_W/H, TRANSFORM_MIN, num() are globals from transform.js, which
// loads first). No rotation: a replay PiP only needs move + resize.

function replayStageHtml() {
  const p = replaySettings.position;
  const left = (num(p.x) / TRANSFORM_CANVAS_W) * 100;
  const top = (num(p.y) / TRANSFORM_CANVAS_H) * 100;
  const w = (num(p.width) / TRANSFORM_CANVAS_W) * 100;
  const h = (num(p.height) / TRANSFORM_CANVAS_H) * 100;
  return `
    <div class="transform-stage replay-stage" data-replay-stage>
      <div class="transform-box active" data-replay-box
           style="left:${left}%;top:${top}%;width:${w}%;height:${h}%">
        <span class="tb-handle tb-nw" data-rhandle="nw"></span>
        <span class="tb-handle tb-ne" data-rhandle="ne"></span>
        <span class="tb-handle tb-sw" data-rhandle="sw"></span>
        <span class="tb-handle tb-se" data-rhandle="se"></span>
      </div>
    </div>`;
}

function clampReplayGeom(g) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const w = clamp(g.w, TRANSFORM_MIN, TRANSFORM_CANVAS_W);
  const h = clamp(g.h, TRANSFORM_MIN, TRANSFORM_CANVAS_H);
  return {
    x: clamp(g.x, 0, TRANSFORM_CANVAS_W - w),
    y: clamp(g.y, 0, TRANSFORM_CANVAS_H - h),
    w, h,
  };
}

// Live update during a drag: move the box, store the preset, and mirror the
// numeric inputs (skipping any the user is actively editing).
function applyReplayBox(g) {
  const box = document.querySelector('[data-replay-box]');
  if (box) {
    box.style.left = (g.x / TRANSFORM_CANVAS_W) * 100 + '%';
    box.style.top = (g.y / TRANSFORM_CANVAS_H) * 100 + '%';
    box.style.width = (g.w / TRANSFORM_CANVAS_W) * 100 + '%';
    box.style.height = (g.h / TRANSFORM_CANVAS_H) * 100 + '%';
  }
  const p = replaySettings.position;
  p.x = Math.round(g.x); p.y = Math.round(g.y);
  p.width = Math.round(g.w); p.height = Math.round(g.h);
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = v;
  };
  set('replayPosX', p.x); set('replayPosY', p.y);
  set('replayPosW', p.width); set('replayPosH', p.height);
}

let rDrag = null; // active replay-box gesture, or null

document.addEventListener('pointerdown', (e) => {
  const boxEl = e.target.closest('[data-replay-box]');
  if (!boxEl) return;
  const stage = boxEl.closest('[data-replay-stage]');
  if (!stage) return;
  e.preventDefault();

  const rect = stage.getBoundingClientRect();
  const sx = TRANSFORM_CANVAS_W / rect.width;   // screen px -> canvas units
  const sy = TRANSFORM_CANVAS_H / rect.height;
  const p0 = { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  const pos = replaySettings.position;
  const g0 = { x: num(pos.x), y: num(pos.y), w: num(pos.width), h: num(pos.height) };

  const handleEl = e.target.closest('[data-rhandle]');
  const mode = handleEl ? 'resize' : 'move';
  // For a resize, the corner OPPOSITE the grabbed one stays pinned.
  const fixed = handleEl ? {
    nw: { x: g0.x + g0.w, y: g0.y + g0.h },
    ne: { x: g0.x,        y: g0.y + g0.h },
    sw: { x: g0.x + g0.w, y: g0.y },
    se: { x: g0.x,        y: g0.y },
  }[handleEl.dataset.rhandle] : null;

  rDrag = { mode, rect, sx, sy, p0, g0, fixed, box: boxEl };
  boxEl.classList.add('dragging');
  window.addEventListener('pointermove', onReplayMove);
  window.addEventListener('pointerup', onReplayUp, { once: true });
});

function onReplayMove(e) {
  if (!rDrag) return;
  const p = {
    x: (e.clientX - rDrag.rect.left) * rDrag.sx,
    y: (e.clientY - rDrag.rect.top) * rDrag.sy,
  };
  let g;
  if (rDrag.mode === 'move') {
    g = { x: rDrag.g0.x + (p.x - rDrag.p0.x), y: rDrag.g0.y + (p.y - rDrag.p0.y), w: rDrag.g0.w, h: rDrag.g0.h };
  } else {
    const f = rDrag.fixed;
    g = {
      x: Math.min(p.x, f.x),
      y: Math.min(p.y, f.y),
      w: Math.max(TRANSFORM_MIN, Math.abs(p.x - f.x)),
      h: Math.max(TRANSFORM_MIN, Math.abs(p.y - f.y)),
    };
  }
  applyReplayBox(clampReplayGeom(g));
}

function onReplayUp() {
  window.removeEventListener('pointermove', onReplayMove);
  if (rDrag && rDrag.box) rDrag.box.classList.remove('dragging');
  rDrag = null;
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

// Snapshot session items straight from the bridge (fresher than the WS-updated
// global) so we can diff after replay.show to find the new replay layer.
async function replaySessionItems() {
  try {
    const d = await API.get('/api/session');
    return (d && d.session && d.session.items) || {};
  } catch {
    return (session && session.items) || {};
  }
}

// Best-effort: find the item that appeared when replay.show fired and move it to
// the preset position. If nothing new is found, the replay still plays — we just
// tell the user we couldn't place it (Meld exposes no replay id to target).
async function positionReplayLayer(beforeItems, pos) {
  setReplayStatus('Positioning replay…');
  const afterItems = await replaySessionItems();
  const id = pickNewItemId(beforeItems, afterItems);
  if (!id) {
    setReplayStatus('Replay shown — couldn’t find a layer to position', 3000);
    return;
  }
  await API.post(`/api/property/${id}/batch`, {
    props: {
      x: Math.round(pos.x), y: Math.round(pos.y),
      width: Math.round(pos.width), height: Math.round(pos.height),
    },
  }).catch(() => {});
}

async function runInstantReplay() {
  const token = ++replayRunToken; // starting a run cancels any in-flight one
  const posOn = replaySettings.position.enabled;
  const steps = replayPlan({
    autoShow: true,
    autoDismiss: replaySettings.autoDismiss,
    dismissDelayMs: clampDismissSec(replaySettings.dismissSec) * 1000,
    position: posOn ? replaySettings.position : null,
  });
  const btn = document.querySelector('[data-action="instant-replay"]');
  if (btn) btn.disabled = true;
  let beforeItems = null; // session snapshot captured just before replay.show
  try {
    for (const step of steps) {
      if (token !== replayRunToken) return; // superseded by a newer run
      if (step.cmd) {
        // Snapshot right before showing so we can diff for the new replay layer.
        if (step.cmd === 'meld.replay.show' && posOn) beforeItems = await replaySessionItems();
        setReplayStatus(replayStepLabel(step.cmd));
        await API.post('/api/command', { command: step.cmd }).catch(() => {});
      } else if (step.setPosition) {
        await positionReplayLayer(beforeItems, step.setPosition);
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
