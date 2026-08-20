import 'dotenv/config';
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { buildGenerateMessages } from '../src/promptEngineering.js';
import { callClaudeForCode } from '../src/claudeCodeClient.js';
import { validateCode } from '../src/validation/index.js';
import { runWithValidation } from '../src/validationLoop.js';
import { closeBrowser } from '../src/validation/browserManager.js';

// Βήμα 21 του Technical Implementation Plan: απαντά στο ερευνητικό ερώτημα
// "πόσο βελτιώνεται το accessibility score με το validation loop σε σχέση
// με raw LLM output;" — συγκρίνει (α) raw Claude output χωρίς κανένα
// validation/fix, έναντι (β) το ίδιο output περασμένο από το πλήρες
// validation/fix pipeline. Μετρά: axe-core violations πριν/μετά, ποσοστό
// σελίδων που περνούν πλήρως, μέσος αριθμός retries.

const DEFAULT_PROMPTS = [
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
];

function parseArgs() {
  const args = process.argv.slice(2);
  const countArg = args.find((a) => a.startsWith('--count='));
  const count = countArg ? Number(countArg.split('=')[1]) : DEFAULT_PROMPTS.length;
  return { count: Math.min(Math.max(count, 1), DEFAULT_PROMPTS.length) };
}

export function summarize(allRows) {
  const rows = allRows.filter((r) => !r.error);
  const failedCount = allRows.length - rows.length;
  const n = rows.length;
  const avg = (fn) => (n ? rows.reduce((sum, r) => sum + fn(r), 0) / n : 0);
  const pct = (fn) => (n ? (rows.filter(fn).length / n) * 100 : 0);

  return {
    sampleSize: n,
    failedCount,
    before: {
      avgAccessibilityViolations: avg((r) => r.before.accessibilityViolations),
      avgResponsiveIssues: avg((r) => r.before.responsiveIssues),
      pctFullyPassing: pct((r) => r.before.passed),
    },
    after: {
      avgAccessibilityViolations: avg((r) => r.after.accessibilityViolations),
      avgResponsiveIssues: avg((r) => r.after.responsiveIssues),
      pctFullyPassing: pct((r) => r.after.passed),
    },
    avgRetriesNeeded: avg((r) => r.retries),
  };
}

async function run() {
  const { count } = parseArgs();
  const prompts = DEFAULT_PROMPTS.slice(0, count);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const rows = [];

  for (const [i, prompt] of prompts.entries()) {
    process.stdout.write(`[${i + 1}/${prompts.length}] ${prompt}\n`);

    try {
      const initial = await callClaudeForCode(anthropic, buildGenerateMessages(prompt));
      const rawValidation = await validateCode(initial.html, initial.css);
      const fixed = await runWithValidation(anthropic, initial);

      rows.push({
        prompt,
        before: {
          accessibilityViolations: rawValidation.accessibility.violations.length,
          responsiveIssues: rawValidation.responsive.issues.length,
          passed: rawValidation.passed,
        },
        after: {
          accessibilityViolations: fixed.validation.accessibility.violations.length,
          responsiveIssues: fixed.validation.responsive.issues.length,
          passed: fixed.validation.passed,
        },
        retries: fixed.validation.attempts,
      });

      process.stdout.write(
        `  before: ${rawValidation.accessibility.violations.length} a11y violations, ${rawValidation.responsive.issues.length} responsive issues (passed=${rawValidation.passed})\n` +
          `  after:  ${fixed.validation.accessibility.violations.length} a11y violations, ${fixed.validation.responsive.issues.length} responsive issues (passed=${fixed.validation.passed}, retries=${fixed.validation.attempts})\n`
      );
    } catch (err) {
      rows.push({ prompt, error: err.message });
      process.stdout.write(`  FAILED: ${err.message}\n`);
    }
  }

  const summary = summarize(rows);
  const output = { generatedAt: new Date().toISOString(), summary, rows };

  const outPath = new URL('../benchmark-results.json', import.meta.url);
  await writeFile(outPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log('\n=== Summary ===');
  console.log(`Sample size: ${summary.sampleSize}${summary.failedCount ? ` (${summary.failedCount} failed, excluded)` : ''}`);
  console.log(
    `Before validation loop: avg ${summary.before.avgAccessibilityViolations.toFixed(2)} a11y violations, ` +
      `avg ${summary.before.avgResponsiveIssues.toFixed(2)} responsive issues, ` +
      `${summary.before.pctFullyPassing.toFixed(0)}% fully passing`
  );
  console.log(
    `After validation loop:  avg ${summary.after.avgAccessibilityViolations.toFixed(2)} a11y violations, ` +
      `avg ${summary.after.avgResponsiveIssues.toFixed(2)} responsive issues, ` +
      `${summary.after.pctFullyPassing.toFixed(0)}% fully passing`
  );
  console.log(`Average retries needed: ${summary.avgRetriesNeeded.toFixed(2)}`);
  console.log(`\nFull results written to ${fileURLToPath(outPath)}`);

  await closeBrowser();
}

if (process.env.NODE_ENV !== 'test') {
  run().catch(async (err) => {
    console.error(err);
    await closeBrowser();
    process.exit(1);
  });
}
