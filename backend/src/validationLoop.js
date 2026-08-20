import { validateCode } from './validation/index.js';
import { buildFixMessages } from './promptEngineering.js';
import { callClaudeForCode } from './claudeCodeClient.js';

// Βήμα 10: generate → check → fix → recheck. Αυτό είναι το πραγματικό
// ερευνητικό συνεισφορά-κομμάτι — η αυτόματη σύνδεση παραγωγής και ελέγχου.
// Μέγιστες προσπάθειες retry: MAX_VALIDATION_RETRIES (default 3). Αν
// αποτύχει και μετά, επιστρέφεται ο κώδικας με σαφή προειδοποίηση των
// εναπομεινάντων προβλημάτων — όχι ατέρμονος βρόχος.
export async function runWithValidation(anthropic, initialResult) {
  const maxRetries = Number(process.env.MAX_VALIDATION_RETRIES) || 3;

  let current = initialResult;
  let attempts = 0;
  let validation = await validateCode(current.html, current.css);
  const totalUsage = { ...current.usage };
  const retryHistory = [];

  while (!validation.passed && attempts < maxRetries) {
    attempts += 1;
    retryHistory.push({ attempt: attempts, issues: validation.issueSummary });

    const fixMessages = buildFixMessages(current.html, current.css, validation.issueSummary);
    const fixed = await callClaudeForCode(anthropic, fixMessages);
    current = fixed;
    totalUsage.inputTokens += fixed.usage.inputTokens;
    totalUsage.outputTokens += fixed.usage.outputTokens;

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
