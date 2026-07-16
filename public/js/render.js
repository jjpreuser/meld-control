// Top-level render orchestration: redraw everything + apply a session payload.

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
