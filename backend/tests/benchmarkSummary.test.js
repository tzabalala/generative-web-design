import { summarize } from '../scripts/benchmark.js';

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
