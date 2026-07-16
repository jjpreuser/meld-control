// Thin fetch wrapper around the bridge's REST API.

const API = (() => {
  const base = '';
  return {
    async get(path) {
      const r = await fetch(`${base}${path}`);
      return r.json();
    },
    async post(path, body) {
      const r = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return r.json();
    },
  };
})();
