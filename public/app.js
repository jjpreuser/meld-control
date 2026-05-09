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

function renderScenes() {
  const container = $('sceneList');
  const scenes = Object.entries(session.items || {})
    .filter(([, v]) => v.type === 'scene')
    .sort((a, b) => (a[1].index || 0) - (b[1].index || 0));

  container.innerHTML = scenes.map(([id, scene]) => {
    const isCurrent = scene.current ? 'current' : '';
    const isStaged = scene.staged ? 'staged' : '';
    return `
      <div class="card scene-card ${isCurrent} ${isStaged}" data-id="${id}">
        <div class="card-body" data-action="show">
          <span class="card-name">${escHtml(scene.name)}</span>
          <span class="card-badge">Scene ${scene.index}</span>
        </div>
        <div class="card-actions">
          <button class="btn btn-sm btn-outline" data-action="layers">Layers</button>
          <button class="btn btn-sm ${isStaged ? 'btn-warning' : 'btn-outline'}" data-action="stage">Stage</button>
        </div>
      </div>
    `;
  }).join('');
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

async function refreshSession() {
  try {
    const data = await API.get('/api/session');
    session = data.session || data;
    renderScenes();
    if (selectedSceneId) renderLayers();
    renderAudio();
    $('btnStream').textContent = data.isStreaming ? 'Stop Stream' : 'Start Stream';
    $('btnStream').className = `btn ${data.isStreaming ? 'btn-danger' : 'btn-stream'}`;
    $('btnRecord').textContent = data.isRecording ? 'Stop Record' : 'Start Record';
    $('btnRecord').className = `btn ${data.isRecording ? 'btn-danger' : 'btn-record'}`;
    setStatus(true, data.version);
  } catch {
    setStatus(false);
  }
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
        if (msg.key === 'session') session = msg.value;
        else session[msg.key] = msg.value;
        refreshSession();
      } else if (msg.type === 'gain') {
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

    if (action === 'show') {
      const id = btn.closest('[data-id]').dataset.id;
      await API.post(`/api/scene/${id}/show`);
      showToast('Switched scene');
      setTimeout(refreshSession, 300);
    } else if (action === 'stage') {
      const id = btn.closest('[data-id]').dataset.id;
      await API.post(`/api/scene/${id}/stage`);
      showToast('Staged scene');
      setTimeout(refreshSession, 300);
    } else if (action === 'layers') {
      selectedSceneId = btn.closest('[data-id]').dataset.id;
      renderLayers();
      document.querySelector('[data-tab="layers"]').click();
    } else if (action === 'toggle-vis') {
      const card = btn.closest('[data-id]');
      const layerId = card.dataset.id;
      if (!selectedSceneId) return;
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
}

init();
