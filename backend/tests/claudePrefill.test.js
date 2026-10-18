import { jest } from '@jest/globals';
import { callClaudeForPlan, extractJson, isPrefillRefusal, resetPrefillMemory, answerText, firstJsonObject, escapeControlCharacters } from '../src/claudeCodeClient.js';
import { ClaudeOutputError } from '../src/claudeErrors.js';
import { planFor } from './helpers/fakeClaude.js';

afterEach(() => resetPrefillMemory());

const usage = { input_tokens: 10, output_tokens: 20 };
const plan = planFor(['index']);

// The real refusal of Claude Sonnet 5 (2026-10-18), as the SDK raises it.
const refusal = () =>
  Object.assign(
    new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"This model does not support assistant message prefill. The conversation must end with a user message."}}'),
    { status: 400 }
  );

// A client for a model that refuses the prefill and otherwise answers with the whole JSON object.
function noPrefillModel(text = JSON.stringify(plan)) {
  const create = jest.fn(async (args) => {
    if (args.messages.at(-1).role === 'assistant') throw refusal();
    return { content: [{ text }], usage };
  });
  return { messages: { create } };
}

describe('models that refuse the assistant prefill', () => {
  it('asks again without the prefill, and the answer is read as the whole JSON object', async () => {
    const claude = noPrefillModel();
    const { plan: got, usage: used } = await callClaudeForPlan(claude, [
      { role: 'user', content: 'Plan and design a website for this request: x' },
      { role: 'assistant', content: '{' },
    ]);
    expect(got.pages.map((p) => p.slug)).toEqual(['index']);
    expect(claude.messages.create).toHaveBeenCalledTimes(2);
    const second = claude.messages.create.mock.calls[1][0];
    expect(second.messages.at(-1).role).toBe('user');
    expect(used).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it('remembers the model, so later calls skip the prefill and are not refused again', async () => {
    const claude = noPrefillModel();
    const messages = [{ role: 'user', content: 'x' }, { role: 'assistant', content: '{' }];
    await callClaudeForPlan(claude, messages);
    await callClaudeForPlan(claude, messages);
    expect(claude.messages.create).toHaveBeenCalledTimes(3); // refused once, then two plain calls
  });

  it('keeps the prefill for a model that accepts it (Haiku), with one call', async () => {
    const create = jest.fn(async () => ({ content: [{ text: JSON.stringify(plan).slice(1) }], usage }));
    await callClaudeForPlan({ messages: { create } }, [{ role: 'user', content: 'x' }, { role: 'assistant', content: '{' }]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].messages.at(-1)).toEqual({ role: 'assistant', content: '{' });
  });

  it('does not hide other errors', async () => {
    const create = jest.fn(async () => {
      throw Object.assign(new Error('400 credit balance is too low'), { status: 400 });
    });
    await expect(callClaudeForPlan({ messages: { create } }, [{ role: 'user', content: 'x' }, { role: 'assistant', content: '{' }])).rejects.toThrow(
      /credit balance/
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('still reports an answer that is not JSON as such', async () => {
    const claude = noPrefillModel('Sorry, I cannot help with that.');
    await expect(callClaudeForPlan(claude, [{ role: 'user', content: 'x' }, { role: 'assistant', content: '{' }])).rejects.toBeInstanceOf(
      ClaudeOutputError
    );
  });
});

describe('extractJson', () => {
  it('re-adds the "{" of the prefill', () => {
    expect(extractJson('"a":1}', true).parsed).toEqual({ a: 1 });
  });

  it('without the prefill, reads a plain object, a fenced one, or one after a short sentence', () => {
    expect(extractJson('{"a":1}', false).parsed).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```', false).parsed).toEqual({ a: 1 });
    expect(extractJson('Here is the plan:\n{"a":{"b":2}}', false).parsed).toEqual({ a: { b: 2 } });
    expect(extractJson('no json here', false).parsed).toBeUndefined();
  });

  it('recognises the refusal and nothing else', () => {
    expect(isPrefillRefusal(refusal())).toBe(true);
    expect(isPrefillRefusal(Object.assign(new Error('overloaded'), { status: 529 }))).toBe(false);
    expect(isPrefillRefusal(undefined)).toBe(false);
  });
});

describe('models that think before they answer', () => {
  it('reads the answer from the text block, not from the thinking block that comes first', async () => {
    // the shape of a real Claude Sonnet 5 answer (2026-10-18): an empty thinking block, then the text
    const create = jest.fn(async (args) => {
      if (args.messages.at(-1).role === 'assistant') throw refusal();
      return { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(plan) }], usage };
    });
    const { plan: got } = await callClaudeForPlan({ messages: { create } }, [{ role: 'user', content: 'x' }, { role: 'assistant', content: '{' }]);
    expect(got.pages.map((p) => p.slug)).toEqual(['index']);
  });

  it('answerText joins the text blocks and ignores the rest', () => {
    expect(answerText({ content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe('ab');
    expect(answerText({ content: [{ text: 'old fake shape' }] })).toBe('old fake shape');
    expect(answerText({})).toBe('');
  });
});

describe('reading the JSON when the answer has more than the object', () => {
  it('takes the first complete object even when a note after it contains braces', () => {
    const text = '{"css":".card{color:#111}","pages":[]}\n\nNote: I changed `.card {}` to darken the text.';
    expect(extractJson(text, false).parsed).toEqual({ css: '.card{color:#111}', pages: [] });
  });

  it('skips braces inside strings, including escaped quotes', () => {
    expect(firstJsonObject('x {"a":"say \\"}\\" here","b":{"c":1}} y')).toBe('{"a":"say \\"}\\" here","b":{"c":1}}');
  });

  it('moves on from a "{" that does not start valid JSON', () => {
    expect(firstJsonObject('Rule .x{ } then {"ok":true}')).toBe('{"ok":true}');
    expect(firstJsonObject('no object')).toBeNull();
  });
});

describe('a raw newline inside a JSON string', () => {
  // the failure of a real Sonnet 5 page (2026-10-18): one raw newline in an 8,000-character answer
  it('is escaped, so an otherwise valid answer is read, with or without the prefill', () => {
    const answer = '{"html":"<h1>Hi</h1>\n<p>text</p>","css":".a{}"}';
    expect(() => JSON.parse(answer)).toThrow();
    expect(extractJson(answer, false).parsed).toEqual({ html: '<h1>Hi</h1>\n<p>text</p>', css: '.a{}' });
    expect(extractJson(answer.slice(1), true).parsed.html).toBe('<h1>Hi</h1>\n<p>text</p>');
  });

  it('leaves newlines between values, escaped sequences and correct answers alone', () => {
    // newlines/tabs BETWEEN values stay; an escaped \n and an escaped quote stay; a raw tab INSIDE a string is escaped
    expect(escapeControlCharacters('{\n  "a": "x\\ny",\n\t"b": "q\\"\tz"\n}')).toBe('{\n  "a": "x\\ny",\n\t"b": "q\\"\\tz"\n}');
    const ok = '{"a":"b"}';
    expect(escapeControlCharacters(ok)).toBe(ok);
  });
});
