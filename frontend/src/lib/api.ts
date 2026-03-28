/** Thin client for the Python FastAPI backend (proxied via /api/backend/*) */

const BASE = '/api/backend'

export const backendApi = {
  ibkrStatus: () =>
    fetch(`${BASE}/ibkr/status`).then((r) => r.json()),

  ibkrConnect: () =>
    fetch(`${BASE}/ibkr/connect`, { method: 'POST' }).then((r) => r.json()),

  scanTrigger: () =>
    fetch(`${BASE}/scan/trigger`, { method: 'POST' }).then((r) => r.json()),

  scanStatus: () =>
    fetch(`${BASE}/scan/status`).then((r) => r.json()),

  candles: (ticker: string) =>
    fetch(`${BASE}/candles/${ticker}`).then((r) => r.json()),
}
