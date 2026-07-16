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

  // Skip entirely when the Layers tab isn't showing — no point rebuilding a
  // hidden list on every session update. showTab() re-renders it when opened.
  if (!$('tab-layers').classList.contains('active')) return;

  // Don't rebuild the layers list while the user is editing one of its inputs,
  // or their keystrokes get wiped out by the re-render.
  const active = document.activeElement;
  if (active && container.contains(active)) return;

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
            ${track ? `<button class="btn btn-sm ${track.muted ? 'btn-danger' : 'btn-outline'}" data-action="mute" data-track-id="${track.id}">${track.muted ? 'Muted' : 'Mute'}</button>` : ''}
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
}

// Gain is a linear multiplier (1.0 = unity / 0 dB). The slider attenuates from
// silence up to unity; discovery (Phase 2a #8) may widen the max if Meld reports
// boost above 1.0 — GAIN_MAX is the one knob to change if so.
const GAIN_MAX = 1;
const gainPct = (g) => `${Math.round((g == null ? 1 : g) * 100)}%`;

function renderAudio() {
  const container = $('trackList');

  // Skip when the Audio tab isn't showing; showTab() draws it when opened.
  if (!$('tab-audio').classList.contains('active')) return;

  // Don't rebuild while a fader is being dragged (or a card focused) — it would
  // snap the slider back mid-gesture.
  const active = document.activeElement;
  if (active && container.contains(active)) return;

  const tracks = Object.entries(session.items || {})
    .filter(([, v]) => v.type === 'track')
    .sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));

  container.innerHTML = tracks.map(([id, track]) => {
    const isGlobal = !track.parent;
    const icon = isGlobal ? '🎤' : '🔊';
    const sceneName = track.parent ? (session.items[track.parent]?.name || '') : '';
    const gain = track.gain == null ? 1 : track.gain;
    return `
      <div class="card track-card" data-id="${id}">
        <div class="card-body">
          <span class="card-name">${icon} ${escHtml(track.name)}</span>
          ${sceneName ? `<span class="card-badge">${escHtml(sceneName)}</span>` : '<span class="card-badge global">Global</span>'}
        </div>
        <div class="track-fader">
          <input type="range" class="gain-slider" min="0" max="${GAIN_MAX}" step="0.01" value="${gain}" data-track-id="${id}" aria-label="Gain for ${escHtml(track.name)}">
          <span class="gain-readout" data-gain-readout="${id}">${gainPct(gain)}</span>
        </div>
        <div class="card-actions">
          <button class="btn btn-sm ${track.muted ? 'btn-danger active' : 'btn-outline'}" data-action="mute" data-track-id="${id}">${track.muted ? 'Muted' : 'Mute'}</button>
          <button class="btn btn-sm ${track.monitoring ? 'btn-warning active' : 'btn-outline'}" data-action="monitor" data-track-id="${id}">${track.monitoring ? 'Listening' : 'Monitor'}</button>
        </div>
      </div>
    `;
  }).join('');
}

// Live-update one track card in place from a WS `gain` message, without rebuilding
// the whole list (which would clobber a fader the user is mid-drag on).
function updateTrackCard(trackId, gain, muted) {
  const card = document.querySelector(`.track-card[data-id="${trackId}"]`);
  if (!card) return;
  const slider = card.querySelector('.gain-slider');
  const readout = card.querySelector(`[data-gain-readout="${trackId}"]`);
  if (gain != null && slider && document.activeElement !== slider) {
    slider.value = gain;
    if (readout) readout.textContent = gainPct(gain);
  }
  if (muted != null) {
    const muteBtn = card.querySelector('[data-action="mute"]');
    if (muteBtn) {
      muteBtn.textContent = muted ? 'Muted' : 'Mute';
      muteBtn.className = `btn btn-sm ${muted ? 'btn-danger active' : 'btn-outline'}`;
    }
  }
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
