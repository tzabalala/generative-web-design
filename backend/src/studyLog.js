import { getDb } from './db.js';

// Append-only log of everything a user does that costs time or money (generate, refine,
// undo), used for the user study and for cost/performance analysis.
//
// Why a separate table instead of reading the session history:
//  - undo DELETES the latest history entry, which would silently erase study data;
//  - failed requests (502/500) and blocked ones (429) leave no history entry at all;
//  - durations only exist while the request is running.
//
// Logging must NEVER break the app: any failure is reported as a warning and swallowed.

// Participant codes come from the URL (?p=P03). Only a short, harmless code is accepted:
// letters, digits, dash, underscore. Anything else is dropped, so a real name typed by
// mistake can never end up in the database through this field.
const PARTICIPANT_RE = /^[A-Za-z0-9_-]{1,24}$/;

export function cleanParticipant(value) {
  return typeof value === 'string' && PARTICIPANT_RE.test(value) ? value : null;
}

const flag = (v) => (v === undefined || v === null ? null : v ? 1 : 0);

// Pulls the numbers we analyse out of a validation result (see validationLoop.js).
export function validationStats(validation) {
  if (!validation) return {};
  const firstFailure = validation.retryHistory?.[0];
  return {
    attempts: validation.attempts ?? null,
    passed: validation.passed,
    remainingIssues: validation.remainingIssues?.length ?? 0,
    // issues found in the RAW generation, before any automatic fix (0 = clean first try)
    initialIssues: firstFailure ? firstFailure.issues.length : 0,
  };
}

// One readable line per finished request, printed in the backend terminal so you can see
// what happened behind the scenes (silent in tests).
export function describeEvent(e) {
  const parts = [e.kind, e.status];
  if (e.durationMs !== undefined && e.durationMs !== null) parts.push(`${(e.durationMs / 1000).toFixed(1)}s`);
  if (e.fromCache) parts.push('from cache, Claude not called');
  if (e.attempts !== undefined && e.attempts !== null) {
    parts.push(e.attempts === 0 ? 'no fix needed' : `${e.attempts} automatic fix${e.attempts === 1 ? '' : 'es'}`);
  }
  if (e.passed !== undefined && e.passed !== null) parts.push(e.passed ? 'all checks passed' : 'CHECKS STILL FAILING');
  if (e.errorCode) parts.push(e.errorCode);
  if (e.participant) parts.push(`participant ${e.participant}`);
  return `[request] ${parts.join(' | ')}`;
}

export function logEvent(event) {
  try {
    getDb()
      .prepare(
        `INSERT INTO events
           (ts, kind, session_id, participant, status, http_status, error_code, duration_ms,
            model, from_cache, prompt, attempts, passed, remaining_issues, initial_issues,
            input_tokens, output_tokens)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        Date.now(),
        event.kind,
        event.sessionId ?? null,
        event.participant ?? null,
        event.status,
        event.httpStatus ?? null,
        event.errorCode ?? null,
        event.durationMs ?? null,
        event.model ?? null,
        flag(event.fromCache),
        event.prompt ?? null,
        event.attempts ?? null,
        flag(event.passed),
        event.remainingIssues ?? null,
        event.initialIssues ?? null,
        event.usage?.inputTokens ?? null,
        event.usage?.outputTokens ?? null
      );
    if (process.env.NODE_ENV !== 'test') console.log(describeEvent(event));
  } catch (err) {
    console.warn(`[study-log] could not record event: ${err.message}`);
  }
}
