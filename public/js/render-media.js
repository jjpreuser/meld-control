// Feature 2 — Media playback controls. For layers backed by a mediaSource we can
// drive play / pause / seek via callFunction → POST /api/call-function/:id.
//
//   play         → { command: "play" }
//   pause        → { command: "pause" }
//   seekTo(secs) → { command: "seekTo", args: [seconds] }
//
// Caveat (documented in the UI): the API exposes NO playback position or
// duration, so the scrub bar is fire-and-forget — we send absolute seconds and
// cannot show a live playhead. The seconds readout reflects the last value we
// sent, not Meld's actual position.
//
// Ref: WebChannel API — Media Playback (callFunction / callFunctionWithArgs).

const MEDIA_SCRUB_MAX = 3600;   // scrub range ceiling in seconds (1h); fire-and-forget

// Markup for the transport bar inside a media layer card. Only call this when
// isMediaLayer(layer) is true.
function mediaTransport(layerId) {
  return `
    <div class="media-transport" data-media="${layerId}">
      <div class="media-buttons">
        <button class="btn btn-sm" data-action="media-play" data-layer-id="${layerId}">▶ Play</button>
        <button class="btn btn-sm" data-action="media-pause" data-layer-id="${layerId}">⏸ Pause</button>
      </div>
      <div class="media-scrub">
        <input type="range" class="media-seek" min="0" max="${MEDIA_SCRUB_MAX}" step="1" value="0" data-layer-id="${layerId}" aria-label="Seek">
        <span class="media-seek-readout" data-seek-readout="${layerId}">0:00</span>
      </div>
      <div class="media-note">Fire-and-forget: Meld exposes no playhead, so this can't track live position.</div>
    </div>
  `;
}

function fmtSeconds(s) {
  s = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Fired by the delegated click handler in main.js.
async function mediaPlay(layerId) {
  await API.post(`/api/call-function/${layerId}`, { command: 'play' }).catch(() => {});
}
async function mediaPause(layerId) {
  await API.post(`/api/call-function/${layerId}`, { command: 'pause' }).catch(() => {});
}
async function mediaSeek(layerId, seconds) {
  await API.post(`/api/call-function/${layerId}`, { command: 'seekTo', args: [seconds] }).catch(() => {});
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mediaTransport, fmtSeconds, MEDIA_SCRUB_MAX };
}
