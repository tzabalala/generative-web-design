import { summarize, PROMPTS, isGreek } from '../scripts/benchmark.js';
import { compareSummaries, samePrompts } from '../scripts/compareBenchmarks.js';

describe('summarize', () => {
  it('averages violations/issues and computes pass percentages', () => {
    const rows = [
      {
        before: { accessibilityViolations: 2, responsiveIssues: 1, passed: false },
        after: { accessibilityViolations: 0, responsiveIssues: 0, passed: true },
        retries: 1,
      },
      {
        before: { accessibilityViolations: 0, responsiveIssues: 1, passed: false },
        after: { accessibilityViolations: 0, responsiveIssues: 1, passed: false },
        retries: 3,
      },
    ];

    const summary = summarize(rows);

    expect(summary.sampleSize).toBe(2);
    expect(summary.before.avgAccessibilityViolations).toBe(1);
    expect(summary.before.pctFullyPassing).toBe(0);
    expect(summary.after.avgAccessibilityViolations).toBe(0);
    expect(summary.after.pctFullyPassing).toBe(50);
    expect(summary.avgRetriesNeeded).toBe(2);
    expect(summary.failedCount).toBe(0);
  });

  it('excludes failed rows from the averages but counts them', () => {
    const rows = [
      {
        before: { accessibilityViolations: 0, responsiveIssues: 0, passed: true },
        after: { accessibilityViolations: 0, responsiveIssues: 0, passed: true },
        retries: 0,
      },
      { error: 'Claude output was cut off' },
    ];

    const summary = summarize(rows);

    expect(summary.sampleSize).toBe(1);
    expect(summary.failedCount).toBe(1);
    expect(summary.after.pctFullyPassing).toBe(100);
  });
});

describe('summarize: the extra figures of the larger benchmark', () => {
  const row = (language, beforePassed, afterPassed, extra = {}) => ({
    language,
    before: { accessibilityViolations: 1, responsiveIssues: 0, layoutIssues: 0, passed: beforePassed },
    after: { accessibilityViolations: 0, responsiveIssues: 0, layoutIssues: 0, passed: afterPassed },
    retries: 1,
    seconds: 20,
    usage: { inputTokens: 1000, outputTokens: 4000 },
    ...extra,
  });

  it('adds time, tokens and a per-language breakdown', () => {
    const s = summarize([row('en', false, true), row('en', true, true), row('el', false, false, { seconds: 40 })]);
    expect(s.avgSeconds).toBeCloseTo(26.67, 1);
    expect(s.totalInputTokens).toBe(3000);
    expect(s.totalOutputTokens).toBe(12000);
    expect(s.byLanguage.en).toEqual({ sampleSize: 2, pctFullyPassingBefore: 50, pctFullyPassingAfter: 100 });
    expect(s.byLanguage.el).toEqual({ sampleSize: 1, pctFullyPassingBefore: 0, pctFullyPassingAfter: 0 });
  });

  it('still understands rows from the first benchmark (no language, seconds or usage)', () => {
    const old = {
      before: { accessibilityViolations: 1, responsiveIssues: 0, passed: false },
      after: { accessibilityViolations: 0, responsiveIssues: 0, passed: true },
      retries: 2,
    };
    const s = summarize([old]);
    expect(s.sampleSize).toBe(1);
    expect(s.avgSeconds).toBe(0);
    expect(s.before.avgLayoutIssues).toBe(0);
    expect(Object.keys(s.byLanguage)).toEqual(['en']);
  });
});

describe('benchmark prompt set', () => {
  it('keeps the original 10 prompts first and includes Greek ones', () => {
    expect(PROMPTS.length).toBe(35);
    expect(PROMPTS[0]).toMatch(/freelance photographer/);
    expect(PROMPTS[9]).toMatch(/small business services page/);
    expect(PROMPTS.filter(isGreek).length).toBe(7);
    // the last five ask for a whole website of several pages
    for (const p of PROMPTS.slice(30)) expect(p).toMatch(/website|ιστότοπος/);
    expect(new Set(PROMPTS).size).toBe(PROMPTS.length);
  });
});

describe('compareSummaries', () => {
  const result = (model, pct, cost) => ({
    meta: { model, estimatedCostUsd: cost },
    summary: {
      sampleSize: 10, avgRetriesNeeded: 1.4, avgSeconds: 30,
      before: { pctFullyPassing: 30, avgAccessibilityViolations: 0.7, avgLayoutIssues: 0 },
      after: { pctFullyPassing: pct, avgAccessibilityViolations: 0.1, avgLayoutIssues: 0 },
    },
    rows: [{ prompt: 'a' }, { prompt: 'b' }],
  });

  it('lines the two runs up row by row', () => {
    const rows = compareSummaries(result('haiku', 90, 0.4), result('sonnet', 100, 0.9));
    const after = rows.find((r) => r.label.startsWith('fully passing AFTER'));
    expect(after).toEqual({ label: 'fully passing AFTER the loop (%)', a: '90.0', b: '100.0' });
    expect(rows[0]).toEqual({ label: 'model', a: 'haiku', b: 'sonnet' });
  });

  it('detects runs that did not use the same prompts', () => {
    const a = result('x', 1, 1);
    const b = { ...result('y', 1, 1), rows: [{ prompt: 'a' }, { prompt: 'different' }] };
    expect(samePrompts(a, a)).toBe(true);
    expect(samePrompts(a, b)).toBe(false);
  });
});
