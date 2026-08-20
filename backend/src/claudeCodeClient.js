import { SYSTEM_PROMPT } from './promptEngineering.js';

class ClaudeOutputError extends Error {
  constructor(message, raw) {
    super(message);
    this.name = 'ClaudeOutputError';
    this.raw = raw;
  }
}

// Κοινή λογική κλήσης Claude + parsing, χρησιμοποιείται από generate, refine,
// και το fix-βήμα του validation feedback loop.
export async function callClaudeForCode(anthropic, messages) {
  const message = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL_DEV,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages,
  });

  const raw = ('{' + message.content[0].text).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ClaudeOutputError('Claude returned non-JSON output', raw);
  }

  const { html, css } = parsed;
  if (typeof html !== 'string' || typeof css !== 'string') {
    throw new ClaudeOutputError('Claude JSON is missing html/css fields', parsed);
  }

  return {
    html,
    css,
    usage: {
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
    },
  };
}

export { ClaudeOutputError };
