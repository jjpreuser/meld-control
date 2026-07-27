// Shared test helpers: a fake Meld object that records every method call, and a
// harness that mounts the real Express app (from server.js) against a fake bridge
// so we can exercise every REST route without a live Meld Studio.

const http = require('http');
const { MeldBridge, buildApp } = require('../server.js');

// A stand-in for the QWebChannel `meld` object. Every documented method just
// pushes its name + args onto `calls` so a test can assert what the route did.
// Signals expose a .connect() no-op so MeldBridge wiring wouldn't blow up (not
// used by the route tests, but keeps the shape honest).
function makeFakeMeld(overrides = {}) {
  const calls = [];
  const record = (name) => (...args) => { calls.push({ name, args }); };
  const signal = () => ({ connect() {} });
  const meld = {
    calls,
    isStreaming: false,
    isRecording: false,
    version: 2,
    session: { items: {} },
    sessionChanged: signal(),
    isStreamingChanged: signal(),
    isRecordingChanged: signal(),
    gainUpdated: signal(),
    showScene: record('showScene'),
    setStagedScene: record('setStagedScene'),
    showStagedScene: record('showStagedScene'),
    toggleMute: record('toggleMute'),
    toggleMonitor: record('toggleMonitor'),
    setGain: record('setGain'),
    registerTrackObserver: record('registerTrackObserver'),
    unregisterTrackObserver: record('unregisterTrackObserver'),
    toggleLayer: record('toggleLayer'),
    toggleEffect: record('toggleEffect'),
    toggleStream: record('toggleStream'),
    toggleRecord: record('toggleRecord'),
    callFunction: record('callFunction'),
    callFunctionWithArgs: record('callFunctionWithArgs'),
    sendCommand: record('sendCommand'),
    sendStreamEvent: record('sendStreamEvent'),
    setProperty: record('setProperty'),
    ...overrides,
  };
  return meld;
}

// Build a bridge that reports "connected" with the given fake meld, then start
// the Express app on an ephemeral port. Returns { url, meld, bridge, close }.
async function startServer({ connected = true, meld = makeFakeMeld() } = {}) {
  const bridge = new MeldBridge();
  bridge.meld = connected ? meld : null;
  bridge.connected = connected;
  bridge.cache.version = meld.version;
  bridge.cache.session = meld.session;

  const app = buildApp(bridge);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    meld,
    bridge,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// Tiny fetch wrappers returning { status, body }.
async function get(url, path) {
  const r = await fetch(`${url}${path}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function post(url, path, body) {
  const r = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

// Find the single recorded call with `name` (asserting exactly one match).
function callOf(meld, name) {
  return meld.calls.filter((c) => c.name === name);
}

module.exports = { makeFakeMeld, startServer, get, post, callOf };
