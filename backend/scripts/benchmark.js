import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
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
import { requestedScope } from '../src/pageScope.js';
import { counts, details, ruleCounts, summarize } from './benchmarkStats.js';

// Step 21 of the Technical Implementation Plan: answers the evaluation research question
// "how much does the validation loop improve the accessibility score compared with raw
// LLM output?" by comparing (a) raw Claude output with no validation/fix against (b) the
// same output run through the full validation/fix pipeline. Measures: axe-core violations
// before/after, the share of pages that pass fully, and the average number of retries.
//
//   npm run benchmark                         10 pages, Haiku (the original sample)
//   npm run benchmark -- --count=45 --yes     all 45 prompts: the main 35 + 10 held-out (real money)
//   npm run benchmark -- --model=demo         the same prompts with the demo model (Sonnet)
//   npm run benchmark -- --out=my-run.json    choose the output file
//   npm run benchmark -- --count=45 --yes --resume=benchmark-runs/dev_x.json
//                                             finish an interrupted run: keeps its successful
//                                             pages, runs only the missing ones, same file
//
// A run stops by itself when the API reports that the credit balance is too low (every
// later request would fail too); its results so far are saved and can be resumed.
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

  // ---- HELD-OUT prompts (added 2026-10-18, after v6-page-scope) ----
  // The page-scope rule (src/pageScope.js) was designed while looking at the 35 prompts above,
  // so a run on them flatters it. These 10 were written afterwards, in varied wording, and were
  // NOT tried against the rule before being added; their results are reported as a separate
  // group ("heldOut") to show whether the system works on requests it was not tuned on.
  'a simple page to promote my guitar lessons, with prices and a way to get in touch',
  'a homepage for a vegan food truck showing where we park this week and the menu',
  'a site for a small vet clinic with services, the vets and emergency contact details',
  'an online shop front for handmade candles, with a few products and an about section',
  'a portfolio for an illustrator with selected work, a short bio and commission info',
  "a sign-up page for a children's summer football camp, with dates, costs and a registration form",
  'web pages for a local book club: what we are reading, past meetings and how to join',
  'μια σελίδα για ένα συνεργείο αυτοκινήτων με υπηρεσίες, ωράριο και τηλέφωνο',
  'ένας ιστότοπος για έναν δικηγόρο με τομείς εξειδίκευσης, βιογραφικό και επικοινωνία',
  'κάτι απλό για το κομμωτήριό μου με τιμές και κρατήσεις',
];

// The first MAIN_COUNT prompts are the main list; the rest are the held-out group.
export const MAIN_COUNT = 35;
export const promptGroup = (prompt) => (PROMPTS.indexOf(prompt) >= MAIN_COUNT ? 'heldOut' : 'main');

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

export { details, ruleCounts, summarize };

// --resume: keep the successful rows of an earlier run (same model and prompt version only,
// otherwise the two halves would not be comparable) and run only the prompts still missing.
// Failed rows are run again. Without a previous run, every prompt is to do.
export function planResume(prompts, previous, model, promptVersion) {
  if (previous && (previous.meta?.model !== model || previous.meta?.promptVersion !== promptVersion)) {
    throw new Error(
      `Cannot resume: that run used ${previous.meta?.model} / ${previous.meta?.promptVersion}, ` +
        `this one would use ${model} / ${promptVersion}.`
    );
  }
  const kept = (previous?.rows ?? []).filter((r) => !r.error && prompts.includes(r.prompt));
  const byPrompt = new Map(kept.map((r) => [r.prompt, r]));
  return { byPrompt, todo: prompts.filter((p) => !byPrompt.has(p)) };
}

// The API refuses every request once the credit balance runs out, so the run stops there.
export const isOutOfCredit = (message) => /credit balance is too low/i.test(String(message ?? ''));

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

  const previous = args.resume ? JSON.parse(readFileSync(resolve(args.resume), 'utf-8')) : null;
  let byPrompt, todo;
  try {
    ({ byPrompt, todo } = planResume(prompts, previous, model, PROMPT_VERSION));
  } catch (err) {
    console.log(err.message);
    process.exit(1);
  }

  const estimate = todo.length * ROUGH_COST_PER_PAGE[profile];
  console.log(`Benchmark: ${prompts.length} pages, model ${model} (profile ${profile})`);
  if (previous) console.log(`Resuming ${args.resume}: ${byPrompt.size} pages kept, ${todo.length} to run`);
  console.log(`Rough cost guess: about $${estimate.toFixed(2)} (the real bill is on console.anthropic.com)\n`);
  if (todo.length > FREE_LIMIT && !args.yes) {
    console.log(`That is more than ${FREE_LIMIT} pages and it spends real money. Add --yes to go ahead.`);
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const outDir = resolve(fileURLToPath(new URL('..', import.meta.url)), 'benchmark-runs');
  mkdirSync(outDir, { recursive: true });
  const outPath = args.out
    ? resolve(args.out)
    : args.resume
      ? resolve(args.resume)
      : resolve(outDir, `${profile}_${stamp}.json`);
  const sitesDir = outPath.replace(/\.json$/i, '') + '-sites';
  mkdirSync(sitesDir, { recursive: true });

  const meta = {
    startedAt: previous?.meta.startedAt ?? new Date().toISOString(),
    ...(previous ? { resumedAt: [...(previous.meta.resumedAt ?? []), new Date().toISOString()] } : {}),
    modelProfile: profile,
    model,
    promptVersion: PROMPT_VERSION,
    layoutCheck: (process.env.VISUAL_RESPONSIVE_CHECK || 'on').toLowerCase() !== 'off',
    pages: prompts.length,
  };

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // rows are always saved in the order of PROMPTS, whatever order they were run in
  const ordered = () => prompts.map((p) => byPrompt.get(p)).filter(Boolean);
  let outOfCredit = false;

  for (const prompt of todo) {
    console.log(`[${prompts.indexOf(prompt) + 1}/${prompts.length}] ${prompt}`);
    const t0 = Date.now();
    try {
      const initial = await generateSite(anthropic, prompt);
      const rawValidation = await validateSite(initial);
      const fixed = await runWithValidation(anthropic, initial);

      // the code of the raw and the final site, one file per prompt, to inspect failures later
      const number = String(prompts.indexOf(prompt) + 1).padStart(2, '0');
      writeFileSync(
        resolve(sitesDir, `${number}.json`),
        JSON.stringify({ prompt, raw: { css: initial.css, pages: initial.pages }, final: { css: fixed.css, pages: fixed.pages } }, null, 2),
        'utf-8'
      );

      const row = {
        prompt,
        language: isGreek(prompt) ? 'el' : 'en',
        scope: requestedScope(prompt),
        group: promptGroup(prompt),
        pages: fixed.pages.length,
        before: counts(rawValidation),
        after: counts(fixed.validation),
        retries: fixed.validation.attempts,
        seconds: Math.round((Date.now() - t0) / 100) / 10,
        usage: fixed.usage,
      };
      byPrompt.set(prompt, row);
      console.log(
        `  before: ${row.before.accessibilityViolations} a11y, ${row.before.responsiveIssues} responsive (${row.before.layoutIssues} layout), passed=${row.before.passed}\n` +
          `  after:  ${row.after.accessibilityViolations} a11y, ${row.after.responsiveIssues} responsive (${row.after.layoutIssues} layout), passed=${row.after.passed}, retries=${row.retries}, ${row.seconds}s`
      );
    } catch (err) {
      byPrompt.set(prompt, { prompt, language: isGreek(prompt) ? 'el' : 'en', error: err.message });
      console.log(`  FAILED: ${err.message}`);
      // an answer that could not be read is kept, so the failure can be diagnosed afterwards
      if (typeof err.raw === 'string') {
        const number = String(prompts.indexOf(prompt) + 1).padStart(2, '0');
        const answer = err.raw || '(the answer had no text at all)';
        writeFileSync(resolve(sitesDir, `${number}-error.txt`), `${err.message}\n\n${answer}`, 'utf-8');
      }
      outOfCredit = isOutOfCredit(err.message);
    }
    save(outPath, meta, ordered()); // after every page: a crash or Ctrl+C never loses paid results
    if (outOfCredit) {
      console.log('\nThe API credit balance is too low; stopping. Add credits, then run again with --resume.');
      break;
    }
  }

  const { summary, cost } = save(outPath, meta, ordered());
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
  for (const [name, g] of [...Object.entries(summary.byGroup), ...Object.entries(summary.bySize)]) {
    console.log(`  ${name}: ${g.sampleSize} sites, ${g.pctFullyPassingBefore.toFixed(0)}% -> ${g.pctFullyPassingAfter.toFixed(0)}% fully passing`);
  }
  console.log(`Requests read as one page: ${summary.oneReadAsOne.asked}, of which ${summary.oneReadAsOne.gotOnePage} got one page`);
  console.log(`Failing axe rules after the loop: ${JSON.stringify(summary.failingRules.after)}`);
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
