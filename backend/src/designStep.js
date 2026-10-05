import { buildDesignMessages } from './promptEngineering.js';
import { callClaudeForDesign } from './claudeCodeClient.js';

// Adds the design rationale and the dummy-data guide to the (already validated) result.
// NEVER throws: the rationale is a bonus — if it fails (truncated answer, network),
// the site is delivered normally without it.
export async function addDesignGuide(anthropic, result, request) {
  try {
    const design = await callClaudeForDesign(anthropic, buildDesignMessages(result, request), result);
    return {
      ...result,
      rationale: design.rationale,
      placeholders: design.placeholders,
      usage: {
        inputTokens: result.usage.inputTokens + design.usage.inputTokens,
        outputTokens: result.usage.outputTokens + design.usage.outputTokens,
      },
    };
  } catch (err) {
    console.warn(`[design-guide] skipped: ${err.message}`);
    return { ...result, rationale: null, placeholders: [] };
  }
}
