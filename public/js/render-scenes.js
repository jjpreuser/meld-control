// Renders the Scenes tab grid + the LIVE/NEXT scene bus, and the 1s timer tick.

function renderScenes() {
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
