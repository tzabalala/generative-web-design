import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { PROMPT_VERSION } from '../src/promptEngineering.js';
import { generateSite } from '../src/siteGenerator.js';
import { validateSite } from '../src/validation/index.js';
import { runWithValidation } from '../src/validationLoop.js';
import { closeBrowser } from '../src/validation/browserManager.js';
import { modelProfile, resolveModel } from '../src/config.js';
import { estimateCostUsd } from '../src/studyExport.js';

// Step 21 of the Technical Implementation Plan: answers the evaluation research question
// "how much does the validation loop improve the accessibility score compared with raw
// LLM output?" by comparing (a) raw Claude output with no validation/fix against (b) the
// same output run through the full validation/fix pipeline. Measures: axe-core violations
// before/after, the share of pages that pass fully, and the average number of retries.
//
//   npm run benchmark                         10 pages, Haiku (the original sample)
//   npm run benchmark -- --count=30 --yes     all 30 prompts (this spends real money)
//   npm run benchmark -- --model=demo         the same prompts with the demo model (Sonnet)
//   npm run benchmark -- --out=my-run.json    choose the output file
//
// The first 10 prompts are the original sample, in the original order, so a --count=10 run
// stays comparable with the first benchmark. It does NOT include the design-rationale call
// (that is an extra, not part of the validation research question).

export const PROMPTS = [
  'a one-page portfolio for a freelance photographer, with a gallery and a contact form',
  'a landing page for a local yoga studio with a class schedule and a sign-up button',
  'a contact page for a small bakery, with a form and opening hours',
  'a simple blog homepage listing 5 recent posts with titles and short excerpts',
  'a product landing page for a reusable water bottle, with a buy button and features list',
  'an event page for a community charity fundraiser, with a date, location, and RSVP form',
  'a personal resume/CV page with an about section, skills, and work experience',
  'a restaurant homepage with a menu section and a reservation form',
  'a nonprofit organisation homepage explaining its mission and a donate button',
  'a small business services page listing 3 services with pricing',
  // ---- added for the larger run ----
  'a landing page for a mobile app that tracks daily water intake, with screenshots and a download button',
  'a photography studio booking page with pricing packages and an enquiry form',
  'a conference website with a speaker list, a schedule table, and a ticket button',
  'a personal finance blog homepage with a newsletter sign-up form',
  'a gym homepage with membership plans compared in a table',
  'a hair salon page with services, prices, and an online booking button',
  'a landing page for an online coding course with a curriculum list and testimonials',
  'a local bookshop homepage with featured books and opening hours',
  'a wedding invitation page with the date, the venue, and an RSVP form',
  'a dentist clinic homepage with services, team members, and an appointment form',
  'a real-estate agency page listing three properties with photos and prices',
  'a FAQ page for a software product with ten questions and answers',
  'a pricing page for a SaaS tool with three plans and a feature comparison',
  'a volunteer sign-up page for a beach clean-up event',
  'a landing page for a small coffee roastery with a shop section and a subscription offer',
  // ---- Greek prompts: the language the user-study participants are likely to write in ----
  'μια σελίδα για έναν θερινό κινηματογράφο, με πρόγραμμα ταινιών και κράτηση θέσεων',
  'μια σελίδα επικοινωνίας για ένα μικρό ζαχαροπλαστείο, με φόρμα και ώρες λειτουργίας',
  'η αρχική σελίδα ενός γυμναστηρίου με προγράμματα συνδρομής και κουμπί εγγραφής',
  'μια απλή σελίδα για έναν εκπαιδευτή σκύλων με τιμές και φόρμα επικοινωνίας',
  'η σελίδα ενός φωτογράφου γάμων με γκαλερί και φόρμα επικοινωνίας',
  // ---- whole websites of several pages (the tool plans 1 to 5 pages itself) ----
  'a website for a family-run Italian restaurant, with a menu, an about page, a photo gallery and a contact page with a reservation form',
  'a website for a small architecture studio, with projects, the team, services and a contact page',
  'a website for a local yoga studio, with a class schedule, the teachers, prices and a contact page',
  'ένας ιστότοπος για ένα οδοντιατρείο, με υπηρεσίες και τιμές, την ομάδα των γιατρών και φόρμα για ραντεβού',
  'ένας ιστότοπος για ένα μικρό ξενοδοχείο στη Σαντορίνη, με δωμάτια, φωτογραφίες, δραστηριότητες και επικοινωνία',
];

// Rough cost of one SITE (a plan call, one call per page, fixes) WITHOUT the rationale
// call, only to warn before spending money. A site costs about 2 to 3 times what the old
// single page did.
const ROUGH_COST_PER_PAGE = { dev: 0.13, demo: 0.26 };
const FREE_LIMIT = 10; // more pages than this needs an explicit --yes

export const isGreek = (text) => /[Ͱ-Ͽ]/.test(text);

function parseArgs(argv) {
  const args = { yes: false };
  for (const a of argv.slice(2)) {
    if (a === '--yes') args.yes = true;
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  const count = args.count ? Number(args.count) : FREE_LIMIT;
  args.count = Math.min(Math.max(Number.isFinite(count) ? count : FREE_LIMIT, 1), PROMPTS.length);
  return args;
}

const counts = (v) => ({
  accessibilityViolations: v.accessibility.violations.length,
  responsiveIssues: v.responsive.issues.length,
  // the real layout check on its own (a subset of responsiveIssues; 0 when it is switched off)
  layoutIssues: v.responsive.visual?.issues?.length ?? 0,
  // how the pages fit together (links, shared menu, distinct content); 0 for a one-page site
  siteIssues: v.site?.issues?.length ?? 0,
  passed: v.passed,
});

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
  };
}

function save(path, meta, rows) {
  const summary = summarize(rows);
  const cost = estimateCostUsd(meta.model, summary.totalInputTokens, summary.totalOutputTokens);
  const output = { generatedAt: meta.startedAt, meta: { ...meta, estimatedCostUsd: cost }, summary, rows };
  writeFileSync(path, JSON.stringify(output, null, 2), 'utf-8');
  return { summary, cost };
}

async function run() {
  const args = parseArgs(process.argv);
  if (args.model) process.env.MODEL_PROFILE = args.model; // dev | demo
  const profile = modelProfile(); // throws on an unknown profile
  const model = resolveModel();
  const prompts = PROMPTS.slice(0, args.count);

  const estimate = prompts.length * ROUGH_COST_PER_PAGE[profile];
  console.log(`Benchmark: ${prompts.length} pages, model ${model} (profile ${profile})`);
  console.log(`Rough cost guess: about $${estimate.toFixed(2)} (the real bill is on console.anthropic.com)\n`);
  if (prompts.length > FREE_LIMIT && !args.yes) {
    console.log(`That is more than ${FREE_LIMIT} pages and it spends real money. Add --yes to go ahead.`);
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const outDir = resolve(fileURLToPath(new URL('..', import.meta.url)), 'benchmark-runs');
  mkdirSync(outDir, { recursive: true });
  const outPath = args.out ? resolve(args.out) : resolve(outDir, `${profile}_${stamp}.json`);

  const meta = {
    startedAt: new Date().toISOString(),
    modelProfile: profile,
    model,
    promptVersion: PROMPT_VERSION,
    layoutCheck: (process.env.VISUAL_RESPONSIVE_CHECK || 'on').toLowerCase() !== 'off',
    pages: prompts.length,
  };

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const rows = [];

  for (const [i, prompt] of prompts.entries()) {
    console.log(`[${i + 1}/${prompts.length}] ${prompt}`);
    const t0 = Date.now();
    try {
      const initial = await generateSite(anthropic, prompt);
      const rawValidation = await validateSite(initial);
      const fixed = await runWithValidation(anthropic, initial);

      const row = {
        prompt,
        language: isGreek(prompt) ? 'el' : 'en',
        pages: fixed.pages.length,
        before: counts(rawValidation),
        after: counts(fixed.validation),
        retries: fixed.validation.attempts,
        seconds: Math.round((Date.now() - t0) / 100) / 10,
        usage: fixed.usage,
      };
      rows.push(row);
      console.log(
        `  before: ${row.before.accessibilityViolations} a11y, ${row.before.responsiveIssues} responsive (${row.before.layoutIssues} layout), passed=${row.before.passed}\n` +
          `  after:  ${row.after.accessibilityViolations} a11y, ${row.after.responsiveIssues} responsive (${row.after.layoutIssues} layout), passed=${row.after.passed}, retries=${row.retries}, ${row.seconds}s`
      );
    } catch (err) {
      rows.push({ prompt, language: isGreek(prompt) ? 'el' : 'en', error: err.message });
      console.log(`  FAILED: ${err.message}`);
    }
    save(outPath, meta, rows); // after every page: a crash or Ctrl+C never loses paid results
  }

  const { summary, cost } = save(outPath, meta, rows);
  console.log('\n=== Summary ===');
  console.log(`Sample size: ${summary.sampleSize}${summary.failedCount ? ` (${summary.failedCount} failed, excluded)` : ''}`);
  console.log(
    `Before validation loop: avg ${summary.before.avgAccessibilityViolations.toFixed(2)} a11y violations, ` +
      `avg ${summary.before.avgResponsiveIssues.toFixed(2)} responsive issues, ${summary.before.pctFullyPassing.toFixed(0)}% fully passing`
  );
  console.log(
    `After validation loop:  avg ${summary.after.avgAccessibilityViolations.toFixed(2)} a11y violations, ` +
      `avg ${summary.after.avgResponsiveIssues.toFixed(2)} responsive issues, ${summary.after.pctFullyPassing.toFixed(0)}% fully passing`
  );
  console.log(`Average retries needed: ${summary.avgRetriesNeeded.toFixed(2)}, average time ${summary.avgSeconds.toFixed(1)}s per page`);
  console.log(`Tokens: ${summary.totalInputTokens} in / ${summary.totalOutputTokens} out, estimated cost ${cost === null ? 'unknown' : '$' + cost}`);
  console.log(`\nFull results written to ${outPath}`);

  await closeBrowser();
}

if (process.env.NODE_ENV !== 'test') {
  run().catch(async (err) => {
    console.error(err.message);
    await closeBrowser();
    process.exit(1);
  });
}
