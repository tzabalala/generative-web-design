import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { generateRouter } from '../src/routes/generate.js';
import { closeBrowser } from '../src/validation/browserManager.js';

function buildAppWithMockAnthropic(mockResponseText) {
  const anthropic = {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ text: mockResponseText }],
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/generate', generateRouter(anthropic));
  return { app, anthropic };
}

// A complete, semantic, responsive HTML/CSS that passes the validation loop with no
// retries, so the tests do not have to wait for 3 fix cycles.
const VALID_HTML =
  '<main><h1>Hi</h1><img src="a.jpg" alt="A descriptive photo"></main>';
const VALID_CSS =
  'body{color:#000;background:#fff;font-size:1rem}.x{display:flex}@media (max-width:600px){body{font-size:0.9rem}}@media (min-width:601px){body{font-size:1.1rem}}';

afterAll(async () => {
  await closeBrowser();
});

describe('POST /api/generate', () => {
  it('returns html/css, a sessionId, and a validation result for a valid prompt', async () => {
    const { app } = buildAppWithMockAnthropic(
      `"html": ${JSON.stringify(VALID_HTML)}, "css": ${JSON.stringify(VALID_CSS)}}`
    );
    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: 'unique prompt one — small landing page' });

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeDefined();
    expect(res.body.html).toBe(VALID_HTML);
    expect(res.body.validation).toBeDefined();
    expect(res.body.validation.responsive.passed).toBe(true);
  }, 30000);

  it('strips markdown code fences before parsing', async () => {
    const { app } = buildAppWithMockAnthropic(
      `"html": ${JSON.stringify(VALID_HTML)}, "css": ${JSON.stringify(VALID_CSS)}}\n\`\`\``
    );
    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: 'unique prompt two — fence stripping check' });

    expect(res.status).toBe(200);
    expect(res.body.html).toBe(VALID_HTML);
  }, 30000);

  it('returns the design rationale and placeholder guide, and tolerates their absence', async () => {
    const extras = {
      rationale: { summary: 'Warm concept', colors: [{ hex: '#112233', name: 'Navy', why: 'Trust' }] },
      placeholders: [{ what: 'Title', where: 'Top', searchText: 'Hi', replaceWith: 'Your name' }],
    };
    const { app } = buildAppWithMockAnthropic(
      `"html": ${JSON.stringify(VALID_HTML)}, "css": ${JSON.stringify(VALID_CSS)}, "rationale": ${JSON.stringify(
        extras.rationale
      )}, "placeholders": ${JSON.stringify(extras.placeholders)}}`
    );
    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: 'unique prompt five — rationale check' });

    expect(res.status).toBe(200);
    expect(res.body.rationale.colors[0].hex).toBe('#112233');
    expect(res.body.placeholders[0].searchText).toBe('Hi');

    // Without extras the page is still delivered normally
    const { app: app2 } = buildAppWithMockAnthropic(
      `"html": ${JSON.stringify(VALID_HTML)}, "css": ${JSON.stringify(VALID_CSS)}}`
    );
    const res2 = await request(app2)
      .post('/api/generate')
      .send({ prompt: 'unique prompt six — no extras' });
    expect(res2.status).toBe(200);
    expect(res2.body.rationale).toBeNull();
    expect(res2.body.placeholders).toEqual([]);
  }, 30000);

  it('rejects an empty prompt', async () => {
    const { app } = buildAppWithMockAnthropic('irrelevant');
    const res = await request(app).post('/api/generate').send({ prompt: '  ' });
    expect(res.status).toBe(400);
  });

  it('returns 502 when Claude output is not valid JSON', async () => {
    const { app } = buildAppWithMockAnthropic('not json at all"}');
    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: 'unique prompt three — invalid json' });
    expect(res.status).toBe(502);
  });

  it('serves the second identical request from cache', async () => {
    const { app, anthropic } = buildAppWithMockAnthropic(
      `"html": ${JSON.stringify(VALID_HTML)}, "css": ${JSON.stringify(VALID_CSS)}}`
    );
    const prompt = 'unique prompt four — cache check';
    const first = await request(app).post('/api/generate').send({ prompt });
    const second = await request(app).post('/api/generate').send({ prompt });

    expect(first.body.fromCache).toBe(false);
    expect(second.body.fromCache).toBe(true);
    // 2 calls for the ONE generation (code + rationale); the 2nd identical request calls nothing
    expect(anthropic.messages.create).toHaveBeenCalledTimes(2);
  }, 30000);

  it('still delivers the page when the design-guide call fails', async () => {
    const anthropic = {
      messages: {
        create: jest
          .fn()
          .mockResolvedValueOnce({
            content: [{ text: `"html": ${JSON.stringify(VALID_HTML)}, "css": ${JSON.stringify(VALID_CSS)}}` }],
            usage: { input_tokens: 1, output_tokens: 1 },
          })
          .mockRejectedValueOnce(new Error('network down')),
      },
    };
    const app = express();
    app.use(express.json());
    app.use('/api/generate', generateRouter(anthropic));

    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: 'unique prompt seven — design call fails' });

    expect(res.status).toBe(200);
    expect(res.body.html).toBe(VALID_HTML);
    expect(res.body.rationale).toBeNull();
    expect(res.body.placeholders).toEqual([]);
  }, 30000);
});
