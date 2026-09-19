import { buildDesignMessages } from './promptEngineering.js';
import { callClaudeForDesign } from './claudeCodeClient.js';

// Προσθέτει στο (ήδη ελεγμένο) αποτέλεσμα το σκεπτικό σχεδιασμού και τον οδηγό
// dummy δεδομένων. ΠΟΤΕ δεν ρίχνει σφάλμα: το σκεπτικό είναι bonus — αν αποτύχει
// (κομμένη απάντηση, δίκτυο), η σελίδα παραδίδεται κανονικά χωρίς αυτό.
export async function addDesignGuide(anthropic, result, request) {
  try {
    const design = await callClaudeForDesign(
      anthropic,
      buildDesignMessages(result.html, result.css, request),
      result
    );
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
