import {
  PLAN_SYSTEM_PROMPT,
  PAGE_SYSTEM_PROMPT,
  EDIT_SYSTEM_PROMPT,
  DESIGN_SYSTEM_PROMPT,
} from './promptEngineering.js';
import { normalizeRationale, normalizePlaceholders } from './designExtras.js';
import { normalizePlan, normalizePageReply, normalizeDelta, siteHaystack } from './site.js';
import { ClaudeOutputError } from './claudeErrors.js';
import { resolveModel } from './config.js';

// The messages end with an assistant "{" (the prefill), which makes the answer start as JSON.
// Some models refuse a prefill: Claude Sonnet 5 answers every such request with HTTP 400
// "This model does not support assistant message prefill" (found by the first Sonnet
// benchmark run, 2026-10-18, before which the demo profile had never been run end to end).
// Such a model is asked again WITHOUT the prefill and remembered, so later calls skip it.
// Models that accept the prefill (Haiku 4.5) keep it, so their behaviour does not change.
const noPrefillModels = new Set();

export const isPrefillRefusal = (err) => err?.status === 400 && /prefill/i.test(String(err?.message ?? ''));

const endsWithPrefill = (messages) => messages.at(-1)?.role === 'assistant';

async function createMessage(anthropic, { system, messages, maxTokens }) {
  const model = resolveModel();
  const prefilled = endsWithPrefill(messages) && !noPrefillModels.has(model);
  const send = (msgs) => anthropic.messages.create({ model, max_tokens: maxTokens, system, messages: msgs });
  const withoutPrefill = endsWithPrefill(messages) ? messages.slice(0, -1) : messages;
  if (!prefilled) return { message: await send(withoutPrefill), prefilled: false };
  try {
    return { message: await send(messages), prefilled: true };
  } catch (err) {
    if (!isPrefillRefusal(err)) throw err;
    noPrefillModels.add(model);
    return { message: await send(withoutPrefill), prefilled: false };
  }
}

// The first complete {...} in a text: braces are counted, and braces inside JSON strings
// (CSS rules such as ".card{}" are full of them) are skipped. null when there is none.
export function firstJsonObject(text) {
  const s = String(text ?? '');
  for (let start = s.indexOf('{'); start >= 0; start = s.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inString) {
        if (c === '\\') i++;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        const candidate = s.slice(start, i + 1);
        try {
          // an empty {} (e.g. a CSS rule in a note) is never the answer
          if (Object.keys(JSON.parse(candidate)).length) return candidate;
        } catch {
          /* not JSON from this "{" */
        }
        break; // try the next "{"
      }
    }
  }
  return null;
}

// The JSON object in an answer. With the prefill the answer continues after "{"; without it
// the model writes the whole object, sometimes inside a ```json fence, after a short
// sentence, or followed by a note (which may itself contain "}"), so the first complete
// object is taken as a last resort.
export function extractJson(text, prefilled) {
  const raw = ((prefilled ? '{' : '') + String(text ?? '')).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  for (const candidate of [raw, escapeControlCharacters(raw)]) {
    try {
      return { parsed: JSON.parse(candidate), raw };
    } catch {
      const object = prefilled ? null : firstJsonObject(candidate);
      if (object) return { parsed: JSON.parse(object), raw };
    }
  }
  return { parsed: undefined, raw };
}

// A raw newline or tab INSIDE a JSON string is not allowed (it must be written \n or \t).
// Claude Sonnet 5 sometimes leaves one in a long page; a real answer (2026-10-18) of 8,000
// characters failed on a single newline and was otherwise valid. Only used when the answer
// does not parse as it is, so correct answers are never touched.
export function escapeControlCharacters(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') {
        out += c + (text[i + 1] ?? '');
        i++;
        continue;
      }
      if (c === '"') inString = false;
      else if (c < ' ') {
        out += c === '\n' ? '\\n' : c === '\t' ? '\\t' : c === '\r' ? '\\r' : '';
        continue;
      }
    } else if (c === '"') inString = true;
    out += c;
  }
  return out;
}

// The text of an answer. A model that thinks first (Claude Sonnet 5 does by default) answers
// with a "thinking" block BEFORE the text block, so content[0] is not the answer: reading it
// gave an empty string and every Sonnet call failed as "non-JSON output" (found on the first
// real Sonnet call, 2026-10-18). Only the text blocks are the answer.
export const answerText = (message) =>
  (message?.content ?? [])
    .filter((block) => block.type === 'text' || (block.type === undefined && typeof block.text === 'string'))
    .map((block) => block.text)
    .join('');

// Only for tests: forget which models refused the prefill.
export function resetPrefillMemory() {
  noPrefillModels.clear();
}

// Shared part: the call, re-adding the prefill's "{", stripping code fences and
// JSON.parse, with a distinct message when the answer was cut off by the token limit.
async function callClaudeForJson(anthropic, { system, messages, maxTokens }) {
  const { message, prefilled } = await createMessage(anthropic, { system, messages, maxTokens });

  const { parsed, raw } = extractJson(answerText(message), prefilled);
  if (parsed === undefined) {
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

// Token limits per call. A page's <main> content is much smaller than the old whole-page
// answer, so a generation no longer overflows even in Greek. An edit may have to return every
// page of a site (for example when the menu changes), so it gets more room. 16000 stays
// below the size at which the SDK insists on streaming.
// Every call now gets 16000: a model that thinks first (Claude Sonnet 5) spends part of the
// limit on its thinking, which counts as output. With 8192, a Sonnet call for a 4-page
// conference site (2026-10-18) used the whole limit and returned no text at all. A limit is a
// ceiling, not a charge: a model that needs less (Haiku 4.5, ~4K for a page) pays the same.
const PLAN_MAX_TOKENS = 16000;
const PAGE_MAX_TOKENS = 16000;
const EDIT_MAX_TOKENS = 16000;
const DESIGN_MAX_TOKENS = 16000;

// Generation, step 1: the plan (which pages) and everything the pages share.
export async function callClaudeForPlan(anthropic, messages) {
  const { parsed, usage } = await callClaudeForJson(anthropic, {
    system: PLAN_SYSTEM_PROMPT,
    messages,
    maxTokens: PLAN_MAX_TOKENS,
  });
  return { plan: normalizePlan(parsed), usage };
}

// Generation, step 2: the content of ONE page.
export async function callClaudeForPage(anthropic, messages) {
  const { parsed, usage } = await callClaudeForJson(anthropic, {
    system: PAGE_SYSTEM_PROMPT,
    messages,
    maxTokens: PAGE_MAX_TOKENS,
  });
  return { page: normalizePageReply(parsed), usage };
}

// Refine and the fix step of the validation feedback loop: Claude returns only what changed.
export async function callClaudeForEdit(anthropic, messages) {
  const { parsed, usage } = await callClaudeForJson(anthropic, {
    system: EDIT_SYSTEM_PROMPT,
    messages,
    maxTokens: EDIT_MAX_TOKENS,
  });
  return { delta: normalizeDelta(parsed), usage };
}

// Last call: design rationale + dummy-data guide for the final site.
export async function callClaudeForDesign(anthropic, messages, site) {
  const { parsed, usage } = await callClaudeForJson(anthropic, {
    system: DESIGN_SYSTEM_PROMPT,
    messages,
    maxTokens: DESIGN_MAX_TOKENS,
  });

  return {
    rationale: normalizeRationale(parsed.rationale),
    placeholders: normalizePlaceholders(parsed.placeholders, siteHaystack(site)),
    usage,
  };
}

export { ClaudeOutputError };
