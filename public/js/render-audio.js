// Renders the Audio tab, plus in-place updates for live WS messages.
//
// Feature 7 — tracks are partitioned into a "Global" group (no parent, e.g. mic /
// desktop) and per-scene groups, resolving track.parent (a LAYER id) → layer →
// scene via groupTracks() in catalog.js.
//
// Feature 6 — while the Audio tab is visible we registerTrackObserver for each
// shown track (and unregister on teardown) so Meld streams detailed updates for
// them. NOTE: discovery against a live Meld found gainUpdated behaves like a live
// audio METER, not a stored fader value (see main.js), so the fader stays
// write-only — we sync mute state from it but never move the slider.

// Gain is a linear multiplier (1.0 = unity / 0 dB). GAIN_MAX is the one knob to
// widen if a Meld build ever reports boost above 1.0.
const GAIN_MAX = 1;
const gainPct = (g) => `${Math.round((g == null ? 1 : g) * 100)}%`;

function trackCardHtml(id, track) {
  const isGlobal = !track.parent;
  const icon = isGlobal ? '🎤' : '🔊';
  const gain = track.gain == null ? 1 : track.gain;
  return `
    <div class="card track-card" data-id="${id}">
      <div class="card-body">
        <span class="card-name">${icon} ${escHtml(track.name)}</span>
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
}

function renderAudio() {
  const container = $('trackList');

  // Skip when the Audio tab isn't showing; showTab() draws it when opened.
  if (!$('tab-audio').classList.contains('active')) return;

  // Don't rebuild while a fader is being dragged (or a card focused) — it would
  // snap the slider back mid-gesture.
  const active = document.activeElement;
  if (active && container.contains(active)) return;

  const { global, scenes } = groupTracks(session.items || {});

  const section = (title, cls, tracks) => tracks.length ? `
    <div class="track-group ${cls}">
      <div class="track-group-title">${escHtml(title)}</div>
      ${tracks.map(t => trackCardHtml(t.id, t)).join('')}
    </div>` : '';

  let html = section('Global', 'global', global);
  html += scenes.map(s => section(s.sceneName, 'scene', s.tracks)).join('');
  container.innerHTML = html || '<p class="empty">No audio tracks</p>';

  syncTrackObservers();
}

// ---- Feature 6: track observers --------------------------------------------
// Register an observer for every track currently drawn; unregister ones that are
// no longer visible. Diffed against `observedTracks` so we only POST on change.
function syncTrackObservers() {
  const wanted = new Set(
    Object.entries(session.items || {})
      .filter(([, v]) => v.type === 'track')
      .map(([id]) => id)
  );
  for (const id of wanted) {
    if (!observedTracks.has(id)) {
      observedTracks.add(id);
      API.post('/api/track/observer/register', { trackId: id, context: OBSERVER_CTX }).catch(() => {});
    }
  }
  for (const id of [...observedTracks]) {
    if (!wanted.has(id)) unobserveTrack(id);
  }
}

function unobserveTrack(id) {
  if (!observedTracks.has(id)) return;
  observedTracks.delete(id);
  API.post('/api/track/observer/unregister', { trackId: id, context: OBSERVER_CTX }).catch(() => {});
}

// Called when leaving the Audio tab — drop every observer so Meld isn't streaming
// updates we're not showing.
function unobserveAllTracks() {
  for (const id of [...observedTracks]) unobserveTrack(id);
}

// Live-update one track card in place from a WS `gain` message, without rebuilding
// the whole list (which would clobber a fader the user is mid-drag on). Per the
// meter discovery we only ever apply mute here; gain is intentionally ignored.
function updateTrackCard(trackId, gain, muted) {
  const card = document.querySelector(`.track-card[data-id="${trackId}"]`);
  if (!card) return;
  if (muted != null) {
    const muteBtn = card.querySelector('[data-action="mute"]');
    if (muteBtn) {
      muteBtn.textContent = muted ? 'Muted' : 'Mute';
      muteBtn.className = `btn btn-sm ${muted ? 'btn-danger active' : 'btn-outline'}`;
    }
  }
}
