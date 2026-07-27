// Pure data + pure helpers shared by the renderers — and unit-tested directly in
// node (see test/frontend.test.js). Deliberately DOM-free: every function here
// takes plain data and returns plain data, so it runs identically in the browser
// and under `node --test`.
//
// Loaded first (before state/renderers) in index.html. The module.exports block
// at the bottom is a no-op in the browser (`module` is undefined there) and the
// entry point for the node tests.

// ---- Feature 3: command deck catalog ---------------------------------------
// Grouped named global actions fired via sendCommand → POST /api/command.
// Stream/record use the explicit start*/stop* variants (not toggle*) so a button
// reflects a known state instead of blindly flipping — see FUTURE_PLAN Feature 3.
const COMMAND_GROUPS = [
  {
    title: 'Capture',
    commands: [
      { cmd: 'meld.screenshot', label: 'Screenshot', icon: '📷' },
      { cmd: 'meld.screenshot.vertical', label: 'Screenshot V', icon: '📱' },
      { cmd: 'meld.recordClip', label: 'Save Clip', icon: '✂️' },
      { cmd: 'meld.replay.show', label: 'Show Replay', icon: '⏪' },
      { cmd: 'meld.replay.dismiss', label: 'Dismiss Replay', icon: '✖️' },
    ],
  },
  {
    title: 'Camera',
    commands: [
      { cmd: 'meld.toggleVirtualCameraAction', label: 'Virtual Camera', icon: '📹' },
    ],
  },
  {
    title: 'Streaming',
    commands: [
      { cmd: 'meld.startStreamingAction', label: 'Start Stream', icon: '🔴' },
      { cmd: 'meld.stopStreamingAction', label: 'Stop Stream', icon: '⏹️' },
    ],
  },
  {
    title: 'Recording',
    commands: [
      { cmd: 'meld.startRecordingAction', label: 'Start Record', icon: '⏺️' },
      { cmd: 'meld.stopRecordingAction', label: 'Stop Record', icon: '⏹️' },
    ],
  },
];

// ---- Feature 4: stream-widget catalog --------------------------------------
// One card per on-stream widget; each button dispatches sendStreamEvent(type) →
// POST /api/stream-event. SUBATHONTIMER_ADDTIME is the only event needing data
// ({ amount }); we mark it so the renderer draws an amount input.
const WIDGETS = [
  {
    id: 'stopwatch', name: 'Stopwatch', icon: '⏱️',
    events: [
      { type: 'STOPWATCH_RESET', label: 'Reset' },
      { type: 'STOPWATCH_PAUSE', label: 'Pause' },
      { type: 'STOPWATCH_RESUME', label: 'Resume' },
    ],
  },
  {
    id: 'countdown', name: 'Countdown', icon: '⏳',
    events: [
      { type: 'COUNTDOWN_RESET', label: 'Reset' },
      { type: 'COUNTDOWN_PAUSE', label: 'Pause' },
      { type: 'COUNTDOWN_RESUME', label: 'Resume' },
    ],
  },
  {
    id: 'confetti', name: 'Confetti', icon: '🎉',
    events: [
      { type: 'CONFETTIFALL_TRIGGER', label: 'Fall' },
      { type: 'CONFETTIPOP_TRIGGER', label: 'Pop' },
    ],
  },
  {
    id: 'subathon', name: 'Subathon Timer', icon: '💰',
    events: [
      { type: 'SUBATHONTIMER_RESET', label: 'Reset' },
      { type: 'SUBATHONTIMER_PAUSE', label: 'Pause' },
      { type: 'SUBATHONTIMER_RESUME', label: 'Resume' },
      { type: 'SUBATHONTIMER_ADDTIME', label: 'Add Time', dataKey: 'amount' },
    ],
  },
  {
    id: 'wheel', name: 'Wheel', icon: '🎡',
    events: [
      { type: 'WHEELSPIN_SPIN', label: 'Spin' },
    ],
  },
  {
    id: 'counter', name: 'Counter', icon: '🔢',
    events: [
      { type: 'COUNTER_INCREMENT', label: '+1' },
      { type: 'COUNTER_DECREMENT', label: '-1' },
    ],
  },
];

// ---- Feature 2: media-layer detection --------------------------------------
// A layer is "media" (transport-controllable) iff it carries a mediaSource.
function isMediaLayer(layer) {
  return !!(layer && layer.mediaSource);
}

// ---- Feature 7: audio-track grouping ---------------------------------------
// Partition tracks into a Global group (no parent) plus one group per scene.
//
// track.parent is a LAYER id (not a scene id — see FUTURE_PLAN Feature 7). To
// place a track under a scene we hop track.parent → layer → layer.parent (scene).
// If the parent layer or its scene can't be resolved we fall back to an "Other"
// group so nothing silently disappears.
//
// items: the session.items map. Returns:
//   { global: [{id, ...track}], scenes: [{ sceneId, sceneName, tracks: [...] }] }
// scenes are ordered by scene index; tracks within a group by name.
function groupTracks(items) {
  items = items || {};
  const global = [];
  const sceneBuckets = new Map();     // sceneId -> [tracks]
  const otherTracks = [];

  const tracks = Object.entries(items)
    .filter(([, v]) => v.type === 'track')
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  for (const track of tracks) {
    if (!track.parent) {
      global.push(track);
      continue;
    }
    const parent = items[track.parent];
    // Resolve through the parent: it may itself be a layer (→ its scene) or,
    // defensively, already a scene.
    let sceneId = null;
    if (parent && parent.type === 'layer') sceneId = parent.parent;
    else if (parent && parent.type === 'scene') sceneId = track.parent;

    if (sceneId && items[sceneId]) {
      if (!sceneBuckets.has(sceneId)) sceneBuckets.set(sceneId, []);
      sceneBuckets.get(sceneId).push(track);
    } else {
      otherTracks.push(track);
    }
  }

  const scenes = [...sceneBuckets.entries()]
    .map(([sceneId, list]) => ({
      sceneId,
      sceneName: items[sceneId].name || `Scene ${items[sceneId].index}`,
      tracks: list,
    }))
    .sort((a, b) => (items[a.sceneId].index || 0) - (items[b.sceneId].index || 0));

  if (otherTracks.length) {
    scenes.push({ sceneId: null, sceneName: 'Other', tracks: otherTracks });
  }

  return { global, scenes };
}

// ---- Feature 5: program / preview selection --------------------------------
// Pull the current (PGM) and staged (PVW) scenes out of the session in one pass.
// Returns { program: [id, scene]|null, preview: [id, scene]|null, scenes: [...] }.
function busScenes(items) {
  const scenes = Object.entries(items || {})
    .filter(([, v]) => v.type === 'scene')
    .sort((a, b) => (a[1].index || 0) - (b[1].index || 0));
  return {
    program: scenes.find(([, v]) => v.current) || null,
    preview: scenes.find(([, v]) => v.staged) || null,
    scenes,
  };
}

// Percentage formatter for gain readouts (kept here so tests can assert it).
function gainPctOf(g) {
  return `${Math.round((g == null ? 1 : g) * 100)}%`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { COMMAND_GROUPS, WIDGETS, isMediaLayer, groupTracks, busScenes, gainPctOf };
}
