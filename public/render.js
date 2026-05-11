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

function renderLayers() {
  const container = $('layerList');
  const header = $('layerHeader');
  const title = $('layerSceneName');
  const picker = $('scenePicker');

  const scenes = Object.entries(session.items || {})
    .filter(([, v]) => v.type === 'scene')
    .sort((a, b) => (a[1].index || 0) - (b[1].index || 0));

  picker.innerHTML = scenes.map(([id, s]) => `
    <button class="btn btn-sm ${id === selectedSceneId ? 'btn-primary' : 'btn-outline'}" data-action="pick-scene" data-scene-id="${id}">${escHtml(s.name || `Scene ${s.index}`)}</button>
  `).join('');

  if (!selectedSceneId) {
    container.innerHTML = '<p class="empty">Select a scene to view layers</p>';
    header.classList.add('hidden');
    return;
  }

  const scene = session.items[selectedSceneId];
  if (!scene) {
    container.innerHTML = '<p class="empty">Scene not found</p>';
    header.classList.add('hidden');
    return;
  }

  header.classList.remove('hidden');
  title.textContent = escHtml(scene.name);

  const layerItems = Object.entries(session.items || {})
    .filter(([, v]) => v.type === 'layer' && v.parent === selectedSceneId)
    .sort((a, b) => (a[1].index || 0) - (b[1].index || 0));

  const trackItems = Object.entries(session.items || {})
    .filter(([, v]) => v.type === 'track' && v.parent === selectedSceneId);

  const effectItems = Object.entries(session.items || {})
    .filter(([, v]) => v.type === 'effect');

  const layerTrackMap = {};
  for (const [id, track] of trackItems) {
    layerTrackMap[track.parent] = { id, ...track };
  }

  const layerEffectMap = {};
  for (const [id, effect] of effectItems) {
    if (!layerEffectMap[effect.parent]) layerEffectMap[effect.parent] = [];
    layerEffectMap[effect.parent].push({ id, ...effect });
  }

  container.innerHTML = layerItems.map(([id, layer], idx) => {
    const track = layerTrackMap[id];
    const effects = layerEffectMap[id] || [];
    const icon = layer.source ? '🖼️' : layer.url ? '🌐' : layer.mediaSource ? '🎬' : '📄';
    const sourceType = layer.source ? 'Image' : layer.url ? 'Browser' : layer.mediaSource ? 'Media' : 'Source';

    const coreProps = new Set(['type', 'parent', 'index', 'name', 'x', 'y', 'width', 'height', 'rotation', 'visible', 'isEffectivelyVisible']);
    const extraProps = Object.entries(layer).filter(([k]) => !coreProps.has(k));
    const isOpen = expandedProps[id];
    const effectsOpen = expandedProps[`${id}-effects`];

    return `
      <div class="card layer-card" data-id="${id}">
        <div class="layer-head">
          <span class="layer-idx">${idx + 1}</span>
          ${icon}
          <input class="layer-name-input" value="${escHtml(layer.name || 'Untitled')}" data-layer-id="${id}" data-prop="name">
          <span class="card-badge">${sourceType}</span>
        </div>
        <div class="layer-section">
          <div class="layer-section-title">Position</div>
          <div class="layer-geo-grid">
            <label class="layer-num-wrap">X <input type="number" class="layer-num" value="${layer.x}" data-layer-id="${id}" data-prop="x"></label>
            <label class="layer-num-wrap">Y <input type="number" class="layer-num" value="${layer.y}" data-layer-id="${id}" data-prop="y"></label>
          </div>
        </div>
        <div class="layer-section">
          <div class="layer-section-title">Size</div>
          <div class="layer-geo-grid">
            <label class="layer-num-wrap">W <input type="number" class="layer-num" value="${layer.width}" data-layer-id="${id}" data-prop="width"></label>
            <label class="layer-num-wrap">H <input type="number" class="layer-num" value="${layer.height}" data-layer-id="${id}" data-prop="height"></label>
          </div>
        </div>
        <div class="layer-section">
          <div class="layer-section-title">Transform</div>
          <div class="layer-geo-grid">
            <label class="layer-num-wrap">↻ <input type="number" class="layer-num" value="${layer.rotation || 0}" data-layer-id="${id}" data-prop="rotation" step="0.1"></label>
          </div>
        </div>
        <div class="layer-section">
          <div class="card-actions">
            <button class="btn btn-sm ${layer.visible ? 'btn-primary active' : 'btn-outline'}" data-action="toggle-vis">${layer.visible ? 'Visible' : 'Hidden'}</button>
            ${track ? `<button class="btn btn-sm ${track.muted ? 'btn-danger' : 'btn-outline'}" data-action="track-mute" data-track-id="${track.id}">${track.muted ? 'Muted' : 'Mute'}</button>` : ''}
          </div>
        </div>
        ${extraProps.length ? `
        <div class="layer-fold" data-action="toggle-props" data-fold="${id}">
          <span class="layer-fold-icon">${isOpen ? '▼' : '▶'}</span>
          <span class="layer-fold-label">Properties (${extraProps.length})</span>
        </div>
        <div class="layer-fold-body ${isOpen ? '' : 'hidden'}" data-fold-body="${id}">
          ${extraProps.map(([k, v]) => `
          <label class="layer-prop-row"><span class="layer-prop-key">${k}</span> <input class="layer-prop-val" value="${escHtml(String(v))}" data-layer-id="${id}" data-prop="${k}"></label>
          `).join('')}
        </div>` : ''}
        ${effects.length ? `
        <div class="layer-fold" data-action="toggle-effects" data-fold="${id}-effects">
          <span class="layer-fold-icon">${effectsOpen ? '▼' : '▶'}</span>
          <span class="layer-fold-label">Effects (${effects.length})</span>
        </div>
        <div class="layer-fold-body ${effectsOpen ? '' : 'hidden'}" data-fold-body="${id}-effects">
          <div class="layer-effects">${effects.map(e => `
            <button class="btn btn-xs ${e.enabled ? 'btn-on' : 'btn-off'}" data-action="toggle-effect" data-layer-id="${id}" data-effect-id="${e.id}">${escHtml(e.name)}</button>
          `).join('')}</div>
        </div>` : ''}
      </div>
    `;
  }).join('');

  container.addEventListener('change', async (e) => {
    const input = e.target.closest('[data-prop]');
    if (!input) return;
    const layerId = input.dataset.layerId;
    const prop = input.dataset.prop;
    const value = input.type === 'number' ? parseFloat(input.value) : input.value;
    try {
      await API.post(`/api/property/${layerId}`, { property: prop, value });
      showToast(`${prop}: ${value}`);
    } catch {}
  });
}

function renderAudio() {
  const container = $('trackList');
  const tracks = Object.entries(session.items || {})
    .filter(([, v]) => v.type === 'track')
    .sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));

  container.innerHTML = tracks.map(([id, track]) => {
    const isGlobal = !track.parent;
    const icon = isGlobal ? '🎤' : '🔊';
    const sceneName = track.parent ? (session.items[track.parent]?.name || '') : '';
    return `
      <div class="card track-card" data-id="${id}">
        <div class="card-body">
          <span class="card-name">${icon} ${escHtml(track.name)}</span>
          ${sceneName ? `<span class="card-badge">${escHtml(sceneName)}</span>` : '<span class="card-badge global">Global</span>'}
        </div>
        <div class="card-actions">
          <button class="btn btn-sm ${track.muted ? 'btn-danger active' : 'btn-outline'}" data-action="mute" data-track-id="${id}">${track.muted ? 'Muted' : 'Mute'}</button>
          <button class="btn btn-sm ${track.monitoring ? 'btn-warning active' : 'btn-outline'}" data-action="monitor" data-track-id="${id}">${track.monitoring ? 'Listening' : 'Monitor'}</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderAll() {
  renderScenes();
  renderBus();
  renderLayers();
  renderAudio();
}

function applySession(data) {
  session = data.session || data;
  if (data.sceneTimers) sceneTimers = data.sceneTimers;
  renderAll();
  $('btnStream').textContent = data.isStreaming ? 'Stop Stream' : 'Start Stream';
  $('btnStream').className = `btn ${data.isStreaming ? 'btn-danger' : 'btn-stream'}`;
  $('btnRecord').textContent = data.isRecording ? 'Stop Record' : 'Start Record';
  $('btnRecord').className = `btn ${data.isRecording ? 'btn-danger' : 'btn-record'}`;
  setStatus(true, data.version);
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    renderScenes();
    renderBus();
  }, 1000);
}
