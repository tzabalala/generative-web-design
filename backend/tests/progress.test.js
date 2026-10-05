import express from 'express';
import request from 'supertest';
import { fakeClaude, reply, planFor, mainFor, siteFor, requestedSlug } from './helpers/fakeClaude.js';
import { createReporter, getProgress, clearProgress, isValidRequestId } from '../src/progress.js';
import { progressRouter } from '../src/routes/progress.js';
import { generateRouter } from '../src/routes/generate.js';
import { closeBrowser } from '../src/validation/browserManager.js';

afterAll(async () => {
  await closeBrowser();
});

beforeEach(() => clearProgress());

describe('progress store', () => {
  it('ignores missing or malformed ids without throwing', () => {
    for (const bad of [undefined, null, '', 'short', 'has spaces in it!!', 'x'.repeat(65), 42]) {
      expect(isValidRequestId(bad)).toBe(false);
      expect(() => createReporter(bad)('generating')).not.toThrow();
      expect(getProgress(bad)).toEqual({ stage: null });
    }
  });

  it('remembers the latest stage and its details, without leaking internals', () => {
    const report = createReporter('req-abcdef-123');
    report('generating');
    expect(getProgress('req-abcdef-123')).toEqual({ stage: 'generating' });
    report('fixing', { attempt: 2, max: 3 });
    expect(getProgress('req-abcdef-123')).toEqual({ stage: 'fixing', attempt: 2, max: 3 });
  });

  it('reports "nothing running" for an unknown id', () => {
    expect(getProgress('req-never-used-1')).toEqual({ stage: null });
  });
});

describe('GET /api/progress/:id', () => {
  it('answers 200 even for an unknown id (so the browser console stays clean)', async () => {
    const app = express();
    app.use('/api/progress', progressRouter());
    const res = await request(app).get('/api/progress/req-unknown-77');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ stage: null });
  });
});

// ---- the stages a real request goes through -------------------------------------------

describe('stages during a generate request', () => {
  it('goes planning -> writing (pages ready) -> fixing -> designing, and the polled value matches each moment', async () => {
    const REQ = 'req-stage-test-1';
    const seen = []; // [kind of call, what the browser would see right now]
    const good = siteFor(['index', 'about']);
    const anthropic = fakeClaude({
      slugs: ['index', 'about'],
      handlers: {
        plan: () => {
          seen.push(['plan', getProgress(REQ)]);
          return reply(planFor(['index', 'about']));
        },
        page: (args) => {
          seen.push(['page', getProgress(REQ)]);
          const slug = requestedSlug(args);
          // the about page forgets its image's alt text, so one automatic fix is needed
          return reply({ html: slug === 'about' ? mainFor(slug).replace(/ alt="[^"]*"/, '') : mainFor(slug), css: '' });
        },
        edit: () => {
          seen.push(['edit', getProgress(REQ)]);
          return reply({ css: null, pages: [{ slug: 'about', html: good.pages[1].html }], removePages: [] });
        },
        design: () => {
          seen.push(['design', getProgress(REQ)]);
          return reply({ rationale: { summary: 'x' }, placeholders: [] });
        },
      },
    });
    const app = express();
    app.use(express.json());
    app.use('/api/generate', generateRouter(anthropic));

    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: 'progress stages: unique prompt one', requestId: REQ });

    expect(res.status).toBe(200);
    expect(res.body.validation.attempts).toBe(1);
    const at = (kind) => seen.filter(([k]) => k === kind).map(([, progress]) => progress);
    expect(at('plan')).toEqual([{ stage: 'planning' }]);
    for (const progress of at('page')) expect(progress).toEqual({ stage: 'writing', done: 0, total: 2 });
    expect(at('edit')).toEqual([{ stage: 'fixing', attempt: 1, max: 3 }]);
    expect(at('design')).toEqual([{ stage: 'designing' }]);
    expect(getProgress(REQ).stage).toBe('designing');
  }, 60000);

  it('counts the pages that are ready while the site is being written', async () => {
    const REQ = 'req-stage-test-2';
    const doneSeen = [];
    const anthropic = fakeClaude({
      slugs: ['index', 'about', 'contact'],
      handlers: {
        page: (args) => {
          doneSeen.push(getProgress(REQ).done);
          return reply({ html: mainFor(requestedSlug(args)), css: '' });
        },
      },
    });
    const app = express();
    app.use(express.json());
    app.use('/api/generate', generateRouter(anthropic));
    process.env.PAGE_CONCURRENCY = '1'; // one page at a time, so the count is predictable

    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: 'progress stages: unique prompt three', requestId: REQ });
    delete process.env.PAGE_CONCURRENCY;

    expect(res.status).toBe(200);
    expect(doneSeen).toEqual([0, 1, 2]);
  }, 60000);

  it('reports "cached" when the answer is already stored', async () => {
    const anthropic = fakeClaude();
    const app = express();
    app.use(express.json());
    app.use('/api/generate', generateRouter(anthropic));

    const prompt = 'progress stages: unique prompt two (cache)';
    await request(app).post('/api/generate').send({ prompt });
    const res = await request(app).post('/api/generate').send({ prompt, requestId: 'req-cached-test-1' });

    expect(res.body.fromCache).toBe(true);
    expect(getProgress('req-cached-test-1').stage).toBe('cached');
  }, 60000);
});
