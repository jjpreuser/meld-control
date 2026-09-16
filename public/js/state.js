// Shared client-side state. These globals are read and written across the
// render/actions/main scripts (load order in index.html keeps them defined
// before use).

let session = { items: {} };      // latest session snapshot from the bridge

// Connection state is TWO independent links and the UI must not conflate them:
// browser <-> bridge (our own WebSocket) and bridge <-> Meld Studio (reported by
// the bridge's 'meld' message). Meld can die while the bridge stays up, which
// used to leave the header saying Connected over an empty app.
let bridgeUp = false;             // our WebSocket to the bridge is open
let meldUp = false;               // the bridge is talking to Meld Studio

let isStreaming = false;          // mirrored from the bridge, drives the header buttons
let isRecording = false;
let apiVersion = 1;               // Meld WebChannel API version (setProperty needs v2+)
let transformDragging = false;    // true while a transform-stage gesture is in flight
let selectedSceneId = null;       // which scene the Layers tab is showing
let sceneTimers = {};             // sceneId -> Date.now() when it went live
let timerInterval = null;         // handle for the 1s live-timer tick
let sceneMode = 'simple';         // 'simple' tap-to-switch, or 'switcher' PGM/PVW (Feature 5)
const expandedProps = {};         // layer fold open/closed flags, keyed by id
const gainTimers = {};            // per-track debounce handles for gain POSTs

// Scenes currently showing the "switching" flash. Kept in state (not just as a
// DOM class) so a re-render mid-transition doesn't drop the indicator — the
// 1s timer tick used to rebuild the grid and wipe it after ~1s of its 1.5s life.
const transitioningScenes = new Set();
const transitionTimers = {};      // sceneId -> handle that clears the flash

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

// Coalescing handle for the post-action safety refresh (see scheduleSafetyRefresh
// in main.js). Actions used to each queue their own refetch 300ms out; now they
// share one, and an arriving WebSocket push cancels it.
let safetyRefreshTimer = null;
