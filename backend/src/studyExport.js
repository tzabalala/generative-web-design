// Turns the raw `events` rows (see studyLog.js) into files you can open in Excel and into
// the numbers the Task Script asks for. Pure functions only: no database, no files, so
// they are easy to test.

// Approximate list prices in USD per million tokens (project notes, CLAUDE.md "API cost").
// An ESTIMATE for budgeting: check console.anthropic.com for the real bill.
const PRICES_PER_MILLION = [
  { match: /haiku-4-5/, input: 1, output: 5 },
  { match: /sonnet-5/, input: 2, output: 10 },
];

export function estimateCostUsd(model, inputTokens, outputTokens) {
  const price = PRICES_PER_MILLION.find((p) => model && p.match.test(model));
  if (!price) return null;
  const cost = ((inputTokens || 0) * price.input + (outputTokens || 0) * price.output) / 1_000_000;
  return Math.round(cost * 10000) / 10000;
}

// ---- CSV ------------------------------------------------------------------------------

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// A leading BOM makes Excel read the file as UTF-8, so Greek prompts do not turn into
// garbage characters when the file is opened by double-clicking.
export function toCsv(rows, columns) {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export const EVENT_COLUMNS = [
  'id', 'time', 'kind', 'session_id', 'participant', 'status', 'http_status', 'error_code',
  'duration_ms', 'model', 'from_cache', 'attempts', 'passed', 'remaining_issues', 'initial_issues',
  'input_tokens', 'output_tokens', 'estimated_cost_usd', 'prompt',
];

export function eventRows(events) {
  return events.map((e) => ({
    ...e,
    time: new Date(e.ts).toISOString(),
    estimated_cost_usd: estimateCostUsd(e.model, e.input_tokens, e.output_tokens),
  }));
}

// ---- numbers --------------------------------------------------------------------------

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : null);
const round = (n, digits = 1) => (n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits);

export function median(xs) {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const SESSION_COLUMNS = [
  'session_id', 'participant', 'started', 'model',
  'time_to_first_page_ms', 'first_try_passed', 'initial_issues', 'fix_attempts', 'generate_from_cache',
  'edits_ok', 'edits_failed', 'edits_blocked', 'avg_edit_ms', 'undos', 'final_passed',
  'requests_total', 'errors', 'total_server_ms', 'input_tokens', 'output_tokens', 'estimated_cost_usd',
];

// One row per session, with exactly the figures the Task Script's observer tables ask for.
// Events without a session (a generate request that failed before a session existed) cannot
// be attached to anyone; they are counted in the overall summary instead.
export function buildSessionSummaries(events) {
  const bySession = new Map();
  for (const e of events) {
    if (!e.session_id) continue;
    if (!bySession.has(e.session_id)) bySession.set(e.session_id, []);
    bySession.get(e.session_id).push(e);
  }

  const rows = [];
  for (const [sessionId, list] of bySession) {
    const ordered = [...list].sort((a, b) => a.ts - b.ts || a.id - b.id);
    const gen = ordered.find((e) => e.kind === 'generate' && e.status === 'ok');
    const refinesOk = ordered.filter((e) => e.kind === 'refine' && e.status === 'ok');
    const lastResult = [...ordered].reverse().find((e) => e.status === 'ok' && e.kind !== 'undo');
    const inTokens = sum(ordered.map((e) => e.input_tokens || 0));
    const outTokens = sum(ordered.map((e) => e.output_tokens || 0));
    const model = (gen || ordered[0]).model ?? null;

    rows.push({
      session_id: sessionId,
      participant: (gen || ordered[0]).participant ?? null,
      started: new Date(ordered[0].ts - (ordered[0].duration_ms || 0)).toISOString(),
      model,
      time_to_first_page_ms: gen ? gen.duration_ms : null,
      first_try_passed: gen ? (gen.attempts === 0 && gen.passed === 1 ? 1 : 0) : null,
      initial_issues: gen ? gen.initial_issues : null,
      fix_attempts: gen ? gen.attempts : null,
      generate_from_cache: gen ? gen.from_cache : null,
      edits_ok: refinesOk.length,
      edits_failed: ordered.filter((e) => e.kind === 'refine' && e.status === 'error').length,
      edits_blocked: ordered.filter((e) => e.kind === 'refine' && e.status === 'limit').length,
      avg_edit_ms: round(mean(refinesOk.map((e) => e.duration_ms || 0))),
      undos: ordered.filter((e) => e.kind === 'undo' && e.status === 'ok').length,
      final_passed: lastResult ? lastResult.passed : null,
      requests_total: ordered.length,
      errors: ordered.filter((e) => e.status === 'error').length,
      total_server_ms: sum(ordered.map((e) => e.duration_ms || 0)),
      input_tokens: inTokens,
      output_tokens: outTokens,
      estimated_cost_usd: estimateCostUsd(model, inTokens, outTokens),
    });
  }
  return rows.sort((a, b) => a.started.localeCompare(b.started));
}

// The headline numbers for the Evaluation chapter. Rates use only requests that really went
// through Claude and the checks (cache hits are counted separately, they prove nothing about
// the pipeline).
export function buildOverallSummary(events, sessionRows) {
  const generates = events.filter((e) => e.kind === 'generate' && e.status === 'ok');
  const fresh = generates.filter((e) => !e.from_cache);
  const firstTry = fresh.filter((e) => e.attempts === 0 && e.passed === 1);
  const times = fresh.map((e) => e.duration_ms).filter((n) => typeof n === 'number');
  const refinesOk = events.filter((e) => e.kind === 'refine' && e.status === 'ok');
  const inTokens = sum(events.map((e) => e.input_tokens || 0));
  const outTokens = sum(events.map((e) => e.output_tokens || 0));
  const models = [...new Set(events.map((e) => e.model).filter(Boolean))];
  // Cost is priced per model, so add up each model's tokens separately.
  let estimatedCost = 0;
  for (const model of models) {
    const own = events.filter((e) => e.model === model);
    estimatedCost +=
      estimateCostUsd(
        model,
        sum(own.map((e) => e.input_tokens || 0)),
        sum(own.map((e) => e.output_tokens || 0))
      ) || 0;
  }

  return {
    sessions: sessionRows.length,
    participants: new Set(sessionRows.map((r) => r.participant).filter(Boolean)).size,
    events: events.length,
    models,
    generates_fresh: fresh.length,
    generates_from_cache: generates.length - fresh.length,
    first_try_pass_rate_pct: fresh.length ? round((firstTry.length / fresh.length) * 100) : null,
    avg_fix_attempts: round(mean(fresh.map((e) => e.attempts || 0)), 2),
    avg_initial_issues: round(mean(fresh.map((e) => e.initial_issues || 0)), 2),
    final_pass_rate_pct: fresh.length
      ? round((fresh.filter((e) => e.passed === 1).length / fresh.length) * 100)
      : null,
    time_to_first_page_ms: { mean: round(mean(times)), median: round(median(times)) },
    refines_ok: refinesOk.length,
    avg_edits_per_session: sessionRows.length ? round(refinesOk.length / sessionRows.length, 2) : null,
    undos: events.filter((e) => e.kind === 'undo' && e.status === 'ok').length,
    errors: events.filter((e) => e.status === 'error').length,
    blocked_by_limit: events.filter((e) => e.status === 'limit').length,
    input_tokens: inTokens,
    output_tokens: outTokens,
    estimated_cost_usd: round(estimatedCost, 4),
  };
}
