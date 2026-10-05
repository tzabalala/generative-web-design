import { validateSite } from './validation/index.js';
import { buildFixMessages } from './promptEngineering.js';
import { callClaudeForEdit } from './claudeCodeClient.js';
import { applyDelta } from './site.js';

// Step 10: generate → check → fix → recheck. This is the actual research
// contribution: the automatic link between generation and validation.
// Maximum retries: MAX_VALIDATION_RETRIES (default 3). If it still fails, the code is
// returned with a clear warning listing the remaining issues — never an endless loop.
//
// The thing being validated is a SITE (1 to 5 pages plus a shared stylesheet). A fix call
// returns only the pages and/or the stylesheet that have to change; they are merged into
// the site and the whole site is checked again.
//
// onStage(name, { attempt, max }) is an optional progress callback (see progress.js);
// a failing callback must never break the loop.
export async function runWithValidation(anthropic, initialResult, { onStage } = {}) {
  const maxRetries = Number(process.env.MAX_VALIDATION_RETRIES) || 3;
  const stage = (name, extra) => {
    try {
      onStage?.(name, extra);
    } catch {
      /* progress reporting is best-effort */
    }
  };

  let site = { css: initialResult.css, pages: initialResult.pages };
  let attempts = 0;
  stage('checking', { attempt: 0, max: maxRetries });
  let validation = await validateSite(site);
  const totalUsage = { ...initialResult.usage };
  const retryHistory = [];

  while (!validation.passed && attempts < maxRetries) {
    attempts += 1;
    retryHistory.push({ attempt: attempts, issues: validation.issueSummary });
    stage('fixing', { attempt: attempts, max: maxRetries });

    const { delta, usage } = await callClaudeForEdit(anthropic, buildFixMessages(site, validation.issueSummary));
    site = applyDelta(site, delta);
    totalUsage.inputTokens += usage.inputTokens;
    totalUsage.outputTokens += usage.outputTokens;

    stage('checking', { attempt: attempts, max: maxRetries });
    validation = await validateSite(site);
  }

  return {
    css: site.css,
    pages: site.pages,
    usage: totalUsage,
    validation: {
      passed: validation.passed,
      attempts,
      remainingIssues: validation.passed ? [] : validation.issueSummary,
      accessibility: validation.accessibility,
      responsive: validation.responsive,
      site: validation.site,
      retryHistory,
    },
  };
}
