import { resolveApiBase } from './apiBase.js';

const BASE_URL = resolveApiBase();

async function handle(res) {
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body.error || `Request failed with status ${res.status}`);
    err.status = res.status;
    err.code = body.code; // machine-readable code (e.g. ITERATION_LIMIT) that the UI can translate
    err.body = body;
    throw err;
  }
  return body;
}

// options.requestId: lets the page poll getProgress() while this call is running.
// options.participant: anonymous study code (see studyContext.js), stored with the session.
export function generatePage(prompt, { requestId, participant } = {}) {
  return fetch(`${BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, requestId, participant }),
  }).then(handle);
}

export function refinePage(sessionId, instruction, { requestId } = {}) {
  return fetch(`${BASE_URL}/api/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, instruction, requestId }),
  }).then(handle);
}

export function undoPage(sessionId) {
  return fetch(`${BASE_URL}/api/session/${sessionId}/undo`, { method: 'POST' }).then(handle);
}

export function getSession(sessionId) {
  return fetch(`${BASE_URL}/api/session/${sessionId}`).then(handle);
}

// Which step a running request is on: { stage: 'generating' | 'checking' | 'fixing' |
// 'designing' | 'cached' | null, attempt?, max? }.
export function getProgress(requestId) {
  return fetch(`${BASE_URL}/api/progress/${requestId}`).then(handle);
}
