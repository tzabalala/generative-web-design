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

// Shared part: the call, re-adding the prefill's "{", stripping code fences and
// JSON.parse, with a distinct message when the answer was cut off by the token limit.
async function callClaudeForJson(anthropic, { system, messages, maxTokens }) {
  const message = await anthropic.messages.create({
    model: resolveModel(),
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

// Token limits per call. A page's <main> content is much smaller than the old whole-page
// answer, so a generation no longer overflows even in Greek. An edit may have to return every
// page of a site (for example when the menu changes), so it gets more room. 16000 stays
// below the size at which the SDK insists on streaming.
const PLAN_MAX_TOKENS = 8192;
const PAGE_MAX_TOKENS = 8192;
const EDIT_MAX_TOKENS = 16000;
const DESIGN_MAX_TOKENS = 8000;

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
