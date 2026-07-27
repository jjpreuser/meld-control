// Integration tests for every REST route in server.js. Each test mounts the real
// Express app against a fake Meld (test/helpers.js) and asserts the route calls
// the right meld method with the right arguments, plus validation / 503 paths.

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeMeld, startServer, get, post, callOf } = require('./helpers.js');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

const url = () => srv.url;
const meld = () => srv.meld;

describe('session + meta', () => {
  test('GET /api/session returns the cache', async () => {
    const { status, body } = await get(url(), '/api/session');
    assert.equal(status, 200);
    assert.ok(body.session);
    assert.equal(body.version, 2);
  });

  test('GET /api/version returns version', async () => {
    const { status, body } = await get(url(), '/api/version');
    assert.equal(status, 200);
    assert.equal(body.version, 2);
  });

  test('GET /api/debug/meld enumerates keys and marks signals', async () => {
    const { status, body } = await get(url(), '/api/debug/meld');
    assert.equal(status, 200);
    assert.equal(body.sessionChanged, 'signal');
    assert.equal(body.gainUpdated, 'signal');
    assert.equal(body.showScene, 'function');
  });
});

describe('scene control', () => {
  test('POST /api/scene/:id/show -> showScene(id)', async () => {
    await post(url(), '/api/scene/scene-1/show');
    const c = callOf(meld(), 'showScene').at(-1);
    assert.deepEqual(c.args, ['scene-1']);
  });

  test('POST /api/scene/:id/switch -> showScene(id)', async () => {
    await post(url(), '/api/scene/scene-9/switch');
    assert.deepEqual(callOf(meld(), 'showScene').at(-1).args, ['scene-9']);
  });

  test('POST /api/scene/:id/stage -> setStagedScene(id)  [Feature 5]', async () => {
    await post(url(), '/api/scene/scene-2/stage');
    assert.deepEqual(callOf(meld(), 'setStagedScene').at(-1).args, ['scene-2']);
  });

  test('POST /api/scene/staged/show -> showStagedScene()  [Feature 5 TAKE]', async () => {
    const before = callOf(meld(), 'showStagedScene').length;
    await post(url(), '/api/scene/staged/show');
    assert.equal(callOf(meld(), 'showStagedScene').length, before + 1);
  });
});

describe('layer + effect', () => {
  test('POST /api/layer/:id/toggle needs sceneId', async () => {
    const { status, body } = await post(url(), '/api/layer/lay-1/toggle', {});
    assert.equal(status, 400);
    assert.match(body.error, /sceneId/);
  });

  test('POST /api/layer/:id/toggle -> toggleLayer(sceneId, layerId)', async () => {
    await post(url(), '/api/layer/lay-1/toggle', { sceneId: 'scene-1' });
    assert.deepEqual(callOf(meld(), 'toggleLayer').at(-1).args, ['scene-1', 'lay-1']);
  });

  test('POST /api/effect/:id/toggle needs sceneId + layerId', async () => {
    const { status } = await post(url(), '/api/effect/fx-1/toggle', { sceneId: 's' });
    assert.equal(status, 400);
  });

  test('POST /api/effect/:id/toggle -> toggleEffect(scene, layer, effect)', async () => {
    await post(url(), '/api/effect/fx-1/toggle', { sceneId: 'scene-1', layerId: 'lay-1' });
    assert.deepEqual(callOf(meld(), 'toggleEffect').at(-1).args, ['scene-1', 'lay-1', 'fx-1']);
  });
});

describe('audio', () => {
  test('POST /api/track/:id/mute -> toggleMute(id)', async () => {
    await post(url(), '/api/track/trk-1/mute');
    assert.deepEqual(callOf(meld(), 'toggleMute').at(-1).args, ['trk-1']);
  });

  test('POST /api/track/:id/monitor -> toggleMonitor(id)', async () => {
    await post(url(), '/api/track/trk-1/monitor');
    assert.deepEqual(callOf(meld(), 'toggleMonitor').at(-1).args, ['trk-1']);
  });

  test('POST /api/track/:id/gain needs gain', async () => {
    const { status } = await post(url(), '/api/track/trk-1/gain', {});
    assert.equal(status, 400);
  });

  test('POST /api/track/:id/gain -> setGain(id, gain)', async () => {
    await post(url(), '/api/track/trk-1/gain', { gain: 0.5 });
    assert.deepEqual(callOf(meld(), 'setGain').at(-1).args, ['trk-1', 0.5]);
  });

  test('gain=0 is accepted (not treated as missing)', async () => {
    const { status } = await post(url(), '/api/track/trk-1/gain', { gain: 0 });
    assert.equal(status, 200);
    assert.deepEqual(callOf(meld(), 'setGain').at(-1).args, ['trk-1', 0]);
  });

  test('observer register needs trackId + context  [Feature 6]', async () => {
    const { status } = await post(url(), '/api/track/observer/register', { trackId: 't' });
    assert.equal(status, 400);
  });

  test('observer register/unregister -> register/unregisterTrackObserver  [Feature 6]', async () => {
    await post(url(), '/api/track/observer/register', { trackId: 'trk-1', context: 'ctx' });
    assert.deepEqual(callOf(meld(), 'registerTrackObserver').at(-1).args, ['trk-1', 'ctx']);
    await post(url(), '/api/track/observer/unregister', { trackId: 'trk-1', context: 'ctx' });
    assert.deepEqual(callOf(meld(), 'unregisterTrackObserver').at(-1).args, ['trk-1', 'ctx']);
  });
});

describe('transport', () => {
  test('POST /api/stream/toggle -> toggleStream()', async () => {
    const n = callOf(meld(), 'toggleStream').length;
    await post(url(), '/api/stream/toggle');
    assert.equal(callOf(meld(), 'toggleStream').length, n + 1);
  });

  test('POST /api/record/toggle -> toggleRecord()', async () => {
    const n = callOf(meld(), 'toggleRecord').length;
    await post(url(), '/api/record/toggle');
    assert.equal(callOf(meld(), 'toggleRecord').length, n + 1);
  });
});

describe('command deck  [Feature 3]', () => {
  test('POST /api/command needs command', async () => {
    const { status } = await post(url(), '/api/command', {});
    assert.equal(status, 400);
  });

  for (const command of [
    'meld.screenshot', 'meld.screenshot.vertical', 'meld.recordClip',
    'meld.replay.show', 'meld.replay.dismiss', 'meld.toggleVirtualCameraAction',
    'meld.startStreamingAction', 'meld.stopStreamingAction',
    'meld.startRecordingAction', 'meld.stopRecordingAction',
  ]) {
    test(`POST /api/command ${command} -> sendCommand`, async () => {
      await post(url(), '/api/command', { command });
      assert.deepEqual(callOf(meld(), 'sendCommand').at(-1).args, [command]);
    });
  }
});

// The stream-event bridge endpoint remains (the bridge wraps the full WebChannel
// API) even though the Widgets UI was removed. These guard the bridge contract.
describe('stream-event bridge endpoint', () => {
  test('POST /api/stream-event needs type', async () => {
    const { status } = await post(url(), '/api/stream-event', {});
    assert.equal(status, 400);
  });

  test('bare event -> sendStreamEvent(type) with no data arg', async () => {
    await post(url(), '/api/stream-event', { type: 'WHEELSPIN_SPIN' });
    const c = callOf(meld(), 'sendStreamEvent').at(-1);
    assert.deepEqual(c.args, ['WHEELSPIN_SPIN']);
  });

  test('event with data -> sendStreamEvent(type, data)', async () => {
    await post(url(), '/api/stream-event', { type: 'SUBATHONTIMER_ADDTIME', data: { amount: 60 } });
    const c = callOf(meld(), 'sendStreamEvent').at(-1);
    assert.deepEqual(c.args, ['SUBATHONTIMER_ADDTIME', { amount: 60 }]);
  });
});

describe('property management  [Feature 1]', () => {
  test('POST /api/property/:id needs property + value', async () => {
    const { status } = await post(url(), '/api/property/lay-1', { property: 'x' });
    assert.equal(status, 400);
  });

  test('POST /api/property/:id -> setProperty(id, prop, value)', async () => {
    await post(url(), '/api/property/lay-1', { property: 'rotation', value: 45 });
    assert.deepEqual(callOf(meld(), 'setProperty').at(-1).args, ['lay-1', 'rotation', 45]);
  });

  test('rename via setProperty (string value)', async () => {
    await post(url(), '/api/property/scene-1', { property: 'name', value: 'Intro' });
    assert.deepEqual(callOf(meld(), 'setProperty').at(-1).args, ['scene-1', 'name', 'Intro']);
  });

  test('batch needs props object', async () => {
    const { status } = await post(url(), '/api/property/lay-1/batch', {});
    assert.equal(status, 400);
  });

  test('batch -> one setProperty per prop', async () => {
    const before = callOf(meld(), 'setProperty').length;
    const { body } = await post(url(), '/api/property/lay-1/batch', {
      props: { x: 10, y: 20, width: 100, height: 50, rotation: 5 },
    });
    assert.equal(body.count, 5);
    assert.equal(callOf(meld(), 'setProperty').length, before + 5);
    const last5 = callOf(meld(), 'setProperty').slice(-5).map((c) => c.args);
    assert.deepEqual(last5, [
      ['lay-1', 'x', 10], ['lay-1', 'y', 20], ['lay-1', 'width', 100],
      ['lay-1', 'height', 50], ['lay-1', 'rotation', 5],
    ]);
  });
});

describe('media playback  [Feature 2]', () => {
  test('POST /api/call-function/:id needs command', async () => {
    const { status } = await post(url(), '/api/call-function/lay-1', {});
    assert.equal(status, 400);
  });

  test('no args -> callFunction(id, command)', async () => {
    await post(url(), '/api/call-function/lay-1', { command: 'play' });
    assert.deepEqual(callOf(meld(), 'callFunction').at(-1).args, ['lay-1', 'play']);
  });

  test('pause -> callFunction(id, "pause")', async () => {
    await post(url(), '/api/call-function/lay-1', { command: 'pause' });
    assert.deepEqual(callOf(meld(), 'callFunction').at(-1).args, ['lay-1', 'pause']);
  });

  test('with args -> callFunctionWithArgs(id, command, args)', async () => {
    await post(url(), '/api/call-function/lay-1', { command: 'seekTo', args: [42] });
    assert.deepEqual(callOf(meld(), 'callFunctionWithArgs').at(-1).args, ['lay-1', 'seekTo', [42]]);
  });
});

describe('disconnected bridge -> 503', () => {
  let down;
  before(async () => { down = await startServer({ connected: false }); });
  after(async () => { await down.close(); });

  test('mutating route returns 503 when Meld is not connected', async () => {
    const { status, body } = await post(down.url, '/api/command', { command: 'meld.screenshot' });
    assert.equal(status, 503);
    assert.match(body.error, /Not connected/);
  });

  test('GET /api/session returns 503 when not connected', async () => {
    const { status } = await get(down.url, '/api/session');
    assert.equal(status, 503);
  });
});
