// Entry point: session fetch, tab navigation, WebSocket wiring, and all the
// top-level event handlers. Loaded last, after every helper it depends on.

// Full snapshot fetch. A 503 here means the bridge is up but Meld isn't: reflect
// that instead of retrying in a tight loop — the bridge pushes a 'meld' message
// the moment Meld returns, which triggers the refetch for us.
async function refreshSession() {
  cancelSafetyRefresh();
  try {
    applySession(await API.get('/api/session'));
  } catch (err) {
    if (err && err.status === 503) {
      meldUp = false;
      updateConnectionUi();
    } else {
      // Network-level failure: our own socket is probably going down too, and
      // its onclose will schedule the reconnect. One retry covers a blip.
      setTimeout(refreshSession, 1000);
    }
  }
}

// One shared, coalesced re-fetch used as a BACKSTOP after actions. The bridge
// pushes sessionChanged, so this normally gets cancelled before it fires; it only
// matters when a mutation doesn't produce a signal. Previously every action
// queued its own 300ms refetch, so a handful of taps meant a burst of redundant
// full-session GETs racing the pushes.
function scheduleSafetyRefresh(ms = 700) {
  clearTimeout(safetyRefreshTimer);
  safetyRefreshTimer = setTimeout(refreshSession, ms);
}

function cancelSafetyRefresh() {
  clearTimeout(safetyRefreshTimer);
  safetyRefreshTimer = null;
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
    ws.onopen = () => {
      bridgeUp = true;
      updateConnectionUi();
      refreshSession();
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'meld') {
          // The bridge <-> Meld link changed. Coming back up, refetch the whole
          // session: whatever we were holding is from before Meld restarted.
          const wasUp = meldUp;
          meldUp = !!msg.connected;
          if (msg.version) apiVersion = msg.version;
          updateConnectionUi();
          if (meldUp && !wasUp) refreshSession();
        } else if (msg.type === 'update') {
          // The push CARRIES the new value — render straight from it. This used
          // to call refreshSession(), spending a full HTTP round-trip to re-fetch
          // data we were already holding in msg.value.
          cancelSafetyRefresh();
          meldUp = true;
          if (msg.key === 'session') {
            session = msg.value || { items: {} };
            if (msg.sceneTimers) sceneTimers = msg.sceneTimers;
            renderAll();
          } else if (msg.key === 'isStreaming') {
            isStreaming = !!msg.value;
            renderTransport();
          } else if (msg.key === 'isRecording') {
            isRecording = !!msg.value;
            renderTransport();
          }
          updateConnectionUi();
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
      bridgeUp = false;
      meldUp = false;
      updateConnectionUi();
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
      const cmd = cmdBtn.dataset.cmd;
      await withFeedback(cmd, `Command: ${cmd}`,
        () => API.post('/api/command', { command: cmd }));
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
      const ok = await withFeedback('TAKE', 'TAKE — cut to program',
        () => API.post('/api/scene/staged/show'));
      if (ok) scheduleSafetyRefresh();
    }
  });

  // One delegated change handler: layer property edits + gain slider release.
  document.addEventListener('change', async (e) => {
    const slider = e.target.closest('.gain-slider');
    if (slider) return postGain(slider.dataset.trackId);

    // Instant Replay panel settings.
    if (e.target.id === 'replayDismissSec') {
      replaySettings.dismissSec = clampDismissSec(e.target.value);
      renderReplay();
      return;
    }
    if (e.target.id === 'replayAutoDismiss') {
      replaySettings.autoDismiss = e.target.checked;
      renderReplay();
      return;
    }
    if (e.target.id === 'replayPosEnabled') {
      replaySettings.position.enabled = e.target.checked;
      renderReplay();
      return;
    }
    const posField = { replayPosX: 'x', replayPosY: 'y', replayPosW: 'width', replayPosH: 'height' }[e.target.id];
    if (posField) {
      const n = parseFloat(e.target.value);
      replaySettings.position[posField] = Number.isFinite(n) ? n : 0;
      renderReplay(); // reflect the typed value on the drag box
      return;
    }

    const input = e.target.closest('[data-prop]');
    if (!input) return;
    const value = input.type === 'number' ? parseFloat(input.value) : input.value;
    const prop = input.dataset.prop;
    await withFeedback(`Set ${prop}`, `${prop}: ${value}`,
      () => API.post(`/api/property/${input.dataset.layerId}`, { property: prop, value }));
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
    }
  });

  document.getElementById('btnShowNext').addEventListener('click', async () => {
    const scenes = Object.entries(session.items || {}).filter(([, v]) => v.type === 'scene');
    const staged = scenes.find(([, v]) => v.staged);
    if (!staged) return;
    markTransitioning(staged[0]);
    const ok = await withFeedback('Scene switch', 'Showing next scene',
      () => API.post(`/api/scene/${staged[0]}/switch`));
    if (ok) scheduleSafetyRefresh();
    else clearTransitioning(staged[0]);
  });

  document.getElementById('btnScreenshot').addEventListener('click', () =>
    withFeedback('Screenshot', 'Screenshot taken',
      () => API.post('/api/command', { command: 'meld.screenshot' })));

  // isStreamingChanged / isRecordingChanged push the new state, so no refetch.
  document.getElementById('btnStream').addEventListener('click', () =>
    withFeedback('Stream toggle', null, () => API.post('/api/stream/toggle')));

  document.getElementById('btnRecord').addEventListener('click', () =>
    withFeedback('Record toggle', null, () => API.post('/api/record/toggle')));

  document.getElementById('btnBackScenes').addEventListener('click', () => {
    selectedSceneId = null;
    showTab('scenes');
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  });

  // Command deck is catalog-driven and stateless — render it once. The Instant
  // Replay panel lives above it and is likewise static (client-side only).
  renderCommands();
  renderReplay();

  startTimer();
}

init();
