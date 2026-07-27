// Renders the Scenes tab grid + the LIVE/NEXT scene bus, and the 1s timer tick.
// Two modes (Feature 5): "simple" tap-to-switch cards, and "switcher" — a
// vision-mixer PGM/PVW layout with a TAKE button.

function renderScenes() {
  // Reflect the active mode on the toggle buttons, if present.
  const modeBar = $('sceneModeToggle');
  if (modeBar) {
    modeBar.querySelectorAll('[data-scene-mode]').forEach(b =>
      b.classList.toggle('active', b.dataset.sceneMode === sceneMode));
  }
  const simple = $('sceneList');
  const switcher = $('sceneSwitcher');
  if (simple) simple.classList.toggle('hidden', sceneMode === 'switcher');
  if (switcher) switcher.classList.toggle('hidden', sceneMode !== 'switcher');

  if (sceneMode === 'switcher') return renderSwitcher();
  return renderSimpleScenes();
}

function renderSimpleScenes() {
  const container = $('sceneList');
  const scenes = Object.entries(session.items || {})
    .filter(([, v]) => v.type === 'scene')
    .sort((a, b) => (a[1].index || 0) - (b[1].index || 0));

  container.innerHTML = scenes.map(([id, scene]) => {
    const isCurrent = scene.current ? 'current' : '';
    const isStaged = scene.staged ? 'staged' : '';
    const elapsed = scene.current && sceneTimers[id] ? formatTime(sceneTimers[id]) : '';
    return `
      <div class="scene-card ${isCurrent} ${isStaged}" data-id="${id}">
        <div class="scene-card-body" data-action="layers">
          <div class="scene-card-icon">${getSceneIcon(scene)}</div>
          <div class="scene-card-name">${escHtml(scene.name || `Scene ${scene.index}`)}</div>
          <div class="scene-card-index">Scene ${scene.index}</div>
          ${elapsed ? `<div class="scene-card-timer">${elapsed}</div>` : ''}
        </div>
        <div class="scene-card-actions">
          <button class="btn btn-sm ${isCurrent ? 'btn-primary' : 'btn-outline'}" data-action="show">${isCurrent ? 'Live' : 'Switch'}</button>
          <button class="btn btn-sm ${isStaged ? 'btn-warning' : 'btn-outline'}" data-action="stage">${isStaged ? 'Staged' : 'Stage'}</button>
        </div>
      </div>
    `;
  }).join('');
}

// Feature 5 — PGM/PVW switcher: a Preview column (click to stage) and a Program
// column (read-only, shows what's live), plus a TAKE button that cuts staged →
// program via showStagedScene().
function renderSwitcher() {
  const container = $('sceneSwitcher');
  if (!container) return;
  const { program, preview, scenes } = busScenes(session.items || {});

  const col = (side, activeId) => scenes.map(([id, s]) => {
    const on = id === activeId;
    const cls = side === 'pgm' ? (on ? 'pgm-on' : '') : (on ? 'pvw-on' : '');
    // Program column is display-only; Preview column stages on click.
    const attrs = side === 'pvw' ? `data-action="stage" data-id="${id}"` : '';
    return `<button class="switcher-scene ${cls}" ${attrs}>${escHtml(s.name || `Scene ${s.index}`)}</button>`;
  }).join('');

  container.innerHTML = `
    <div class="switcher-cols">
      <div class="switcher-col pvw">
        <div class="switcher-col-title pvw">PREVIEW</div>
        <div class="switcher-col-list">${col('pvw', preview ? preview[0] : null)}</div>
      </div>
      <div class="switcher-take">
        <button class="btn btn-take" id="btnTake" ${preview ? '' : 'disabled'}>TAKE</button>
      </div>
      <div class="switcher-col pgm">
        <div class="switcher-col-title pgm">PROGRAM</div>
        <div class="switcher-col-list">${col('pgm', program ? program[0] : null)}</div>
      </div>
    </div>
  `;
}

function renderBus() {
  const bus = $('sceneBus');
  const scenes = Object.entries(session.items || {})
    .filter(([, v]) => v.type === 'scene');

  const current = scenes.find(([, v]) => v.current);
  const staged = scenes.find(([, v]) => v.staged);

  $('busLiveName').textContent = current ? escHtml(current[1].name) : '—';
  $('busNextName').textContent = staged ? escHtml(staged[1].name) : '—';

  const timer = current && sceneTimers[current[0]] ? formatTime(sceneTimers[current[0]]) : '';
  $('busLiveTimer').textContent = timer;

  const btnNext = $('btnShowNext');
  btnNext.disabled = !staged;

  bus.classList.toggle('hidden', scenes.length === 0);
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    renderScenes();
    renderBus();
  }, 1000);
}
