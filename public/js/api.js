// Thin fetch wrapper around the bridge's REST API.
//
// Every call REJECTS on a non-2xx response (the bridge answers 503 while Meld is
// down and 400 on a bad body) so callers can't mistake an error envelope for a
// session. Before this check, `{ error: "Not connected" }` sailed through as if it
// were data and the UI happily rendered an empty, "Connected"-looking app.

class ApiError extends Error {
  constructor(status, message) {
    super(message || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

const API = (() => {
  const base = '';

  // Parse the body if we can, then throw when the status says this wasn't data.
  async function unwrap(r) {
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new ApiError(r.status, body && body.error);
    return body;
  }

  return {
    async get(path) {
      return unwrap(await fetch(`${base}${path}`));
    },
    async post(path, body) {
      return unwrap(await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      }));
    },
  };
})();
