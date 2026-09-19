import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { refineRouter } from '../src/routes/refine.js';
import { sessionRouter } from '../src/routes/session.js';
import { createSession, addHistoryEntry, getSession } from '../src/sessionStore.js';
import { closeBrowser } from '../src/validation/browserManager.js';

const VALID_HTML = '<main><h1>Hi</h1></main>';
const VALID_CSS =
  'body{color:#000;background:#fff}.x{display:grid}@media (max-width:600px){body{font-size:0.9rem}}@media (min-width:601px){body{font-size:1.1rem}}';

function buildApp(mockResponseText) {
  const anthropic = {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ text: mockResponseText }],
        usage: { input_tokens: 5, output_tokens: 5 },
      }),
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/refine', refineRouter(anthropic));
  app.use('/api/session', sessionRouter());
  return { app, anthropic };
}

afterAll(async () => {
  await closeBrowser();
});

describe('POST /api/refine', () => {
  it('applies a targeted change and grows the session history', async () => {
    const sessionId = createSession();
    addHistoryEntry(sessionId, { prompt: 'seed', html: VALID_HTML, css: VALID_CSS, validation: null });

    const { app } = buildApp(
      `"html": ${JSON.stringify('<main><h1>Bye</h1></main>')}, "css": ${JSON.stringify(VALID_CSS)}}`
    );
    const res = await request(app)
      .post('/api/refine')
      .send({ sessionId, instruction: 'change the heading text' });

    expect(res.status).toBe(200);
    expect(res.body.html).toContain('Bye');
    expect(getSession(sessionId).history.length).toBe(2);
  }, 30000);

  it('404s for an unknown sessionId', async () => {
    const { app } = buildApp('irrelevant');
    const res = await request(app)
      .post('/api/refine')
      .send({ sessionId: 'does-not-exist', instruction: 'do something' });
    expect(res.status).toBe(404);
  });

  it('blocks requests once the iteration limit is reached', async () => {
    process.env.MAX_ITERATIONS_PER_SESSION = '1';
    const sessionId = createSession();
    addHistoryEntry(sessionId, { prompt: 'seed', html: VALID_HTML, css: VALID_CSS, validation: null });

    const { app } = buildApp(
      `"html": ${JSON.stringify(VALID_HTML)}, "css": ${JSON.stringify(VALID_CSS)}}`
    );
    const res = await request(app)
      .post('/api/refine')
      .send({ sessionId, instruction: 'change something' });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('ITERATION_LIMIT'); // the UI translates this code
    delete process.env.MAX_ITERATIONS_PER_SESSION;
  });
});

describe('Session + undo', () => {
  it('GET /api/session/:id returns history and usage', async () => {
    const sessionId = createSession();
    addHistoryEntry(sessionId, { prompt: 'seed', html: VALID_HTML, css: VALID_CSS, validation: null });

    const { app } = buildApp('irrelevant');
    const res = await request(app).get(`/api/session/${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.body.history.length).toBe(1);
  });

  it('POST /api/session/:id/undo returns the previous version without calling Claude', async () => {
    const sessionId = createSession();
    addHistoryEntry(sessionId, { prompt: 'v1', html: '<p>v1</p>', css: '', validation: null });
    addHistoryEntry(sessionId, { prompt: 'v2', html: '<p>v2</p>', css: '', validation: null });

    const { app, anthropic } = buildApp('irrelevant');
    const res = await request(app).post(`/api/session/${sessionId}/undo`);

    expect(res.status).toBe(200);
    expect(res.body.html).toBe('<p>v1</p>');
    expect(anthropic.messages.create).not.toHaveBeenCalled();
  });

  it('409s when there is nothing left to undo', async () => {
    const sessionId = createSession();
    addHistoryEntry(sessionId, { prompt: 'v1', html: '<p>v1</p>', css: '', validation: null });

    const { app } = buildApp('irrelevant');
    const res = await request(app).post(`/api/session/${sessionId}/undo`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOTHING_TO_UNDO');
  });
});
