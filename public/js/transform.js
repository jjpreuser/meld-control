// Visual layer transform editor (Feature 1). Renders a scaled 16:9 stage inside a
// layer card with a draggable / resizable / rotatable box, and writes geometry
// back via setProperty (batched). setProperty is Meld API v2+, so render-layers
// only emits the stage when apiVersion >= 2.
//
// Ref: WebChannel API — Property Management (setProperty).
// https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md#property-management
//
// Coordinate model (ASSUMPTION — verify against your Meld build):
//   * The scene canvas is TRANSFORM_CANVAS_W x TRANSFORM_CANVAS_H pixels.
//   * A layer's x,y is its TOP-LEFT in those pixels; rotation is degrees about
//     the layer's centre.
// If your build differs, adjust the two constants / the origin math below.

const TRANSFORM_CANVAS_W = 1920;
const TRANSFORM_CANVAS_H = 1080;
const TRANSFORM_MIN = 8;            // smallest width/height in canvas px
const TRANSFORM_POST_MS = 60;       // debounce for in-drag batch POSTs

const num = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

// Build the stage markup for one layer card. All sibling layers in the scene are
// drawn as faint outlines for context; the edited layer gets the active handles.
function transformStage(layerId) {
  const layers = Object.entries(session.items || {})
    .filter(([, v]) => v.type === 'layer' && v.parent === selectedSceneId)
    .sort((a, b) => (a[1].index || 0) - (b[1].index || 0));

  const boxes = layers.map(([id, l]) => {
    const style = boxStyle(l);
    if (id !== layerId) return `<div class="transform-box" style="${style}"></div>`;
    return `
      <div class="transform-box active" data-transform-box="${id}" style="${style}">
        <span class="tb-rotate" data-handle="rotate"></span>
        <span class="tb-handle tb-nw" data-handle="nw"></span>
        <span class="tb-handle tb-ne" data-handle="ne"></span>
        <span class="tb-handle tb-sw" data-handle="sw"></span>
        <span class="tb-handle tb-se" data-handle="se"></span>
      </div>`;
  }).join('');

  return `<div class="transform-stage" data-transform-stage="${layerId}">${boxes}</div>`;
}

function boxStyle(l) {
  const left = (num(l.x) / TRANSFORM_CANVAS_W) * 100;
  const top = (num(l.y) / TRANSFORM_CANVAS_H) * 100;
  const w = (num(l.width) / TRANSFORM_CANVAS_W) * 100;
  const h = (num(l.height) / TRANSFORM_CANVAS_H) * 100;
  return `left:${left}%;top:${top}%;width:${w}%;height:${h}%;transform:rotate(${num(l.rotation)}deg)`;
}

// ---- interaction -----------------------------------------------------------

let tDrag = null;          // active gesture state, or null
let tPostTimer = null;

const rad = (deg) => (deg * Math.PI) / 180;
// Rotate vector (vx,vy) by `a` radians.
const rot = (vx, vy, a) => ({
  x: vx * Math.cos(a) - vy * Math.sin(a),
  y: vx * Math.sin(a) + vy * Math.cos(a),
});

document.addEventListener('pointerdown', (e) => {
  const handleEl = e.target.closest('[data-handle]');
  const boxEl = e.target.closest('.transform-box.active');
  if (!boxEl) return;
  const stage = boxEl.closest('.transform-stage');
  if (!stage) return;
  const layerId = boxEl.dataset.transformBox;
  const layer = session.items && session.items[layerId];
  if (!layer) return;

  e.preventDefault();
  const rect = stage.getBoundingClientRect();
  const sx = TRANSFORM_CANVAS_W / rect.width;   // px(screen) -> canvas units
  const sy = TRANSFORM_CANVAS_H / rect.height;
  const p0 = { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };

  const g0 = { x: num(layer.x), y: num(layer.y), w: num(layer.width), h: num(layer.height), rot: num(layer.rotation) };
  const center = { x: g0.x + g0.w / 2, y: g0.y + g0.h / 2 };
  const mode = handleEl ? (handleEl.dataset.handle === 'rotate' ? 'rotate' : 'resize') : 'move';

  let oppWorld = null;
  if (mode === 'resize') {
    // World position of the corner opposite the grabbed one — held fixed.
    const handle = handleEl.dataset.handle;
    const opp = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' }[handle];
    const localSign = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] }[opp];
    const local = { x: (localSign[0] * g0.w) / 2, y: (localSign[1] * g0.h) / 2 };
    const wr = rot(local.x, local.y, rad(g0.rot));
    oppWorld = { x: center.x + wr.x, y: center.y + wr.y };
  }

  tDrag = { mode, layerId, box: boxEl, stage, rect, sx, sy, p0, g0, center, oppWorld, handle: handleEl?.dataset.handle };
  transformDragging = true;
  boxEl.classList.add('dragging');
  window.addEventListener('pointermove', onTransformMove);
  window.addEventListener('pointerup', onTransformUp, { once: true });
});

function onTransformMove(e) {
  if (!tDrag) return;
  const p = {
    x: (e.clientX - tDrag.rect.left) * tDrag.sx,
    y: (e.clientY - tDrag.rect.top) * tDrag.sy,
  };
  const g0 = tDrag.g0;
  let g;

  if (tDrag.mode === 'move') {
    g = { ...g0, x: g0.x + (p.x - tDrag.p0.x), y: g0.y + (p.y - tDrag.p0.y) };
  } else if (tDrag.mode === 'rotate') {
    const ang = Math.atan2(p.y - tDrag.center.y, p.x - tDrag.center.x);
    // Handle sits above the top edge (points along -Y), so add 90°.
    let deg = (ang * 180) / Math.PI + 90;
    deg = Math.round(deg * 10) / 10;
    g = { ...g0, rot: deg };
  } else {
    // resize: express pointer in the box's local (unrotated) frame, opposite
    // corner pinned at oppWorld.
    const d = { x: p.x - tDrag.oppWorld.x, y: p.y - tDrag.oppWorld.y };
    const local = rot(d.x, d.y, rad(-g0.rot));
    const w = Math.max(TRANSFORM_MIN, Math.abs(local.x));
    const h = Math.max(TRANSFORM_MIN, Math.abs(local.y));
    const half = rot((Math.sign(local.x) * w) / 2, (Math.sign(local.y) * h) / 2, rad(g0.rot));
    const cx = tDrag.oppWorld.x + half.x;
    const cy = tDrag.oppWorld.y + half.y;
    g = { x: cx - w / 2, y: cy - h / 2, w, h, rot: g0.rot };
  }

  tDrag.g = g;
  applyGeom(tDrag.box, g);
  syncInputs(tDrag.layerId, g);

  clearTimeout(tPostTimer);
  tPostTimer = setTimeout(() => postGeom(tDrag.layerId, g), TRANSFORM_POST_MS);
}

function onTransformUp() {
  window.removeEventListener('pointermove', onTransformMove);
  const d = tDrag;
  transformDragging = false;
  if (d) {
    d.box.classList.remove('dragging');
    clearTimeout(tPostTimer);
    if (d.g) postGeom(d.layerId, d.g);   // flush final position
  }
  tDrag = null;
  // Redraw from whatever the bridge echoes back (sessionChanged), now unblocked.
  setTimeout(renderLayers, 250);
}

function applyGeom(box, g) {
  box.style.left = (g.x / TRANSFORM_CANVAS_W) * 100 + '%';
  box.style.top = (g.y / TRANSFORM_CANVAS_H) * 100 + '%';
  box.style.width = (g.w / TRANSFORM_CANVAS_W) * 100 + '%';
  box.style.height = (g.h / TRANSFORM_CANVAS_H) * 100 + '%';
  box.style.transform = `rotate(${g.rot}deg)`;
}

// Keep the card's numeric inputs in step with the drag.
function syncInputs(layerId, g) {
  const map = { x: Math.round(g.x), y: Math.round(g.y), width: Math.round(g.w), height: Math.round(g.h), rotation: g.rot };
  for (const [prop, val] of Object.entries(map)) {
    const input = document.querySelector(`.layer-num[data-layer-id="${layerId}"][data-prop="${prop}"]`);
    if (input && document.activeElement !== input) input.value = val;
  }
}

function postGeom(layerId, g) {
  API.post(`/api/property/${layerId}/batch`, {
    props: {
      x: Math.round(g.x),
      y: Math.round(g.y),
      width: Math.round(g.w),
      height: Math.round(g.h),
      rotation: +g.rot.toFixed(2),
    },
  }).catch(() => {});
}
