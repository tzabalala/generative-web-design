import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  EVENT_COLUMNS, SESSION_COLUMNS, eventRows, toCsv, buildSessionSummaries, buildOverallSummary,
} from '../src/studyExport.js';

// Exports the study log to files you can open in Excel.
//
//   npm run export                         everything
//   npm run export -- --participant=P03    only one participant code
//   npm run export -- --since=2026-10-12   only events from that date on
//   npm run export -- --db=path\to\app.sqlite   a different database file
//
// Output goes to backend/exports/<date-time>/ (git-ignored: it contains participants' prompts).
//   events.csv    one row per request (generate / refine / undo), including errors
//   sessions.csv  one row per page-building session with the Task Script figures
//   summary.json  the overall numbers for the Evaluation chapter

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);

async function main() {
  const args = parseArgs(process.argv);
  if (args.db) process.env.DB_PATH = resolve(args.db);
  // Imported AFTER DB_PATH is set: the database opens lazily on first use.
  const { getDb, closeDb } = await import('../src/db.js');

  const clauses = [];
  const params = [];
  if (args.participant) {
    clauses.push('participant = ?');
    params.push(args.participant);
  }
  if (args.since) {
    const t = Date.parse(args.since);
    if (Number.isNaN(t)) throw new Error(`--since is not a valid date: ${args.since}`);
    clauses.push('ts >= ?');
    params.push(t);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const events = getDb().prepare(`SELECT * FROM events ${where} ORDER BY ts, id`).all(...params);
  closeDb();

  if (events.length === 0) {
    console.log('No events found. Nothing was exported (use the app first, or check --participant / --since).');
    return;
  }

  const sessions = buildSessionSummaries(events);
  const summary = buildOverallSummary(events, sessions);

  const outDir = resolve(
    fileURLToPath(new URL('..', import.meta.url)),
    args.out || 'exports',
    stamp()
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'events.csv'), toCsv(eventRows(events), EVENT_COLUMNS), 'utf-8');
  writeFileSync(resolve(outDir, 'sessions.csv'), toCsv(sessions, SESSION_COLUMNS), 'utf-8');
  writeFileSync(resolve(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');

  console.log(`Exported ${events.length} events, ${sessions.length} sessions to:\n  ${outDir}\n`);
  console.log('Headline numbers');
  console.log(`  participants:               ${summary.participants}`);
  console.log(`  sessions:                   ${summary.sessions}`);
  console.log(`  fresh pages generated:      ${summary.generates_fresh}  (from cache: ${summary.generates_from_cache})`);
  console.log(`  passed everything 1st try:  ${summary.first_try_pass_rate_pct ?? '-'} %`);
  console.log(`  avg automatic fix attempts: ${summary.avg_fix_attempts ?? '-'}`);
  console.log(`  time to first page (ms):    mean ${summary.time_to_first_page_ms.mean ?? '-'}, median ${summary.time_to_first_page_ms.median ?? '-'}`);
  console.log(`  edits per session (avg):    ${summary.avg_edits_per_session ?? '-'}`);
  console.log(`  errors / blocked:           ${summary.errors} / ${summary.blocked_by_limit}`);
  console.log(`  estimated cost (USD):       ${summary.estimated_cost_usd}`);
}

main().catch((err) => {
  console.error(`Export failed: ${err.message}`);
  process.exit(1);
});
