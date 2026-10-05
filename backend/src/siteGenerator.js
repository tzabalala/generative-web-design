import { buildPlanMessages, buildPageMessages } from './promptEngineering.js';
import { callClaudeForPlan, callClaudeForPage, ClaudeOutputError } from './claudeCodeClient.js';
import { assemblePage } from './site.js';

// Generation of a new site, in two steps (this is what replaced the single "write the whole
// page" call):
//
//   1. PLAN  - one call decides how many pages (1 to 5), what each one is for, and designs
//              everything they share (stylesheet, header with the menu, footer);
//   2. PAGES - one call per page writes the content of that page, a few at a time.
//
// Why not ONE call for the whole site: five pages in a single answer would overflow the
// output limit (it already did for a single Greek page). Separate calls also keep each page
// focused on its own content, and they run side by side, so the wait grows much less than
// the number of pages.
//
// The shared header and footer are put around every page here, in code, so the menu is the
// same everywhere; the checks later verify it stays that way after changes.

const DEFAULT_CONCURRENCY = 3;

function concurrency() {
  const n = Number(process.env.PAGE_CONCURRENCY);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 5) : DEFAULT_CONCURRENCY;
}

// Runs fn over the items with at most `limit` running at once; results keep the item order.
// The first failure stops starting new work and is thrown.
async function mapLimited(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let failure = null;
  async function worker() {
    while (!failure && next < items.length) {
      const i = next;
      next += 1;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        failure = failure ?? err;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw failure;
  return results;
}

// A page whose answer is not valid JSON is asked for once more before the whole request fails.
async function writePage(anthropic, request, plan, page) {
  const messages = buildPageMessages(request, plan, page);
  try {
    return await callClaudeForPage(anthropic, messages);
  } catch (err) {
    if (!(err instanceof ClaudeOutputError)) throw err;
    return callClaudeForPage(anthropic, messages);
  }
}

// onStage(name, extra) is the progress callback (see progress.js).
// Returns { css, pages, usage } and never mutates anything it is given.
export async function generateSite(anthropic, request, { onStage } = {}) {
  const stage = (name, extra) => {
    try {
      onStage?.(name, extra);
    } catch {
      /* progress reporting is best-effort */
    }
  };

  stage('planning');
  const { plan, usage: planUsage } = await callClaudeForPlan(anthropic, buildPlanMessages(request));
  const usage = { ...planUsage };

  const total = plan.pages.length;
  let done = 0;
  stage('writing', { done, total });

  const written = await mapLimited(plan.pages, concurrency(), async (page) => {
    const result = await writePage(anthropic, request, plan, page);
    done += 1;
    stage('writing', { done, total });
    return result;
  });

  const pages = plan.pages.map((p, i) => {
    usage.inputTokens += written[i].usage.inputTokens;
    usage.outputTokens += written[i].usage.outputTokens;
    return {
      slug: p.slug,
      title: p.title,
      html: assemblePage(plan, p, written[i].page.html),
      css: written[i].page.css,
    };
  });

  return { css: plan.css, pages, usage };
}
