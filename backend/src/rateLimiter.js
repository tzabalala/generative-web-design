// Βήμα 12: rate limiting ανά session — λόγοι UX, όχι κόστους.
export function iterationLimit() {
  return Number(process.env.MAX_ITERATIONS_PER_SESSION) || 15;
}

export function isOverLimit(session) {
  return session.iterationCount >= iterationLimit();
}
