import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { getDb } from '../src/db.js';
import { logEvent, cleanParticipant, validationStats, describeEvent } from '../src/studyLog.js';
import { generateRouter } from '../src/routes/generate.js';
import { refineRouter } from '../src/routes/refine.js';
import { sessionRouter } from '../src/routes/session.js';
import { getSession } from '../src/sessionStore.js';
import { resolveModel } from '../src/config.js';
import { closeBrowser } from '../src/validation/browserManager.js';

afterAll(async () => {
  await closeBrowser();
});

const HTML = '<main><h1>Hi</h1><img src="a.jpg" alt="A descriptive photo"></main>';
const CSS =
  'body{color:#000;background:#fff;font-size:1rem}.x{display:flex}@media (max-width:600px){body{font-size:0.9rem}}@media (min-width:601px){body{font-size:1.1rem}}';
const codeReply = (html = HTML) => ({
  content: [{ text: JSON.stringify({ html, css: CSS }).slice(1) }],
  usage: { input_tokens: 100, output_tokens: 50 },
});
const designReply = () => ({
  content: [{ text: JSON.stringify({ rationale: { summary: 's' }, placeholders: [] }).slice(1) }],
  usage: { input_tokens: 10, output_tokens: 5 },
});

function buildApp(create) {
  const anthropic = { messages: { create } };
  const app = express();
  app.use(express.json());
  app.use('/api/generate', generateRouter(anthropic));
  app.use('/api/refine', refineRouter(anthropic));
  app.use('/api/session', sessionRouter());
  return app;
}

// Answers the code call, then the design call, then code again, and so on.
const happyCreate = () =>
  jest.fn(async (args) =>
    String(args.system).includes('design consultant') ? designReply() : codeReply()
  );

const eventsWhere = (column, value) =>
  getDb().prepare(`SELECT * FROM events WHERE ${column} = ? ORDER BY id`).all(value);

describe('cleanParticipant', () => {
  it('accepts short anonymous codes', () => {
    for (const ok of ['P01', 'p-3', 'user_7', 'A'.repeat(24)]) expect(cleanParticipant(ok)).toBe(ok);
  });

  it('drops anything that could be a real name or an injection attempt', () => {
    for (const bad of ['Jane Doe', 'jane@doe.com', '', 'A'.repeat(25), '<script>', "P1'; DROP", null, undefined, 7]) {
      expect(cleanParticipant(bad)).toBeNull();
    }
  });
});

describe('validationStats', () => {
  it('reads attempts, pass state and the issues found in the RAW generation', () => {
    const stats = validationStats({
      passed: true,
      attempts: 2,
      remainingIssues: [],
      retryHistory: [{ attempt: 1, issues: ['a', 'b', 'c'] }, { attempt: 2, issues: ['d'] }],
    });
    expect(stats).toEqual({ attempts: 2, passed: true, remainingIssues: 0, initialIssues: 3 });
  });

  it('reports 0 initial issues for a clean first try, and nothing for a missing result', () => {
    expect(validationStats({ passed: true, attempts: 0, remainingIssues: [], retryHistory: [] }).initialIssues).toBe(0);
    expect(validationStats(null)).toEqual({});
  });
});

describe('logEvent', () => {
  it('stores an event and never throws, even when the row is invalid', () => {
    logEvent({ kind: 'generate', status: 'ok', prompt: 'direct-log-1', durationMs: 12, passed: true });
    const [row] = eventsWhere('prompt', 'direct-log-1');
    expect(row.duration_ms).toBe(12);
    expect(row.passed).toBe(1);

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => logEvent({ status: 'ok' })).not.toThrow(); // "kind" is required by the table
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('events recorded by the API', () => {
  it('logs a successful generate with duration, model, participant and check results', async () => {
    const app = buildApp(happyCreate());
    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: 'study log — generate ok', participant: 'P01' });
    expect(res.status).toBe(200);

    const [ev] = eventsWhere('session_id', res.body.sessionId);
    expect(ev).toMatchObject({
      kind: 'generate', status: 'ok', http_status: 200, participant: 'P01',
      model: resolveModel(), from_cache: 0, attempts: 0, passed: 1, initial_issues: 0,
      prompt: 'study log — generate ok',
    });
    expect(Number.isInteger(ev.duration_ms)).toBe(true);
    expect(ev.duration_ms).toBeGreaterThanOrEqual(0);
    expect(ev.input_tokens).toBeGreaterThan(0);
    expect(getSession(res.body.sessionId).participant).toBe('P01');
  }, 60000);

  it('discards an invalid participant code instead of storing it', async () => {
    const app = buildApp(happyCreate());
    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: 'study log — bad participant', participant: 'Jane Doe' });
    const [ev] = eventsWhere('session_id', res.body.sessionId);
    expect(ev.participant).toBeNull();
    expect(getSession(res.body.sessionId).participant).toBeNull();
  }, 60000);

  it('marks a repeated request as served from the cache, with zero tokens', async () => {
    const app = buildApp(happyCreate());
    const prompt = 'study log — cache repeat';
    await request(app).post('/api/generate').send({ prompt });
    const second = await request(app).post('/api/generate').send({ prompt });
    const [ev] = eventsWhere('session_id', second.body.sessionId);
    expect(ev.from_cache).toBe(1);
    expect(ev.input_tokens).toBe(0);
  }, 60000);

  it('logs a failed generate (502) even though no session exists', async () => {
    const app = buildApp(jest.fn(async () => ({ content: [{ text: 'not json at all' }], usage: {} })));
    const res = await request(app).post('/api/generate').send({ prompt: 'study log — broken output' });
    expect(res.status).toBe(502);
    const [ev] = eventsWhere('prompt', 'study log — broken output');
    expect(ev).toMatchObject({ kind: 'generate', status: 'error', http_status: 502, session_id: null });
  });

  it('logs refine (inheriting the participant), the iteration limit, and undo', async () => {
    const app = buildApp(happyCreate());
    const gen = await request(app)
      .post('/api/generate')
      .send({ prompt: 'study log — refine flow', participant: 'P02' });
    const sessionId = gen.body.sessionId;

    const refine = await request(app).post('/api/refine').send({ sessionId, instruction: 'make it blue' });
    expect(refine.status).toBe(200);

    const undo = await request(app).post(`/api/session/${sessionId}/undo`);
    expect(undo.status).toBe(200);
    const undoAgain = await request(app).post(`/api/session/${sessionId}/undo`);
    expect(undoAgain.status).toBe(409);

    process.env.MAX_ITERATIONS_PER_SESSION = '1';
    const blocked = await request(app).post('/api/refine').send({ sessionId, instruction: 'one more' });
    delete process.env.MAX_ITERATIONS_PER_SESSION;
    expect(blocked.status).toBe(429);

    const events = eventsWhere('session_id', sessionId);
    expect(events.map((e) => `${e.kind}:${e.status}`)).toEqual([
      'generate:ok', 'refine:ok', 'undo:ok', 'undo:noop', 'refine:limit',
    ]);
    // every event of the session carries the participant code given at the start
    expect(new Set(events.map((e) => e.participant))).toEqual(new Set(['P02']));
    expect(events[1].prompt).toBe('make it blue');
    expect(events[4].error_code).toBe('ITERATION_LIMIT');
  }, 60000);
});

describe('describeEvent (the line printed in the backend terminal)', () => {
  it('reads like a sentence for a page that needed an automatic fix', () => {
    expect(
      describeEvent({ kind: 'generate', status: 'ok', durationMs: 106100, attempts: 1, passed: true, participant: 'P01' })
    ).toBe('[request] generate | ok | 106.1s | 1 automatic fix | all checks passed | participant P01');
  });

  it('says so when nothing needed fixing, when Claude was not called, and when checks still fail', () => {
    expect(describeEvent({ kind: 'refine', status: 'ok', durationMs: 20, fromCache: true, attempts: 0, passed: true })).toBe(
      '[request] refine | ok | 0.0s | from cache, Claude not called | no fix needed | all checks passed'
    );
    expect(describeEvent({ kind: 'generate', status: 'ok', durationMs: 5000, attempts: 3, passed: false })).toContain(
      '3 automatic fixes | CHECKS STILL FAILING'
    );
  });

  it('shows the error code for failures and stays short for undo', () => {
    expect(describeEvent({ kind: 'generate', status: 'error', durationMs: 2000, errorCode: 'ClaudeOutputError' })).toBe(
      '[request] generate | error | 2.0s | ClaudeOutputError'
    );
    expect(describeEvent({ kind: 'undo', status: 'ok', durationMs: 5 })).toBe('[request] undo | ok | 0.0s');
  });
});
