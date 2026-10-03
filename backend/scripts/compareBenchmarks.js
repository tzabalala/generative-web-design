import { readFileSync } from 'fs';

// Puts two benchmark result files side by side (typically a Haiku run and a Sonnet run of
// the same prompts):
//
//   npm run benchmark:compare -- benchmark-runs/dev_....json benchmark-runs/demo_....json
//
// Both runs should use the same pages; the script warns when they do not.

const f1 = (n) => (typeof n === 'number' ? n.toFixed(1) : '-');
const f2 = (n) => (typeof n === 'number' ? n.toFixed(2) : '-');

// Pure function (easy to test): the rows of the comparison table.
export function compareSummaries(a, b) {
  const row = (label, pick, fmt) => ({ label, a: fmt(pick(a.summary)), b: fmt(pick(b.summary)) });
  return [
    { label: 'model', a: a.meta?.model ?? '-', b: b.meta?.model ?? '-' },
    row('pages measured', (s) => s.sampleSize, String),
    row('fully passing BEFORE the loop (%)', (s) => s.before.pctFullyPassing, f1),
    row('fully passing AFTER the loop (%)', (s) => s.after.pctFullyPassing, f1),
    row('avg accessibility violations before', (s) => s.before.avgAccessibilityViolations, f2),
    row('avg accessibility violations after', (s) => s.after.avgAccessibilityViolations, f2),
    row('avg layout issues before', (s) => s.before.avgLayoutIssues, f2),
    row('avg layout issues after', (s) => s.after.avgLayoutIssues, f2),
    row('avg automatic fix attempts', (s) => s.avgRetriesNeeded, f2),
    row('avg seconds per page', (s) => s.avgSeconds, f1),
    { label: 'estimated cost (USD)', a: String(a.meta?.estimatedCostUsd ?? '-'), b: String(b.meta?.estimatedCostUsd ?? '-') },
  ];
}

export function samePrompts(a, b) {
  const list = (r) => r.rows.map((x) => x.prompt).join('\n');
  return list(a) === list(b);
}

function formatTable(rows) {
  const w = Math.max(...rows.map((r) => r.label.length));
  const wa = Math.max(...rows.map((r) => r.a.length));
  return rows.map((r) => `${r.label.padEnd(w)}  ${r.a.padStart(wa)}  ${r.b}`).join('\n');
}

function main() {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error('Usage: npm run benchmark:compare -- <first-result.json> <second-result.json>');
    process.exit(1);
  }
  const a = JSON.parse(readFileSync(fileA, 'utf-8'));
  const b = JSON.parse(readFileSync(fileB, 'utf-8'));
  if (!samePrompts(a, b)) {
    console.log('WARNING: the two runs did not use the same prompts, so the numbers are not directly comparable.\n');
  }
  console.log(formatTable(compareSummaries(a, b)));
}

if (process.env.NODE_ENV !== 'test') main();
