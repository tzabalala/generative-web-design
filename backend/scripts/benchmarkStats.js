// Summary figures of a benchmark run, kept apart from benchmark.js so that other scripts
// (rescoreBenchmark.js) can use them: importing benchmark.js itself starts a real, paid run.

export const counts = (v) => ({
  accessibilityViolations: v.accessibility.violations.length,
  responsiveIssues: v.responsive.issues.length,
  // the real layout check on its own (a subset of responsiveIssues; 0 when it is switched off)
  layoutIssues: v.responsive.visual?.issues?.length ?? 0,
  // how the pages fit together (links, shared menu, distinct content); 0 for a one-page site
  siteIssues: v.site?.issues?.length ?? 0,
  passed: v.passed,
  details: details(v),
});

// WHAT failed, not only how much: the axe rule and page of every violation, and the text of
// every responsive and site issue (cut short), so failures can be explained afterwards.
export function details(v) {
  const short = (s) => (String(s).length > 240 ? `${String(s).slice(0, 240)}...` : String(s));
  return {
    accessibility: v.accessibility.violations.map((x) => ({
      rule: x.id,
      impact: x.impact,
      page: x.page ?? 'index',
      elements: x.nodeCount,
    })),
    responsive: v.responsive.issues.map(short),
    site: (v.site?.issues ?? []).map(short),
  };
}

// Counts of the failing axe rules over all rows, before and after the loop, most frequent first.
export function ruleCounts(rows) {
  const tally = (when) => {
    const counts = {};
    for (const r of rows) for (const a of r[when]?.details?.accessibility ?? []) counts[a.rule] = (counts[a.rule] ?? 0) + 1;
    return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
  };
  return { before: tally('before'), after: tally('after') };
}

export function summarize(allRows) {
  const rows = allRows.filter((r) => !r.error);
  const failedCount = allRows.length - rows.length;
  const n = rows.length;
  const avg = (fn) => (n ? rows.reduce((sum, r) => sum + fn(r), 0) / n : 0);
  const pct = (fn) => (n ? (rows.filter(fn).length / n) * 100 : 0);
  const num = (v) => (typeof v === 'number' ? v : 0);

  const byLanguage = {};
  for (const lang of ['en', 'el']) {
    const subset = rows.filter((r) => (r.language ?? 'en') === lang);
    if (!subset.length) continue;
    const share = (fn) => (subset.filter(fn).length / subset.length) * 100;
    byLanguage[lang] = {
      sampleSize: subset.length,
      pctFullyPassingBefore: share((r) => r.before.passed),
      pctFullyPassingAfter: share((r) => r.after.passed),
    };
  }

  return {
    sampleSize: n,
    failedCount,
    before: {
      avgAccessibilityViolations: avg((r) => r.before.accessibilityViolations),
      avgResponsiveIssues: avg((r) => r.before.responsiveIssues),
      avgLayoutIssues: avg((r) => num(r.before.layoutIssues)),
      pctFullyPassing: pct((r) => r.before.passed),
    },
    after: {
      avgAccessibilityViolations: avg((r) => r.after.accessibilityViolations),
      avgResponsiveIssues: avg((r) => r.after.responsiveIssues),
      avgLayoutIssues: avg((r) => num(r.after.layoutIssues)),
      pctFullyPassing: pct((r) => r.after.passed),
    },
    avgRetriesNeeded: avg((r) => r.retries),
    avgSeconds: avg((r) => num(r.seconds)),
    totalInputTokens: rows.reduce((s, r) => s + num(r.usage?.inputTokens), 0),
    totalOutputTokens: rows.reduce((s, r) => s + num(r.usage?.outputTokens), 0),
    byLanguage,
    bySize: group(rows, (r) => ((r.pages ?? 1) > 1 ? 'severalPages' : 'onePage')),
    byGroup: group(rows, (r) => r.group ?? 'main'),
    // requests that the code reads as ONE page (pageScope.js) and how many really got one
    oneReadAsOne: (() => {
      const asked = rows.filter((r) => r.scope === 'one');
      return { asked: asked.length, gotOnePage: asked.filter((r) => (r.pages ?? 1) === 1).length };
    })(),
    failingRules: ruleCounts(rows),
  };
}

// Share of fully passing rows before and after, per group (key(row) names the group)
function group(rows, key) {
  const out = {};
  for (const r of rows) {
    const g = (out[key(r)] ??= { sampleSize: 0, passedBefore: 0, passedAfter: 0 });
    g.sampleSize += 1;
    if (r.before.passed) g.passedBefore += 1;
    if (r.after.passed) g.passedAfter += 1;
  }
  for (const g of Object.values(out)) {
    g.pctFullyPassingBefore = (g.passedBefore / g.sampleSize) * 100;
    g.pctFullyPassingAfter = (g.passedAfter / g.sampleSize) * 100;
  }
  return out;
}

