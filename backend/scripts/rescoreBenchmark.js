import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { validateSite } from '../src/validation/index.js';
import { closeBrowser } from '../src/validation/browserManager.js';
import { PROMPT_VERSION } from '../src/promptEngineering.js';
import { counts, summarize } from './benchmarkStats.js';

// Re-scores a finished benchmark run with the CURRENT checks, without calling Claude (free):
// the raw and the final code of every site are saved next to the run (<run>-sites/NN.json),
// and every check runs locally. Used when a check itself is corrected, so that a paid run does
// not have to be repeated (first use: the site check compared a testimonial's <footer> with the
// site footer, a false alarm; see siteChecker.js).
//
//   npm run benchmark:rescore -- --run=benchmark-runs/v7_sonnet_45.json
//
// Writes <run>.rescored.json next to the run and never changes the run itself. What it can and
// cannot tell: "before" is exact (the same raw code, judged by the corrected checks). "After" is
// the same final code judged again, but the repairs that produced it were steered by the OLD
// checks (for example, repair attempts spent on a false alarm), so retries, time and tokens are
// those of the original run and are not re-measured.
//
// Do NOT import scripts/benchmark.js here: importing it starts a real (paid) run.

function run() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => a.match(/^--([^=]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]])
  );
  if (!args.run) {
    console.log('Usage: npm run benchmark:rescore -- --run=benchmark-runs/<run>.json');
    process.exit(1);
  }
  return rescore(resolve(args.run));
}

async function rescore(runPath) {
  const result = JSON.parse(readFileSync(runPath, 'utf-8'));
  const sitesDir = runPath.replace(/\.json$/i, '') + '-sites';
  if (!existsSync(sitesDir)) {
    console.log(`No site files next to that run (${sitesDir}); only runs made since v6-page-scope saved them.`);
    process.exit(1);
  }

  const rows = [];
  let changed = 0;
  for (const [i, row] of result.rows.entries()) {
    const file = resolve(sitesDir, `${String(i + 1).padStart(2, '0')}.json`);
    if (row.error || !existsSync(file)) {
      rows.push(row);
      continue;
    }
    const { raw, final } = JSON.parse(readFileSync(file, 'utf-8'));
    const before = counts(await validateSite(raw));
    const after = counts(await validateSite(final));
    if (before.passed !== row.before.passed || after.passed !== row.after.passed) {
      changed += 1;
      console.log(
        `#${i + 1} ${row.prompt.slice(0, 60)}: before ${row.before.passed} -> ${before.passed}, after ${row.after.passed} -> ${after.passed}`
      );
    }
    rows.push({ ...row, before, after, asRun: { before: row.before, after: row.after } });
  }

  const summary = summarize(rows);
  const outPath = runPath.replace(/\.json$/i, '') + '.rescored.json';
  const meta = { ...result.meta, rescoredAt: new Date().toISOString(), rescoredWithChecksOf: PROMPT_VERSION };
  writeFileSync(outPath, JSON.stringify({ generatedAt: meta.rescoredAt, meta, summary, rows }, null, 2), 'utf-8');

  console.log(`\n${changed} of ${rows.length} sites changed their result.`);
  console.log(
    `Fully passing: before ${result.summary.before.pctFullyPassing.toFixed(0)}% -> ${summary.before.pctFullyPassing.toFixed(0)}%, ` +
      `after ${result.summary.after.pctFullyPassing.toFixed(0)}% -> ${summary.after.pctFullyPassing.toFixed(0)}% (as run -> re-scored)`
  );
  for (const [name, g] of [...Object.entries(summary.byGroup), ...Object.entries(summary.bySize)]) {
    console.log(`  ${name}: ${g.sampleSize} sites, ${g.pctFullyPassingBefore.toFixed(0)}% -> ${g.pctFullyPassingAfter.toFixed(0)}%`);
  }
  console.log(`Written to ${outPath}`);
  await closeBrowser();
}

if (process.env.NODE_ENV !== 'test') {
  run().catch(async (err) => {
    console.error(err);
    await closeBrowser();
    process.exit(1);
  });
}
