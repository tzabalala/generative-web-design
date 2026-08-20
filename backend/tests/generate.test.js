import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { generateRouter } from '../src/routes/generate.js';

function buildAppWithMockAnthropic(mockResponseText) {
  const anthropic = {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ text: mockResponseText }],
      }),
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/generate', generateRouter(anthropic));
  return { app, anthropic };
}

describe('POST /api/generate', () => {
  it('returns html/css and a sessionId for a valid prompt', async () => {
    const { app } = buildAppWithMockAnthropic(
      '"html": "<p>hi</p>", "css": "p { color: red; }"}'
    );
    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: 'a small landing page' });

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeDefined();
    expect(res.body.html).toBe('<p>hi</p>');
    expect(res.body.css).toBe('p { color: red; }');
  });

  it('strips markdown code fences before parsing', async () => {
    const { app } = buildAppWithMockAnthropic(
      '"html": "<p>hi</p>", "css": ""}\n```'
    );
    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: 'a small landing page' });

    expect(res.status).toBe(200);
    expect(res.body.html).toBe('<p>hi</p>');
  });

  it('rejects an empty prompt', async () => {
    const { app } = buildAppWithMockAnthropic('irrelevant');
    const res = await request(app).post('/api/generate').send({ prompt: '  ' });
    expect(res.status).toBe(400);
  });

  it('returns 502 when Claude output is not valid JSON', async () => {
    const { app } = buildAppWithMockAnthropic('not json at all"}');
    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: 'a small landing page' });
    expect(res.status).toBe(502);
  });
});
