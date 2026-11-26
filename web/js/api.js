// API client. Real mode talks to the `play` Edge Function with the key from the
// URL fragment. Demo mode uses the in-browser engine (js/demo.js).

export function readKey() {
  const m = location.hash.match(/k=([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
}

export function functionsUrl() {
  const cfg = window.TDR_CONFIG ?? {};
  return (cfg.functionsUrl ?? '').replace(/\/$/, '');
}

async function post(fn, body) {
  const cfg = window.TDR_CONFIG ?? {};
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.anonKey) {
    headers.apikey = cfg.anonKey;
    // Legacy anon keys are JWTs and go in Authorization too; newer publishable keys don't.
    if (cfg.anonKey.startsWith('eyJ')) headers.Authorization = `Bearer ${cfg.anonKey}`;
  }
  const res = await fetch(`${functionsUrl()}/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export function realApi(key) {
  return {
    demo: false,
    state: () => post('play', { key, action: 'state' }),
    lockin: (body) => post('play', { key, action: 'lockin', ...body }),
    replay: (date) => post('play', { key, action: 'replay', date }),
    hall: () => post('play', { key, action: 'hall' }),
  };
}

export function adminApi(key) {
  return (action, body = {}) => post('admin', { key, action, ...body });
}
export const bootstrapAdmin = (token) => post('admin', { action: 'bootstrap', token });

export async function demoApi() {
  if (!window.TDR_DEMO) await import('./demo.js');
  return window.TDR_DEMO.createDemoApi();
}
