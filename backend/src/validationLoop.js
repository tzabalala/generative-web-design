import { validateCode } from './validation/index.js';
import { buildFixMessages } from './promptEngineering.js';
import { callClaudeForCode } from './claudeCodeClient.js';

// Step 10: generate → check → fix → recheck. This is the actual research
// contribution: the automatic link between generation and validation.
// Maximum retries: MAX_VALIDATION_RETRIES (default 3). If it still fails, the code is
// returned with a clear warning listing the remaining issues — never an endless loop.
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

  let current = initialResult;
  let attempts = 0;
  stage('checking', { attempt: 0, max: maxRetries });
  let validation = await validateCode(current.html, current.css);
  const totalUsage = { ...current.usage };
  const retryHistory = [];

  while (!validation.passed && attempts < maxRetries) {
    attempts += 1;
    retryHistory.push({ attempt: attempts, issues: validation.issueSummary });
    stage('fixing', { attempt: attempts, max: maxRetries });

    const fixMessages = buildFixMessages(current.html, current.css, validation.issueSummary);
    const fixed = await callClaudeForCode(anthropic, fixMessages);
    current = fixed;
    totalUsage.inputTokens += fixed.usage.inputTokens;
    totalUsage.outputTokens += fixed.usage.outputTokens;

    stage('checking', { attempt: attempts, max: maxRetries });
    validation = await validateCode(current.html, current.css);
  }

  return {
    html: current.html,
    css: current.css,
    usage: totalUsage,
    validation: {
      passed: validation.passed,
      attempts,
      remainingIssues: validation.passed ? [] : validation.issueSummary,
      accessibility: validation.accessibility,
      responsive: validation.responsive,
      retryHistory,
    },
  };
}
