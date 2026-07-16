// Renders the Audio tab track list, plus in-place updates for live WS messages.

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
