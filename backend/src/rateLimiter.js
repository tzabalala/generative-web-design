// Step 12: per-session rate limiting — for UX reasons, not cost.
export function iterationLimit() {
  return Number(process.env.MAX_ITERATIONS_PER_SESSION) || 15;
}

export function isOverLimit(session) {
  return session.iterationCount >= iterationLimit();
}
