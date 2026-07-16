const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const { QWebChannel } = require('./qwebchannel.js');

const MELD_HOST = process.env.MELD_HOST || '127.0.0.1';
const MELD_PORT = parseInt(process.env.MELD_PORT, 10) || 13376;
const HTTP_PORT = parseInt(process.env.HTTP_PORT, 10) || 3000;

class WebSocketTransport {
  constructor(ws) {
    this.ws = ws;
    ws.on('message', (data) => {
      if (this.onmessage) {
        this.onmessage({ data: data.toString() });
      }
    });
  }
  send(data) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }
}

class MeldBridge {
  constructor() {
    this.ws = null;
    this.meld = null;
    this.connected = false;
    this.reconnecting = false;

    this.cache = {
      session: { items: {} },
      isStreaming: false,
      isRecording: false,
      version: 1,
      sceneTimers: {},
    };

    this.uiSockets = new Set();
    this.initializePromise = null;
    this.initializeResolve = null;
  }

  connect() {
    const url = `ws://${MELD_HOST}:${MELD_PORT}`;
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.reconnecting = false;
      const transport = new WebSocketTransport(this.ws);
      new QWebChannel(transport, (channel) => {
        this.meld = channel.objects.meld;
        this.connected = true;

        this.cache.version = this.meld.version || 1;
        this.cache.session = this.meld.session || { items: {} };
        this.cache.isStreaming = !!this.meld.isStreaming;
        this.cache.isRecording = !!this.meld.isRecording;

        this.cache.sceneTimers = {};
        for (const [id, item] of Object.entries(this.cache.session.items || {})) {
          if (item.type === 'scene' && item.current) {
            this.cache.sceneTimers[id] = Date.now();
          }
        }

        this.meld.sessionChanged.connect(() => {
          const prevSession = this.cache.session;
          const newSession = this.meld.session || { items: {} };

          for (const [id, item] of Object.entries(newSession.items || {})) {
            if (item.type === 'scene' && item.current) {
              const wasCurrent = prevSession?.items?.[id]?.current;
              if (!wasCurrent) {
                this.cache.sceneTimers[id] = Date.now();
              }
            }
          }

          this.cache.session = newSession;
          this.broadcast({ type: 'update', key: 'session', value: this.cache.session, sceneTimers: this.cache.sceneTimers });
        });

        this.meld.isStreamingChanged.connect(() => {
          this.cache.isStreaming = !!this.meld.isStreaming;
          this.broadcast({ type: 'update', key: 'isStreaming', value: this.cache.isStreaming });
        });

        this.meld.isRecordingChanged.connect(() => {
          this.cache.isRecording = !!this.meld.isRecording;
          this.broadcast({ type: 'update', key: 'isRecording', value: this.cache.isRecording });
        });

        this.meld.gainUpdated.connect((trackId, gain, muted) => {
          this.broadcast({ type: 'gain', trackId, gain, muted });
        });

        if (this.initializeResolve) {
          this.initializeResolve();
          this.initializeResolve = null;
        }

        // Push the fresh session to any already-connected browsers. On first
        // connect there are none (initialize() handles that); on reconnect after
        // a Meld restart this replaces the stale data they'd otherwise keep.
        this.broadcast({ type: 'update', key: 'session', value: this.cache.session, sceneTimers: this.cache.sceneTimers });
        this.broadcast({ type: 'update', key: 'isStreaming', value: this.cache.isStreaming });
        this.broadcast({ type: 'update', key: 'isRecording', value: this.cache.isRecording });
      });
    });

    this.ws.on('close', () => {
      this.connected = false;
      this.meld = null;
      if (!this.reconnecting) {
        this.reconnecting = true;
        setTimeout(() => this.connect(), 2000);
      }
    });

    this.ws.on('error', () => {});
  }

  ensureConnected() {
    if (!this.connected || !this.meld) {
      throw new Error('Not connected to Meld Studio');
    }
  }

  broadcast(data) {
    const str = JSON.stringify(data);
    for (const sock of this.uiSockets) {
      try {
        sock.send(str);
      } catch {
        this.uiSockets.delete(sock);
      }
    }
  }

  async initialize() {
    this.initializePromise = new Promise((resolve) => {
      this.initializeResolve = resolve;
    });
    return this.initializePromise;
  }
}

async function main() {
  const bridge = new MeldBridge();
  bridge.connect();

  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  wss.on('connection', (ws) => {
    bridge.uiSockets.add(ws);
    ws.on('close', () => bridge.uiSockets.delete(ws));
  });

  function api(fn) {
    return (req, res) => {
      try {
        bridge.ensureConnected();
      } catch (e) {
        return res.status(503).json({ error: e.message });
      }
      fn(req, res).catch(err => res.status(500).json({ error: err.message }));
    };
  }

  app.get('/api/session', api(async (req, res) => {
    res.json(bridge.cache);
  }));

  app.post('/api/scene/:id/show', api(async (req, res) => {
    bridge.meld.showScene(req.params.id);
    res.json({ ok: true });
  }));

  app.post('/api/scene/:id/stage', api(async (req, res) => {
    bridge.meld.setStagedScene(req.params.id);
    res.json({ ok: true });
  }));

  app.post('/api/scene/staged/show', api(async (req, res) => {
    bridge.meld.showStagedScene();
    res.json({ ok: true });
  }));

  app.post('/api/layer/:id/toggle', api(async (req, res) => {
    const { sceneId } = req.body || {};
    if (!sceneId) return res.status(400).json({ error: 'sceneId required in body' });
    bridge.meld.toggleLayer(sceneId, req.params.id);
    res.json({ ok: true });
  }));

  app.post('/api/effect/:id/toggle', api(async (req, res) => {
    const { sceneId, layerId } = req.body || {};
    if (!sceneId || !layerId) return res.status(400).json({ error: 'sceneId and layerId required in body' });
    bridge.meld.toggleEffect(sceneId, layerId, req.params.id);
    res.json({ ok: true });
  }));

  app.post('/api/track/:id/mute', api(async (req, res) => {
    bridge.meld.toggleMute(req.params.id);
    res.json({ ok: true });
  }));

  app.post('/api/track/:id/monitor', api(async (req, res) => {
    bridge.meld.toggleMonitor(req.params.id);
    res.json({ ok: true });
  }));

  app.post('/api/track/:id/gain', api(async (req, res) => {
    const { gain } = req.body || {};
    if (gain === undefined) return res.status(400).json({ error: 'gain required in body' });
    bridge.meld.setGain(req.params.id, gain);
    res.json({ ok: true });
  }));

  app.post('/api/stream/toggle', api(async (req, res) => {
    bridge.meld.toggleStream();
    res.json({ ok: true });
  }));

  app.post('/api/record/toggle', api(async (req, res) => {
    bridge.meld.toggleRecord();
    res.json({ ok: true });
  }));

  app.post('/api/command', api(async (req, res) => {
    const { command } = req.body || {};
    if (!command) return res.status(400).json({ error: 'command required in body' });
    bridge.meld.sendCommand(command);
    res.json({ ok: true });
  }));

  app.post('/api/stream-event', api(async (req, res) => {
    const { type, data } = req.body || {};
    if (!type) return res.status(400).json({ error: 'type required in body' });
    if (data !== undefined) {
      bridge.meld.sendStreamEvent(type, data);
    } else {
      bridge.meld.sendStreamEvent(type);
    }
    res.json({ ok: true });
  }));

  app.post('/api/property/:id', api(async (req, res) => {
    const { property, value } = req.body || {};
    if (!property || value === undefined) return res.status(400).json({ error: 'property and value required in body' });
    bridge.meld.setProperty(req.params.id, property, value);
    res.json({ ok: true });
  }));

  app.post('/api/call-function/:id', api(async (req, res) => {
    const { command, args } = req.body || {};
    if (!command) return res.status(400).json({ error: 'command required in body' });
    if (args) {
      bridge.meld.callFunctionWithArgs(req.params.id, command, args);
    } else {
      bridge.meld.callFunction(req.params.id, command);
    }
    res.json({ ok: true });
  }));

  app.post('/api/track/observer/register', api(async (req, res) => {
    const { trackId, context } = req.body || {};
    if (!trackId || !context) return res.status(400).json({ error: 'trackId and context required' });
    bridge.meld.registerTrackObserver(trackId, context);
    res.json({ ok: true });
  }));

  app.post('/api/track/observer/unregister', api(async (req, res) => {
    const { trackId, context } = req.body || {};
    if (!trackId || !context) return res.status(400).json({ error: 'trackId and context required' });
    bridge.meld.unregisterTrackObserver(trackId, context);
    res.json({ ok: true });
  }));

  app.get('/api/version', api(async (req, res) => {
    res.json({ version: bridge.cache.version });
  }));

  app.get('/api/debug/meld', api(async (req, res) => {
    const shape = {};
    for (const key of Object.keys(bridge.meld)) {
      const v = bridge.meld[key];
      shape[key] = typeof v === 'object' && v && v.connect ? 'signal' : typeof v;
    }
    res.json(shape);
  }));

  app.post('/api/scene/:id/switch', api(async (req, res) => {
    bridge.meld.showScene(req.params.id);
    res.json({ ok: true });
  }));

  server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`Meld Studio Control Bridge`);
    console.log(`  Local:    http://127.0.0.1:${HTTP_PORT}`);
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`  Network:  http://${iface.address}:${HTTP_PORT}`);
        }
      }
    }
    console.log(`\nWaiting for Meld Studio connection...`);

    bridge.initialize().then(() => {
      const count = Object.keys(bridge.cache.session.items || {}).length;
      bridge.broadcast({ type: 'update', key: 'session', value: bridge.cache.session, sceneTimers: bridge.cache.sceneTimers });
      console.log(`Connected to Meld Studio (API v${bridge.cache.version})`);
      console.log(`  ${count} items in session`);
    }).catch(() => {});
  });
}

main();
