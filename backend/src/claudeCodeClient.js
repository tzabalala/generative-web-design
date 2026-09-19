import { SYSTEM_PROMPT, DESIGN_SYSTEM_PROMPT } from './promptEngineering.js';
import { normalizeRationale, normalizePlaceholders } from './designExtras.js';

class ClaudeOutputError extends Error {
  constructor(message, raw) {
    super(message);
    this.name = 'ClaudeOutputError';
    this.raw = raw;
  }
}

// Κοινό κομμάτι: κλήση + επαναφορά του "{" του prefill + αφαίρεση code fences +
// JSON.parse, με ξεχωριστό μήνυμα όταν η απάντηση κόπηκε από το όριο tokens.
async function callClaudeForJson(anthropic, { system, messages, maxTokens }) {
  const message = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL_DEV,
    max_tokens: maxTokens,
    system,
    messages,
  });

  const raw = ('{' + message.content[0].text).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const reason =
      message.stop_reason === 'max_tokens'
        ? 'Claude output was cut off (hit the max_tokens limit) before valid JSON was completed'
        : 'Claude returned non-JSON output';
    throw new ClaudeOutputError(reason, raw);
  }

  return {
    parsed,
    usage: {
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
    },
  };
}

// Κοινή λογική κλήσης Claude + parsing, χρησιμοποιείται από generate, refine,
// και το fix-βήμα του validation feedback loop.
export async function callClaudeForCode(anthropic, messages) {
  const { parsed, usage } = await callClaudeForJson(anthropic, {
    system: SYSTEM_PROMPT,
    messages,
    maxTokens: 8192,
  });

  const { html, css } = parsed;
  if (typeof html !== 'string' || typeof css !== 'string') {
    throw new ClaudeOutputError('Claude JSON is missing html/css fields', parsed);
  }

  return { html, css, usage };
}

// Δεύτερη κλήση: σκεπτικό σχεδιασμού + οδηγός dummy δεδομένων για τον τελικό κώδικα.
export async function callClaudeForDesign(anthropic, messages, { html, css }) {
  const { parsed, usage } = await callClaudeForJson(anthropic, {
    system: DESIGN_SYSTEM_PROMPT,
    messages,
    maxTokens: 6000,
  });

  return {
    rationale: normalizeRationale(parsed.rationale),
    placeholders: normalizePlaceholders(parsed.placeholders, html, css),
    usage,
  };
}

export { ClaudeOutputError };
