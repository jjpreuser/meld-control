const API = (() => {
  const base = '';
  return {
    async get(path) {
      const r = await fetch(`${base}${path}`);
      return r.json();
    },
    async post(path, body) {
      const r = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return r.json();
    },
  };
})();

let session = { items: {} };
let selectedSceneId = null;
let sceneTimers = {};
let currentTransition = { type: 'cut', duration: 300 };
let timerInterval = null;

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('visible');
  setTimeout(() => {
    el.classList.remove('visible');
    el.classList.add('hidden');
  }, 2000);
}

function setStatus(connected, version) {
  const dot = $('statusDot');
  const text = $('statusText');
  if (connected) {
    dot.className = 'status-dot connected';
    text.textContent = 'Connected';
    $('versionBadge').textContent = `v${version || 1}`;
  } else {
    dot.className = 'status-dot disconnected';
    text.textContent = 'Disconnected';
  }
}

function getSceneIcon(scene) {
  if (scene.source) return '🖥️';
  if (scene.url) return '🌐';
  if (scene.mediaSource) return '🎬';
  return '📺';
}

function formatTime(ms) {
  if (!ms || ms <= 0) return '';
  const totalSec = Math.floor((Date.now() - ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
      <div class="scene-card ${isCurrent} ${isStaged}" data-id="${id}" data-action="show">
        <div class="scene-card-icon">${getSceneIcon(scene)}</div>
        <div class="scene-card-name">${escHtml(scene.name || `Scene ${scene.index}`)}</div>
        <div class="scene-card-index">Scene ${scene.index}</div>
        ${elapsed ? `<div class="scene-card-timer">${elapsed}</div>` : ''}
        <button class="btn btn-stage ${isStaged ? 'btn-warning' : 'btn-outline'}" data-action="stage">${isStaged ? 'Staged' : 'Stage'}</button>
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

  const layerTrackMap = {};
  for (const [id, track] of trackItems) {
    layerTrackMap[track.parent] = { id, ...track };
  }

  container.innerHTML = layerItems.map(([id, layer]) => {
    const track = layerTrackMap[id];
    const name = layer.source ? '🖼' : layer.url ? '🌐' : layer.mediaSource ? '🎬' : '📄';
    return `
      <div class="card layer-card" data-id="${id}">
        <div class="card-body">
          <span class="card-name">${name} ${escHtml(layer.name)}</span>
          <span class="card-dims">${layer.width}x${layer.height}</span>
        </div>
        <div class="card-actions">
          <button class="btn btn-sm ${layer.visible ? 'btn-primary active' : 'btn-outline'}" data-action="toggle-vis">${layer.visible ? 'Visible' : 'Hidden'}</button>
          ${track ? `<button class="btn btn-sm ${track.muted ? 'btn-danger' : 'btn-outline'}" data-action="track-mute" data-track-id="${track.id}">${track.muted ? 'Muted' : 'Mute'}</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
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

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function renderAll() {
  renderScenes();
  renderBus();
  if (selectedSceneId) renderLayers();
  renderAudio();
}

function applySession(data) {
  session = data.session || data;
  if (data.sceneTimers) sceneTimers = data.sceneTimers;
  if (data.transition) currentTransition = data.transition;
  renderAll();
  $('btnStream').textContent = data.isStreaming ? 'Stop Stream' : 'Start Stream';
  $('btnStream').className = `btn ${data.isStreaming ? 'btn-danger' : 'btn-stream'}`;
  $('btnRecord').textContent = data.isRecording ? 'Stop Record' : 'Start Record';
  $('btnRecord').className = `btn ${data.isRecording ? 'btn-danger' : 'btn-record'}`;
  setStatus(true, data.version);
}

async function refreshSession() {
  try {
    const data = await API.get('/api/session');
    applySession(data);
  } catch {
    setStatus(false);
    setTimeout(refreshSession, 1000);
  }
}

function initTransitionBar() {
  const sel = $('transitionType');
  const range = $('transitionDuration');
  const label = $('transitionDurationLabel');

  sel.value = currentTransition.type || 'cut';
  range.value = currentTransition.duration || 300;
  label.textContent = `${range.value}ms`;

  sel.addEventListener('change', async () => {
    currentTransition.type = sel.value;
    await API.post('/api/transition', currentTransition);
  });

  range.addEventListener('input', () => {
    label.textContent = `${range.value}ms`;
  });

  range.addEventListener('change', async () => {
    currentTransition.duration = parseInt(range.value);
    await API.post('/api/transition', currentTransition);
  });
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    renderScenes();
    renderBus();
  }, 1000);
}

async function init() {
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProto}//${location.host}`;
  let ws = new WebSocket(wsUrl);

  ws.onopen = () => refreshSession();
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'update') {
        if (msg.key === 'session') {
          session = msg.value;
          if (msg.sceneTimers) sceneTimers = msg.sceneTimers;
        } else {
          session[msg.key] = msg.value;
        }
        refreshSession();
      } else if (msg.type === 'transition') {
        currentTransition = msg.value;
        const sel = $('transitionType');
        const range = $('transitionDuration');
        if (sel) sel.value = currentTransition.type || 'cut';
        if (range) {
          range.value = currentTransition.duration || 300;
          $('transitionDurationLabel').textContent = `${range.value}ms`;
        }
      }
    } catch {}
  };
  ws.onclose = () => {
    setStatus(false);
    setTimeout(() => {
      ws = new WebSocket(wsUrl);
    }, 2000);
  };

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const card = btn.closest('[data-id]');
    const id = card ? card.dataset.id : null;

    if (action === 'show' && id) {
      const cardEl = card;
      cardEl.classList.add('transitioning');
      await API.post(`/api/scene/${id}/switch`, { transitionType: currentTransition.type, transitionDuration: currentTransition.duration });
      showToast(currentTransition.type === 'cut' ? 'Switched scene' : `${currentTransition.type} to scene`);
      setTimeout(refreshSession, 400);
      setTimeout(() => cardEl.classList.remove('transitioning'), 1500);
    } else if (action === 'stage' && id) {
      await API.post(`/api/scene/${id}/stage`);
      showToast('Staged scene');
      setTimeout(refreshSession, 300);
    } else if (action === 'toggle-vis') {
      const layerId = card ? card.dataset.id : null;
      if (!selectedSceneId || !layerId) return;
      await API.post(`/api/layer/${layerId}/toggle`, { sceneId: selectedSceneId });
      setTimeout(refreshSession, 300);
    } else if (action === 'track-mute') {
      const { trackId } = btn.dataset;
      await API.post(`/api/track/${trackId}/mute`);
      setTimeout(refreshSession, 300);
    } else if (action === 'mute') {
      const { trackId } = btn.dataset;
      await API.post(`/api/track/${trackId}/mute`);
      setTimeout(refreshSession, 300);
    } else if (action === 'monitor') {
      const { trackId } = btn.dataset;
      await API.post(`/api/track/${trackId}/monitor`);
      setTimeout(refreshSession, 300);
    }
  });

  document.getElementById('btnShowNext').addEventListener('click', async () => {
    const scenes = Object.entries(session.items || {}).filter(([, v]) => v.type === 'scene');
    const staged = scenes.find(([, v]) => v.staged);
    if (!staged) return;
    const cardEl = document.querySelector(`.scene-card[data-id="${staged[0]}"]`);
    if (cardEl) cardEl.classList.add('transitioning');
    await API.post(`/api/scene/${staged[0]}/switch`, { transitionType: currentTransition.type, transitionDuration: currentTransition.duration });
    showToast(currentTransition.type === 'cut' ? 'Showing next scene' : `${currentTransition.type} to next scene`);
    setTimeout(refreshSession, 400);
    if (cardEl) setTimeout(() => cardEl.classList.remove('transitioning'), 1500);
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="layers"]');
    if (!btn) return;
    const card = btn.closest('[data-id]');
    if (!card) return;
    selectedSceneId = card.dataset.id;
    renderLayers();
    document.querySelector('[data-tab="layers"]').click();
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-cmd]');
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    if (cmd) {
      await API.post('/api/command', { command: cmd });
      showToast(`Command: ${cmd}`);
    }
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-event]');
    if (!btn) return;
    const eventType = btn.dataset.event;
    if (eventType) {
      await API.post('/api/stream-event', { type: eventType });
      showToast(`Event: ${eventType}`);
    }
  });

  document.getElementById('btnScreenshot').addEventListener('click', async () => {
    await API.post('/api/command', { command: 'meld.screenshot' });
    showToast('Screenshot taken');
  });

  document.getElementById('btnStream').addEventListener('click', async () => {
    await API.post('/api/stream/toggle');
    setTimeout(refreshSession, 500);
  });

  document.getElementById('btnRecord').addEventListener('click', async () => {
    await API.post('/api/record/toggle');
    setTimeout(refreshSession, 500);
  });

  document.getElementById('btnBackScenes').addEventListener('click', () => {
    selectedSceneId = null;
    document.querySelector('[data-tab="scenes"]').click();
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  initTransitionBar();
  startTimer();
}

init();
