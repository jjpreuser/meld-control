// Top-level render orchestration: redraw everything + apply a session payload.

function renderAll() {
  renderScenes();
  renderBus();
  renderLayers();
  renderAudio();
}

// Header stream/record buttons, driven by the mirrored isStreaming/isRecording
// globals rather than re-read from a payload — WebSocket pushes update one flag
// at a time and still need the buttons redrawn.
function renderTransport() {
  $('btnStream').textContent = isStreaming ? 'Stop Stream' : 'Start Stream';
  $('btnStream').className = `btn ${isStreaming ? 'btn-danger' : 'btn-stream'}`;
  $('btnRecord').textContent = isRecording ? 'Stop Record' : 'Start Record';
  $('btnRecord').className = `btn ${isRecording ? 'btn-danger' : 'btn-record'}`;
}

// Adopt a full snapshot from GET /api/session. Only ever called with a real
// payload: API.get now throws on the 503 that used to arrive here as
// `{ error: ... }` and get rendered as an empty session.
function applySession(data) {
  session = (data && data.session) || { items: {} };
  if (data && data.version) apiVersion = data.version;
  if (data && data.sceneTimers) sceneTimers = data.sceneTimers;
  isStreaming = !!(data && data.isStreaming);
  isRecording = !!(data && data.isRecording);
  meldUp = true;                 // a 200 from the guarded route means Meld is live
  renderAll();
  renderTransport();
  updateConnectionUi();
}
