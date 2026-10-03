import {
  csvCell, toCsv, estimateCostUsd, median, eventRows, EVENT_COLUMNS,
  buildSessionSummaries, buildOverallSummary,
} from '../src/studyExport.js';

describe('CSV output', () => {
  it('quotes cells containing commas, quotes or line breaks, and doubles inner quotes', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(0)).toBe('0');
  });

  it('starts with a UTF-8 BOM so Excel shows Greek text correctly', () => {
    const csv = toCsv([{ a: 'Καλημέρα', b: 1 }], ['a', 'b']);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('a,b\r\nΚαλημέρα,1\r\n');
  });

  it('turns events into rows with an ISO time and an estimated cost', () => {
    const [row] = eventRows([
      { id: 1, ts: Date.UTC(2026, 9, 12, 8, 30), model: 'claude-haiku-4-5-20251001', input_tokens: 1_000_000, output_tokens: 0 },
    ]);
    expect(row.time).toBe('2026-10-12T08:30:00.000Z');
    expect(row.estimated_cost_usd).toBe(1);
    expect(EVENT_COLUMNS).toContain('prompt');
  });
});

describe('estimateCostUsd', () => {
  it('prices Haiku and Sonnet per million tokens and returns null for unknown models', () => {
    expect(estimateCostUsd('claude-haiku-4-5-20251001', 10_000, 12_000)).toBe(0.07); // ~ the measured cost of one Greek page
    expect(estimateCostUsd('claude-sonnet-5', 1_000_000, 1_000_000)).toBe(12);
    expect(estimateCostUsd('some-other-model', 5, 5)).toBeNull();
    expect(estimateCostUsd(null, 5, 5)).toBeNull();
  });
});

describe('median', () => {
  it('handles odd, even and empty lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

// One participant's session, as the API would have logged it.
const T0 = Date.UTC(2026, 9, 12, 9, 0, 0);
const ev = (over) => ({
  id: 0, ts: T0, kind: 'generate', session_id: 'S1', participant: 'P01', status: 'ok',
  duration_ms: 1000, model: 'claude-haiku-4-5-20251001', from_cache: 0, attempts: 0, passed: 1,
  remaining_issues: 0, initial_issues: 0, input_tokens: 1000, output_tokens: 2000, ...over,
});

describe('buildSessionSummaries', () => {
  it('computes the figures the Task Script asks for', () => {
    const events = [
      ev({ id: 1, ts: T0 + 60_000, duration_ms: 60_000, attempts: 2, initial_issues: 3 }),
      ev({ id: 2, ts: T0 + 90_000, kind: 'refine', duration_ms: 30_000, attempts: 0 }),
      ev({ id: 3, ts: T0 + 150_000, kind: 'refine', duration_ms: 50_000, attempts: 1, passed: 1 }),
      ev({ id: 4, ts: T0 + 151_000, kind: 'undo', duration_ms: 5, input_tokens: null, output_tokens: null, model: null }),
      ev({ id: 5, ts: T0 + 160_000, kind: 'refine', status: 'error', duration_ms: 2000 }),
    ];
    const [s] = buildSessionSummaries(events);
    expect(s).toMatchObject({
      session_id: 'S1', participant: 'P01',
      time_to_first_page_ms: 60_000, first_try_passed: 0, initial_issues: 3, fix_attempts: 2,
      edits_ok: 2, edits_failed: 1, edits_blocked: 0, avg_edit_ms: 40_000, undos: 1,
      final_passed: 1, requests_total: 5, errors: 1,
    });
    expect(s.started).toBe(new Date(T0).toISOString()); // end time minus its duration
    expect(s.estimated_cost_usd).toBeGreaterThan(0);
  });

  it('flags a clean first try, and keeps different sessions apart', () => {
    const rows = buildSessionSummaries([
      ev({ id: 1, session_id: 'A', participant: 'P01' }),
      ev({ id: 2, session_id: 'B', participant: 'P02', attempts: 3, passed: 0, initial_issues: 2 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.session_id === 'A').first_try_passed).toBe(1);
    expect(rows.find((r) => r.session_id === 'B').first_try_passed).toBe(0);
    expect(rows.find((r) => r.session_id === 'B').final_passed).toBe(0);
  });

  it('ignores events that never got a session (failed generates)', () => {
    expect(buildSessionSummaries([ev({ id: 1, session_id: null, status: 'error' })])).toEqual([]);
  });
});

describe('buildOverallSummary', () => {
  it('reports rates over fresh pages only, and counts cache hits separately', () => {
    const events = [
      ev({ id: 1, session_id: 'A', participant: 'P01', attempts: 0, duration_ms: 40_000 }),
      ev({ id: 2, session_id: 'B', participant: 'P02', attempts: 2, initial_issues: 4, duration_ms: 80_000 }),
      ev({ id: 3, session_id: 'C', participant: 'P03', from_cache: 1, duration_ms: 20, input_tokens: 0, output_tokens: 0 }),
      ev({ id: 4, session_id: null, status: 'error' }),
    ];
    const sessions = buildSessionSummaries(events);
    const o = buildOverallSummary(events, sessions);
    expect(o).toMatchObject({
      sessions: 3, participants: 3, generates_fresh: 2, generates_from_cache: 1,
      first_try_pass_rate_pct: 50, avg_fix_attempts: 1, avg_initial_issues: 2,
      final_pass_rate_pct: 100, errors: 1,
    });
    expect(o.time_to_first_page_ms).toEqual({ mean: 60_000, median: 60_000 });
  });

  it('does not divide by zero when there is no data', () => {
    const o = buildOverallSummary([], []);
    expect(o.first_try_pass_rate_pct).toBeNull();
    expect(o.avg_edits_per_session).toBeNull();
    expect(o.estimated_cost_usd).toBe(0);
  });
});
