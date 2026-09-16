// Feature 2 — Media playback controls. For layers backed by a mediaSource we can
// drive play / pause via callFunction → POST /api/call-function/:id.
//
//   play  → { command: "play" }
//   pause → { command: "pause" }
//
// A seekTo scrub bar was removed: the API exposes no playback position/duration,
// so a fire-and-forget scrubber had no useful behaviour. The bridge still supports
// callFunctionWithArgs("seekTo", [seconds]) if a future build gains readback.
//
// Ref: WebChannel API — Media Playback (callFunction / callFunctionWithArgs).

// Markup for the transport bar inside a media layer card. Only call this when
// isMediaLayer(layer) is true.
function mediaTransport(layerId) {
  return `
    <div class="media-transport" data-media="${layerId}">
      <div class="media-buttons">
        <button class="btn btn-sm" data-action="media-play" data-layer-id="${layerId}">▶ Play</button>
        <button class="btn btn-sm" data-action="media-pause" data-layer-id="${layerId}">⏸ Pause</button>
      </div>
    </div>
  `;
}

// Fired by the delegated click handler in main.js.
// These intentionally let a rejection propagate: the caller (handleAction) wraps
// them in withFeedback, which is what decides whether to toast success or error.
async function mediaPlay(layerId) {
  await API.post(`/api/call-function/${layerId}`, { command: 'play' });
}
async function mediaPause(layerId) {
  await API.post(`/api/call-function/${layerId}`, { command: 'pause' });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mediaTransport };
}
