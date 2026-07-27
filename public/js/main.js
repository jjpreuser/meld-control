// Entry point: session fetch, tab navigation, WebSocket wiring, and all the
// top-level event handlers. Loaded last, after every helper it depends on.

async function refreshSession() {
  try {
    const data = await API.get('/api/session');
    applySession(data);
  } catch {
    setStatus(false);
    setTimeout(refreshSession, 1000);
  }
}

function showTab(name) {
  // Leaving the Audio tab: drop track observers so Meld stops streaming updates
  // we're no longer showing (Feature 6).
  const leavingAudio = document.getElementById('tab-audio').classList.contains('active') && name !== 'audio';
  if (leavingAudio) unobserveAllTracks();

  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const content = document.getElementById(`tab-${name}`);
  if (content) content.classList.add('active');
  // Render the tab we're switching to now that it's visible (renderLayers/renderAudio
  // bail when their tab is hidden, so this is where they get drawn).
  if (name === 'layers') renderLayers();
  if (name === 'audio') renderAudio();
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
        } else if (msg.type === 'gain') {
          // Discovery against live Meld (2026-07-16): gainUpdated does not fire on
          // setGain and never reported a stored fader value — it's most likely a
          // live audio meter. So the fader is write-only: we sync mute state from
          // this event but deliberately do NOT move the slider (would jitter with
          // metering). msg.gain is intentionally ignored.
          const track = session.items && session.items[msg.trackId];
          if (track && msg.muted != null) track.muted = msg.muted;
          updateTrackCard(msg.trackId, null, msg.muted);
        }
      } catch {}
    };
    ws.onclose = () => {
      setStatus(false);
      setTimeout(connectWs, 2000);
    };
  }
  connectWs();

  // One delegated click handler for the whole document, dispatching by attribute.
  document.addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn && actionBtn.dataset.action !== 'stream' && actionBtn.dataset.action !== 'record') {
      return handleAction(actionBtn);
    }

    const cmdBtn = e.target.closest('[data-cmd]');
    if (cmdBtn) {
      await API.post('/api/command', { command: cmdBtn.dataset.cmd });
      showToast(`Command: ${cmdBtn.dataset.cmd}`);
      return;
    }

    const eventBtn = e.target.closest('[data-event]');
    if (eventBtn) {
      // Widgets that need data (subathon add-time) carry data-amount-from pointing
      // at their number input; everything else is a bare { type }.
      let body = { type: eventBtn.dataset.event };
      const amountFrom = eventBtn.dataset.amountFrom;
      if (amountFrom) {
        const input = document.querySelector(`[data-widget-amount="${amountFrom}"]`);
        const amount = input ? parseInt(input.value, 10) : NaN;
        if (!isNaN(amount)) body.data = { [eventBtn.dataset.amountKey || 'amount']: amount };
      }
      await API.post('/api/stream-event', body);
      showToast(`Event: ${eventBtn.dataset.event}`);
      return;
    }

    const modeBtn = e.target.closest('[data-scene-mode]');
    if (modeBtn) {
      sceneMode = modeBtn.dataset.sceneMode;
      renderScenes();
      renderBus();
      return;
    }

    if (e.target.closest('#btnTake')) {
      await API.post('/api/scene/staged/show');
      showToast('TAKE — cut to program');
      setTimeout(refreshSession, 300);
    }
  });

  // One delegated change handler: layer property edits + gain slider release.
  document.addEventListener('change', async (e) => {
    const slider = e.target.closest('.gain-slider');
    if (slider) return postGain(slider.dataset.trackId);

    // Media scrub release → fire seekTo with absolute seconds (Feature 2).
    const seek = e.target.closest('.media-seek');
    if (seek) return mediaSeek(seek.dataset.layerId, parseInt(seek.value, 10));

    const input = e.target.closest('[data-prop]');
    if (!input) return;
    const value = input.type === 'number' ? parseFloat(input.value) : input.value;
    try {
      await API.post(`/api/property/${input.dataset.layerId}`, { property: input.dataset.prop, value });
      showToast(`${input.dataset.prop}: ${value}`);
    } catch {}
  });

  // Live readout while dragging a fader; debounced POST so we don't flood the bridge.
  document.addEventListener('input', (e) => {
    const slider = e.target.closest('.gain-slider');
    if (slider) {
      const trackId = slider.dataset.trackId;
      const gain = parseFloat(slider.value);
      const readout = document.querySelector(`[data-gain-readout="${trackId}"]`);
      if (readout) readout.textContent = `${Math.round(gain * 100)}%`;
      clearTimeout(gainTimers[trackId]);
      gainTimers[trackId] = setTimeout(() => postGain(trackId), 120);
      return;
    }

    // Media scrub: update the seconds readout live (fire-and-forget POST on release).
    const seek = e.target.closest('.media-seek');
    if (seek) {
      const readout = document.querySelector(`[data-seek-readout="${seek.dataset.layerId}"]`);
      if (readout) readout.textContent = fmtSeconds(parseInt(seek.value, 10));
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
    showTab('scenes');
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  });

  // Command deck + widgets are catalog-driven and stateless — render them once.
  renderCommands();
  renderWidgets();

  startTimer();
}

init();
