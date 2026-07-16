// Shared client-side state. These globals are read and written across the
// render/actions/main scripts (load order in index.html keeps them defined
// before use).

let session = { items: {} };      // latest session snapshot from the bridge
let apiVersion = 1;               // Meld WebChannel API version (setProperty needs v2+)
let transformDragging = false;    // true while a transform-stage gesture is in flight
let selectedSceneId = null;       // which scene the Layers tab is showing
let sceneTimers = {};             // sceneId -> Date.now() when it went live
let timerInterval = null;         // handle for the 1s live-timer tick
const expandedProps = {};         // layer fold open/closed flags, keyed by id
const gainTimers = {};            // per-track debounce handles for gain POSTs
