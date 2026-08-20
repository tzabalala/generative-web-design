const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

async function handle(res) {
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body.error || `Request failed with status ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export function generatePage(prompt) {
  return fetch(`${BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  }).then(handle);
}

export function refinePage(sessionId, instruction) {
  return fetch(`${BASE_URL}/api/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, instruction }),
  }).then(handle);
}

export function undoPage(sessionId) {
  return fetch(`${BASE_URL}/api/session/${sessionId}/undo`, { method: 'POST' }).then(handle);
}

export function getSession(sessionId) {
  return fetch(`${BASE_URL}/api/session/${sessionId}`).then(handle);
}
