import express from 'express';
import request from 'supertest';
import { refineRouter } from '../src/routes/refine.js';
import { sessionRouter } from '../src/routes/session.js';
import { createSession, addHistoryEntry, getSession } from '../src/sessionStore.js';
import { closeBrowser } from '../src/validation/browserManager.js';
import { fakeClaude, reply, siteFor, userText } from './helpers/fakeClaude.js';

function buildApp(anthropic) {
  const app = express();
  app.use(express.json());
  app.use('/api/refine', refineRouter(anthropic));
  app.use('/api/session', sessionRouter());
  return app;
}

const seed = (slugs = ['index']) => {
  const sessionId = createSession();
  addHistoryEntry(sessionId, { prompt: 'seed', ...siteFor(slugs), validation: null });
  return sessionId;
};

afterAll(async () => {
  await closeBrowser();
});

describe('POST /api/refine', () => {
  it('applies a change to the page Claude picks, leaves the other pages alone, and grows the history', async () => {
    const sessionId = seed(['index', 'about']);
    const before = getSession(sessionId).history[0];
    const changedAbout = before.pages[1].html.replace('About us page', 'About our team');

    const claude = fakeClaude({
      slugs: ['index', 'about'],
      handlers: { edit: () => reply({ css: null, pages: [{ slug: 'about', html: changedAbout }], removePages: [] }) },
    });
    const res = await request(buildApp(claude))
      .post('/api/refine')
      .send({ sessionId, instruction: 'change the heading of the about page', currentPage: 'index' });

    expect(res.status).toBe(200);
    expect(res.body.pages.map((p) => p.slug)).toEqual(['index', 'about']);
    expect(res.body.pages[1].html).toContain('About our team');
    expect(res.body.pages[0].html).toBe(before.pages[0].html);
    expect(res.body.css).toBe(before.css);
    expect(getSession(sessionId).history).toHaveLength(2);
  }, 60000);

  it('sends the whole site and the page being viewed to Claude, and only that page name if it exists', async () => {
    const sessionId = seed(['index', 'about']);
    const claude = fakeClaude({ slugs: ['index', 'about'] });
    const app = buildApp(claude);

    await request(app).post('/api/refine').send({ sessionId, instruction: 'a first change', currentPage: 'about' });
    const prompt = userText(claude.messages.create.mock.calls[0][0]);
    expect(prompt).toContain('=== PAGE slug="index"');
    expect(prompt).toContain('=== PAGE slug="about"');
    expect(prompt).toContain('currently looking at the page "about"');

    await request(app).post('/api/refine').send({ sessionId, instruction: 'a second change', currentPage: 'does-not-exist' });
    expect(userText(claude.messages.create.mock.calls[1][0])).not.toContain('currently looking at');
  }, 60000);

  it('can add a page, and answers with a clear PAGE_LIMIT code when the site would get longer than 5 pages', async () => {
    const sessionId = seed(['index', 'about']);
    const withContact = siteFor(['index', 'about', 'contact']);
    const ok = fakeClaude({
      handlers: { edit: () => reply({ css: null, pages: withContact.pages, removePages: [] }) },
    });
    const added = await request(buildApp(ok)).post('/api/refine').send({ sessionId, instruction: 'add a contact page' });
    expect(added.status).toBe(200);
    expect(added.body.pages.map((p) => p.slug)).toEqual(['index', 'about', 'contact']);

    const six = siteFor(['index', 'about', 'contact', 'services', 'gallery', 'extra']).pages;
    const tooMany = fakeClaude({ handlers: { edit: () => reply({ css: null, pages: six, removePages: [] }) } });
    const bad = await request(buildApp(tooMany)).post('/api/refine').send({ sessionId, instruction: 'add everything' });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('PAGE_LIMIT'); // the UI shows a clear, translated message
    expect(bad.body.error).toMatch(/5 pages/);
    expect(bad.body.raw).toBeUndefined();
    expect(getSession(sessionId).history).toHaveLength(2); // nothing was saved
  }, 90000);

  it('404s for an unknown sessionId', async () => {
    const res = await request(buildApp(fakeClaude()))
      .post('/api/refine')
      .send({ sessionId: 'does-not-exist', instruction: 'do something' });
    expect(res.status).toBe(404);
  });

  it('blocks requests once the iteration limit is reached', async () => {
    process.env.MAX_ITERATIONS_PER_SESSION = '1';
    const sessionId = seed();
    const res = await request(buildApp(fakeClaude())).post('/api/refine').send({ sessionId, instruction: 'change something' });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('ITERATION_LIMIT'); // the UI translates this code
    delete process.env.MAX_ITERATIONS_PER_SESSION;
  });
});

describe('Session + undo', () => {
  it('GET /api/session/:id returns history (each version a whole site) and usage', async () => {
    const sessionId = seed(['index', 'about']);
    const res = await request(buildApp(fakeClaude())).get(`/api/session/${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].pages.map((p) => p.slug)).toEqual(['index', 'about']);
    expect(res.body.history[0].css).toContain('@media');
  });

  it('POST /api/session/:id/undo returns the previous version without calling Claude', async () => {
    const sessionId = createSession();
    addHistoryEntry(sessionId, { prompt: 'v1', ...siteFor(['index']), validation: null });
    addHistoryEntry(sessionId, { prompt: 'v2', ...siteFor(['index', 'about']), validation: null });

    const claude = fakeClaude();
    const res = await request(buildApp(claude)).post(`/api/session/${sessionId}/undo`);

    expect(res.status).toBe(200);
    expect(res.body.pages.map((p) => p.slug)).toEqual(['index']); // the one-page version is back
    expect(claude.messages.create).not.toHaveBeenCalled();
  });

  it('409s when there is nothing left to undo', async () => {
    const sessionId = seed();
    const res = await request(buildApp(fakeClaude())).post(`/api/session/${sessionId}/undo`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOTHING_TO_UNDO');
  });
});
