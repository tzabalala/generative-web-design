import { SYSTEM_PROMPT, DESIGN_SYSTEM_PROMPT } from './promptEngineering.js';
import { normalizeRationale, normalizePlaceholders } from './designExtras.js';

class ClaudeOutputError extends Error {
  constructor(message, raw) {
    super(message);
    this.name = 'ClaudeOutputError';
    this.raw = raw;
  }
}

// Shared part: the call, re-adding the prefill's "{", stripping code fences and
// JSON.parse, with a distinct message when the answer was cut off by the token limit.
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

// Shared Claude call + parsing, used by generate, refine and the fix step of the
// validation feedback loop.
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

// Second call: design rationale + dummy-data guide for the final code.
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
