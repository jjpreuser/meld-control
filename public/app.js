let session = { items: {} };
let selectedSceneId = null;
let sceneTimers = {};
let timerInterval = null;
const expandedProps = {};

async function refreshSession() {
  try {
    const data = await API.get('/api/session');
    applySession(data);
  } catch {
    setStatus(false);
    setTimeout(refreshSession, 1000);
  }
}

async function init() {
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProto}//${location.host}`;

  function connectWs() {
    const ws = new WebSocket(wsUrl);
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
        }
      } catch {}
    };
    ws.onclose = () => {
      setStatus(false);
      setTimeout(connectWs, 2000);
    };
  }
  connectWs();

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const card = btn.closest('[data-id]');
    const id = card ? card.dataset.id : null;

    if (action === 'show' && id) {
      const cardEl = card;
      cardEl.classList.add('transitioning');
      await API.post(`/api/scene/${id}/switch`);
      showToast('Switched scene');
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
    } else if (action === 'toggle-effect') {
      const effectId = btn.dataset.effectId;
      const layerId = btn.dataset.layerId;
      if (!selectedSceneId || !layerId || !effectId) return;
      await API.post(`/api/effect/${effectId}/toggle`, { sceneId: selectedSceneId, layerId });
      setTimeout(refreshSession, 300);
    } else if (action === 'pick-scene') {
      selectedSceneId = btn.dataset.sceneId;
      renderLayers();
    } else if (action === 'toggle-props') {
      const card = btn.closest('[data-id]');
      if (!card) return;
      expandedProps[card.dataset.id] = !expandedProps[card.dataset.id];
      renderLayers();
    } else if (action === 'toggle-effects') {
      const card = btn.closest('[data-id]');
      if (!card) return;
      expandedProps[`${card.dataset.id}-effects`] = !expandedProps[`${card.dataset.id}-effects`];
      renderLayers();
    }
  });

  document.getElementById('btnShowNext').addEventListener('click', async () => {
    const scenes = Object.entries(session.items || {}).filter(([, v]) => v.type === 'scene');
    const staged = scenes.find(([, v]) => v.staged);
    if (!staged) return;
    const cardEl = document.querySelector(`.scene-card[data-id="${staged[0]}"]`);
    if (cardEl) cardEl.classList.add('transitioning');
    await API.post(`/api/scene/${staged[0]}/switch`);
    showToast('Showing next scene');
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

  startTimer();
}

init();
