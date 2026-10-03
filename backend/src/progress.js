// Live progress of a running generate/refine request, so the UI can show what is
// happening during the 1-2 minute wait ("checking", "fixing attempt 2 of 3", ...)
// instead of a bare spinner.
//
// The browser invents a random requestId, sends it with the request, and polls
// GET /api/progress/:id while it waits. State lives in memory only (it is worthless
// after the request ends) and entries expire on their own.
const jobs = new Map();
const TTL_MS = 10 * 60 * 1000;
const MAX_JOBS = 500;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function sweep(now = Date.now()) {
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > TTL_MS) jobs.delete(id);
  }
  // Hard cap as a safety net: drop the oldest entries first (Map keeps insertion order).
  while (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value);
}

export function isValidRequestId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

// Returns a function report(stage, extra). With a missing/invalid id it is a harmless no-op,
// so callers never need to check.
export function createReporter(requestId) {
  if (!isValidRequestId(requestId)) return () => {};
  sweep();
  return (stage, extra = {}) => {
    jobs.set(requestId, { stage, ...extra, updatedAt: Date.now() });
  };
}

export function getProgress(requestId) {
  const job = isValidRequestId(requestId) ? jobs.get(requestId) : undefined;
  if (!job) return { stage: null };
  const { updatedAt, ...rest } = job; // eslint-disable-line no-unused-vars
  return rest;
}

export function clearProgress() {
  jobs.clear();
}
