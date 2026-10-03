import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
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

const GOOD_HTML = '<main><h1>Hi</h1><img src="a.jpg" alt="A descriptive photo"></main>';
const BAD_HTML = '<main><h1>Hi</h1><img src="a.jpg"></main>'; // axe: image without alt text
const CSS =
  'body{color:#000;background:#fff;font-size:1rem}.x{display:flex}@media (max-width:600px){body{font-size:0.9rem}}@media (min-width:601px){body{font-size:1.1rem}}';

const reply = (obj) => ({
  content: [{ text: JSON.stringify(obj).slice(1) }], // the code re-adds the prefill "{"
  usage: { input_tokens: 1, output_tokens: 1 },
});

describe('stages during a generate request', () => {
  it('goes generating -> fixing -> designing, and the polled value matches each moment', async () => {
    const REQ = 'req-stage-test-1';
    const stagesSeen = [];
    const anthropic = {
      messages: {
        create: jest.fn(async () => {
          stagesSeen.push(getProgress(REQ).stage); // what the browser would see right now
          const call = stagesSeen.length;
          if (call === 1) return reply({ html: BAD_HTML, css: CSS });
          if (call === 2) return reply({ html: GOOD_HTML, css: CSS });
          return reply({ rationale: { summary: 'x' }, placeholders: [] });
        }),
      },
    };
    const app = express();
    app.use(express.json());
    app.use('/api/generate', generateRouter(anthropic));

    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: 'progress stages — unique prompt one', requestId: REQ });

    expect(res.status).toBe(200);
    expect(res.body.validation.attempts).toBe(1);
    expect(stagesSeen).toEqual(['generating', 'fixing', 'designing']);
    expect(getProgress(REQ).stage).toBe('designing');
  }, 60000);

  it('reports "cached" when the answer is already stored', async () => {
    const anthropic = {
      messages: {
        create: jest.fn(async () => reply({ html: GOOD_HTML, css: CSS })),
      },
    };
    const app = express();
    app.use(express.json());
    app.use('/api/generate', generateRouter(anthropic));

    const prompt = 'progress stages — unique prompt two (cache)';
    await request(app).post('/api/generate').send({ prompt });
    const res = await request(app).post('/api/generate').send({ prompt, requestId: 'req-cached-test-1' });

    expect(res.body.fromCache).toBe(true);
    expect(getProgress('req-cached-test-1').stage).toBe('cached');
  }, 60000);
});
