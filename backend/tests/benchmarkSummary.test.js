import { summarize, PROMPTS, isGreek, planResume, isOutOfCredit, details, ruleCounts, MAIN_COUNT, promptGroup } from '../scripts/benchmark.js';
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
    const main = PROMPTS.slice(0, MAIN_COUNT);
    expect(main.length).toBe(35);
    expect(PROMPTS[0]).toMatch(/freelance photographer/);
    expect(PROMPTS[9]).toMatch(/small business services page/);
    expect(main.filter(isGreek).length).toBe(7);
    // the last five of the main list ask for a whole website of several pages
    for (const p of main.slice(30)) expect(p).toMatch(/website|ιστότοπος/);
    expect(new Set(PROMPTS).size).toBe(PROMPTS.length);
  });

  it('adds 10 held-out prompts after the main list, reported as their own group', () => {
    expect(PROMPTS.length).toBe(45);
    expect(PROMPTS.slice(MAIN_COUNT).filter(isGreek).length).toBe(3);
    expect(promptGroup(PROMPTS[34])).toBe('main');
    expect(promptGroup(PROMPTS[35])).toBe('heldOut');
    const row = (group, passed) => ({ group, before: { passed: false }, after: { passed }, retries: 1 });
    const s = summarize([row('main', true), row('heldOut', false), row('heldOut', true), { before: { passed: true }, after: { passed: true } }]);
    expect(s.byGroup.main).toMatchObject({ sampleSize: 2, passedAfter: 2 }); // a row without a group is "main"
    expect(s.byGroup.heldOut).toMatchObject({ sampleSize: 2, passedAfter: 1, pctFullyPassingAfter: 50 });
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

describe('resuming an interrupted benchmark', () => {
  const prompts = ['a', 'b', 'c', 'd'];
  const meta = { model: 'haiku', promptVersion: 'v5' };
  const done = (prompt) => ({ prompt, before: {}, after: {}, retries: 0 });

  it('runs every prompt when there is no earlier run', () => {
    const { byPrompt, todo } = planResume(prompts, null, 'haiku', 'v5');
    expect(byPrompt.size).toBe(0);
    expect(todo).toEqual(prompts);
  });

  it('keeps the successful pages and runs the failed and missing ones again', () => {
    const previous = { meta, rows: [done('a'), { prompt: 'b', error: 'credit balance is too low' }, done('c')] };
    const { byPrompt, todo } = planResume(prompts, previous, 'haiku', 'v5');
    expect([...byPrompt.keys()]).toEqual(['a', 'c']);
    expect(todo).toEqual(['b', 'd']);
  });

  it('ignores earlier rows for prompts outside this run', () => {
    const previous = { meta, rows: [done('a'), done('old prompt')] };
    const { byPrompt } = planResume(prompts, previous, 'haiku', 'v5');
    expect([...byPrompt.keys()]).toEqual(['a']);
  });

  it('refuses to mix runs of a different model or prompt version', () => {
    const previous = { meta, rows: [done('a')] };
    expect(() => planResume(prompts, previous, 'sonnet', 'v5')).toThrow(/Cannot resume/);
    expect(() => planResume(prompts, previous, 'haiku', 'v6')).toThrow(/Cannot resume/);
  });

  it('recognises the out-of-credit error of the API and nothing else', () => {
    const real =
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}';
    expect(isOutOfCredit(real)).toBe(true);
    expect(isOutOfCredit('Claude output was cut off')).toBe(false);
    expect(isOutOfCredit(undefined)).toBe(false);
  });
});

describe('what failed, not only how much', () => {
  const validation = {
    accessibility: {
      violations: [
        { id: 'color-contrast', impact: 'serious', page: 'about', nodeCount: 3 },
        { id: 'link-name', impact: 'serious', nodeCount: 1 },
      ],
    },
    responsive: { issues: [`(page: index) The page is wider than the screen at 375px ${'x'.repeat(300)}`] },
    site: { issues: ['The home page does not link to: menu.'] },
  };

  it('keeps the axe rule and page of every violation and the text of every issue, cut short', () => {
    const d = details(validation);
    expect(d.accessibility).toEqual([
      { rule: 'color-contrast', impact: 'serious', page: 'about', elements: 3 },
      { rule: 'link-name', impact: 'serious', page: 'index', elements: 1 },
    ]);
    expect(d.responsive[0].length).toBeLessThanOrEqual(243);
    expect(d.responsive[0].endsWith('...')).toBe(true);
    expect(d.site).toEqual(['The home page does not link to: menu.']);
    expect(details({ ...validation, site: undefined }).site).toEqual([]);
  });

  it('counts the failing rules over all sites, most frequent first', () => {
    const row = (before, after) => ({
      before: { details: { accessibility: before.map((rule) => ({ rule })) } },
      after: { details: { accessibility: after.map((rule) => ({ rule })) } },
    });
    const counts = ruleCounts([row(['color-contrast', 'link-name'], ['color-contrast']), row(['color-contrast'], []), {}]);
    expect(counts.before).toEqual({ 'color-contrast': 2, 'link-name': 1 });
    expect(Object.keys(counts.before)[0]).toBe('color-contrast');
    expect(counts.after).toEqual({ 'color-contrast': 1 });
  });

  it('splits the result by site size and reports how many one-page requests got one page', () => {
    const row = (pages, scope, beforePassed, afterPassed) => ({
      pages,
      scope,
      before: { accessibilityViolations: 0, responsiveIssues: 0, passed: beforePassed },
      after: { accessibilityViolations: 0, responsiveIssues: 0, passed: afterPassed },
      retries: 1,
    });
    const s = summarize([row(1, 'one', false, true), row(3, 'one', false, false), row(5, 'site', true, true)]);
    expect(s.bySize.onePage).toMatchObject({ sampleSize: 1, pctFullyPassingBefore: 0, pctFullyPassingAfter: 100 });
    expect(s.bySize.severalPages).toMatchObject({ sampleSize: 2, passedBefore: 1, passedAfter: 1, pctFullyPassingAfter: 50 });
    expect(s.oneReadAsOne).toEqual({ asked: 2, gotOnePage: 1 });
    expect(s.failingRules).toEqual({ before: {}, after: {} });
  });
});
