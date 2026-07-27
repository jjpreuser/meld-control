// Shared client-side state. These globals are read and written across the
// render/actions/main scripts (load order in index.html keeps them defined
// before use).

let session = { items: {} };      // latest session snapshot from the bridge
let apiVersion = 1;               // Meld WebChannel API version (setProperty needs v2+)
let transformDragging = false;    // true while a transform-stage gesture is in flight
let selectedSceneId = null;       // which scene the Layers tab is showing
let sceneTimers = {};             // sceneId -> Date.now() when it went live
let timerInterval = null;         // handle for the 1s live-timer tick
let sceneMode = 'simple';         // 'simple' tap-to-switch, or 'switcher' PGM/PVW (Feature 5)
const expandedProps = {};         // layer fold open/closed flags, keyed by id
const gainTimers = {};            // per-track debounce handles for gain POSTs

// Feature 6: which tracks we've asked Meld to stream detailed updates for, and
// the context string every register/unregister call is tagged with.
const observedTracks = new Set();
const OBSERVER_CTX = 'meld-control-web';

// Feature 3 (deep dive): Instant Replay panel settings. dismissSec is the
// user-editable auto-dismiss delay (default 15s); autoDismiss toggles it.
// position is an optional preset location (px on 1920x1080) applied to the
// replay layer when it appears; default a bottom-right picture-in-picture.
const replaySettings = {
  autoDismiss: true,
  dismissSec: 15,
  position: { enabled: false, x: 1180, y: 620, width: 640, height: 360 },
};
