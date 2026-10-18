import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';
import { fileURLToPath } from 'url';

// Builds the folder for the expert review of generated code: picks 6 sites from a finished
// benchmark run and writes each one as plain files (one .html per page + style.css), exactly
// the shape a user downloads, so a reviewer can open them in any browser or editor.
// No Claude API call, no cost. Uses the site files a benchmark writes since v6-page-scope
// (benchmark-runs/<run>-sites/NN.json).
//
//   npm run review-pack -- --run=benchmark-runs/dev_2026-10-19-10-00-00.json
//   npm run review-pack -- --run=benchmark-runs/<run>.json --out=../expert-review
//
// The sites get neutral names (site-A ... site-F) and the reviewer's index shows only the
// request, so the review is blind to the checker results; those are in ANSWER-KEY.md, which
// is for the student and is NOT to be given to the reviewer.
//
// Do NOT import scripts/benchmark.js here: importing it starts a real (paid) run.

const isGreek = (text) => /[Ͱ-Ͽ]/.test(String(text));

// Which 6 sites: one of each kind, the first in the list order that fits and is not taken.
const KINDS = [
  { label: 'one page, English, passed', fits: (r) => r.pages === 1 && r.language === 'en' && r.after.passed },
  { label: 'one page, Greek, passed', fits: (r) => r.pages === 1 && r.language === 'el' && r.after.passed },
  { label: 'several pages, English, passed', fits: (r) => r.pages > 1 && r.language === 'en' && r.after.passed },
  { label: 'several pages, Greek, passed', fits: (r) => r.pages > 1 && r.language === 'el' && r.after.passed },
  { label: 'still failing after the repairs', fits: (r) => !r.after.passed },
  { label: 'held-out request', fits: (r) => r.group === 'heldOut' },
];
const FALLBACK = { label: 'any other site', fits: () => true };

// rows: the rows of a benchmark result (with their index in the list as `number`, 1-based).
// Returns up to 6 picks [{ kind, row }]; a kind with no fitting row is filled with another site.
export function pickSites(rows, count = 6) {
  const usable = rows.filter((r) => !r.error && r.after && r.before);
  const taken = new Set();
  const picks = [];
  for (const kind of KINDS) {
    const row = usable.find((r) => kind.fits(r) && !taken.has(r.number));
    if (row) {
      taken.add(row.number);
      picks.push({ kind: kind.label, row });
    }
  }
  for (const row of usable) {
    if (picks.length >= count) break;
    if (!taken.has(row.number)) {
      taken.add(row.number);
      picks.push({ kind: FALLBACK.label, row });
    }
  }
  return picks.slice(0, count);
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// One page as a complete document, the same shape as the tool's ZIP download.
export function pageDocument(page) {
  const lang = isGreek(page.html.replace(/<[^>]*>/g, ' ')) ? 'el' : 'en';
  const own = page.css ? `\n<style>${page.css}</style>` : '';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(page.title || page.slug)}</title>
<link rel="stylesheet" href="style.css">${own}
</head>
<body>${page.html}</body>
</html>`;
}

const issueLines = (after) => {
  const d = after.details;
  if (!d) return ['(this run did not record details)'];
  const lines = [
    ...d.accessibility.map((a) => `accessibility: ${a.rule} (${a.impact}, page ${a.page}, ${a.elements} elements)`),
    ...d.responsive.map((t) => `layout: ${t}`),
    ...d.site.map((t) => `site: ${t}`),
  ];
  return lines.length ? lines : ['none'];
};

function run() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => a.match(/^--([^=]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]])
  );
  if (!args.run) {
    console.log('Usage: npm run review-pack -- --run=benchmark-runs/<run>.json [--out=<folder>]');
    process.exit(1);
  }
  const runPath = resolve(args.run);
  const result = JSON.parse(readFileSync(runPath, 'utf-8'));
  const sitesDir = runPath.replace(/\.json$/i, '') + '-sites';
  if (!existsSync(sitesDir)) {
    console.log(`No site files next to that run (${sitesDir}). Runs made before v6-page-scope did not save them.`);
    process.exit(1);
  }

  const rows = result.rows.map((r, i) => ({ ...r, number: i + 1 }));
  const picks = pickSites(rows).filter(({ row }) => existsSync(resolve(sitesDir, `${String(row.number).padStart(2, '0')}.json`)));
  const backendDir = fileURLToPath(new URL('..', import.meta.url));
  const outDir = resolve(args.out ?? resolve(backendDir, 'expert-review', basename(runPath, '.json')));
  mkdirSync(outDir, { recursive: true });

  const index = [];
  const key = [
    `# Answer key (for the student only, do NOT give to the reviewer)`,
    ``,
    `Run: ${basename(runPath)}, model ${result.meta.model}, prompt version ${result.meta.promptVersion}`,
    ``,
  ];

  picks.forEach(({ kind, row }, i) => {
    const name = `site-${String.fromCharCode(65 + i)}`;
    const file = resolve(sitesDir, `${String(row.number).padStart(2, '0')}.json`);
    const { final } = JSON.parse(readFileSync(file, 'utf-8'));
    const dir = resolve(outDir, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'style.css'), final.css, 'utf-8');
    for (const page of final.pages) writeFileSync(resolve(dir, `${page.slug}.html`), pageDocument(page), 'utf-8');

    index.push(
      `<li><a href="${name}/index.html">${name}</a> (${final.pages.length} ${final.pages.length === 1 ? 'page' : 'pages'}): ` +
        `${escapeHtml(row.prompt)}</li>`
    );
    key.push(
      `## ${name}: ${kind}`,
      ``,
      `- Request (#${row.number}${row.group === 'heldOut' ? ', held-out' : ''}): ${row.prompt}`,
      `- Pages: ${final.pages.map((p) => p.slug).join(', ')}`,
      `- Before the loop: ${row.before.passed ? 'passed' : 'failed'} (${row.before.accessibilityViolations} accessibility, ${row.before.responsiveIssues} responsive, ${row.before.siteIssues ?? 0} site)`,
      `- After the loop: ${row.after.passed ? 'passed' : 'FAILED'}, ${row.retries} repair attempts`,
      `- Issues left: ${issueLines(row.after).join('; ')}`,
      ``
    );
  });

  writeFileSync(
    resolve(outDir, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sites for review</title></head>
<body>
<main>
<h1>Generated websites for expert review</h1>
<p>Each folder is one website as a user would download it. Open its index.html in a browser; the code is in the .html files and style.css. The request each site was built from is given below.</p>
<ul>
${index.join('\n')}
</ul>
</main>
</body>
</html>`,
    'utf-8'
  );
  writeFileSync(resolve(outDir, 'ANSWER-KEY.md'), key.join('\n'), 'utf-8');

  console.log(`Wrote ${picks.length} sites to ${outDir}`);
  for (const [i, { kind, row }] of picks.entries()) console.log(`  site-${String.fromCharCode(65 + i)}: #${row.number} ${kind}`);
  if (picks.length < 6) console.log('Fewer than 6 sites: the run has fewer usable rows.');
}

if (process.env.NODE_ENV !== 'test') run();
