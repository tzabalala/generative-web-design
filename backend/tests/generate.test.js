import express from 'express';
import request from 'supertest';
import { generateRouter } from '../src/routes/generate.js';
import { closeBrowser } from '../src/validation/browserManager.js';
import { fakeClaude, reply, rawReply, planFor, mainFor, siteFor, requestedSlug } from './helpers/fakeClaude.js';

function buildApp(anthropic) {
  const app = express();
  app.use(express.json());
  app.use('/api/generate', generateRouter(anthropic));
  return app;
}

afterAll(async () => {
  await closeBrowser();
});

describe('POST /api/generate', () => {
  it('returns a one-page site, a sessionId and a validation result for a single-page request', async () => {
    const app = buildApp(fakeClaude({ slugs: ['index'] }));
    const res = await request(app).post('/api/generate').send({ prompt: 'unique prompt one: small landing page' });

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeDefined();
    expect(res.body.pages).toHaveLength(1);
    expect(res.body.pages[0].slug).toBe('index');
    expect(res.body.pages[0].html).toContain('<main id="main">');
    expect(res.body.css).toContain('@media');
    expect(res.body.validation.passed).toBe(true);
    expect(res.body.validation.responsive.passed).toBe(true);
    expect(res.body.validation.site.passed).toBe(true);
  }, 30000);

  it('builds a several-page site: one shared menu, a page each, and the current page marked', async () => {
    const slugs = ['index', 'about', 'contact'];
    const app = buildApp(fakeClaude({ slugs }));
    const res = await request(app).post('/api/generate').send({ prompt: 'unique prompt: website for a small studio' });

    expect(res.status).toBe(200);
    expect(res.body.pages.map((p) => p.slug)).toEqual(slugs);
    expect(res.body.validation.passed).toBe(true);
    for (const page of res.body.pages) {
      for (const slug of slugs) expect(page.html).toContain(`href="${slug}.html"`); // the shared menu
      expect(page.html).toContain(`href="${page.slug}.html" aria-current="page"`); // marks where you are
      expect(page.html).toContain('Test Studio, 1 Example Street'); // the shared footer
    }
    expect(res.body.pages[1].html).toContain('about'); // its own content
    expect(res.body.pages[1].html).not.toBe(res.body.pages[2].html);
  }, 60000);

  it('makes one plan call, one call per page, and one design call', async () => {
    const claude = fakeClaude({ slugs: ['index', 'about'] });
    const res = await request(buildApp(claude)).post('/api/generate').send({ prompt: 'unique prompt: call count' });
    expect(res.status).toBe(200);
    expect(claude.counts).toMatchObject({ plan: 1, page: 2, design: 1, edit: 0 });
  }, 60000);

  it('strips markdown code fences before parsing', async () => {
    const claude = fakeClaude({
      handlers: {
        page: (args) => rawReply(`${JSON.stringify({ html: mainFor(requestedSlug(args)), css: '' }).slice(1)}\n\`\`\``),
      },
    });
    const res = await request(buildApp(claude)).post('/api/generate').send({ prompt: 'unique prompt two: fence stripping' });
    expect(res.status).toBe(200);
    expect(res.body.pages[0].html).toContain('index page');
  }, 30000);

  it('returns the design rationale and placeholder guide, and tolerates their absence', async () => {
    const extras = {
      rationale: { summary: 'Warm concept', colors: [{ hex: '#112233', name: 'Navy', why: 'Trust' }] },
      placeholders: [{ what: 'Title', where: 'Home page, top', searchText: 'index page', replaceWith: 'Your name' }],
    };
    const claude = fakeClaude({ handlers: { design: () => reply(extras) } });
    const res = await request(buildApp(claude)).post('/api/generate').send({ prompt: 'unique prompt five: rationale' });

    expect(res.status).toBe(200);
    expect(res.body.rationale.colors[0].hex).toBe('#112233');
    expect(res.body.placeholders[0].searchText).toBe('index page');

    const bare = fakeClaude({ handlers: { design: () => reply({}) } });
    const res2 = await request(buildApp(bare)).post('/api/generate').send({ prompt: 'unique prompt six: no extras' });
    expect(res2.status).toBe(200);
    expect(res2.body.rationale).toBeNull();
    expect(res2.body.placeholders).toEqual([]);
  }, 30000);

  it('rejects an empty prompt', async () => {
    const res = await request(buildApp(fakeClaude())).post('/api/generate').send({ prompt: '  ' });
    expect(res.status).toBe(400);
  });

  it('returns 502 when the plan is not valid JSON', async () => {
    const claude = fakeClaude({ handlers: { plan: () => rawReply('not json at all"}') } });
    const res = await request(buildApp(claude)).post('/api/generate').send({ prompt: 'unique prompt three: invalid json' });
    expect(res.status).toBe(502);
  });

  it('asks a page once more when its answer is not valid JSON, then gives up with 502', async () => {
    const flaky = fakeClaude({
      handlers: { page: (args, n) => (n === 1 ? rawReply('oops"}') : reply({ html: mainFor('index'), css: '' })) },
    });
    const ok = await request(buildApp(flaky)).post('/api/generate').send({ prompt: 'unique prompt: flaky page' });
    expect(ok.status).toBe(200);
    expect(flaky.counts.page).toBe(2);

    const broken = fakeClaude({ handlers: { page: () => rawReply('oops"}') } });
    const bad = await request(buildApp(broken)).post('/api/generate').send({ prompt: 'unique prompt: broken page' });
    expect(bad.status).toBe(502);
    expect(broken.counts.page).toBe(2); // the original try and exactly one more
  });

  it('serves the second identical request from cache', async () => {
    const claude = fakeClaude({ slugs: ['index', 'about'] });
    const app = buildApp(claude);
    const prompt = 'unique prompt four: cache check';
    const first = await request(app).post('/api/generate').send({ prompt });
    const second = await request(app).post('/api/generate').send({ prompt });

    expect(first.body.fromCache).toBe(false);
    expect(second.body.fromCache).toBe(true);
    // plan + 2 pages + design for the ONE generation; the second identical request calls nothing
    expect(claude.messages.create).toHaveBeenCalledTimes(4);
  }, 60000);

  it('still delivers the site when the design-guide call fails', async () => {
    const claude = fakeClaude({
      handlers: {
        design: () => {
          throw new Error('network down');
        },
      },
    });
    const res = await request(buildApp(claude)).post('/api/generate').send({ prompt: 'unique prompt seven: design fails' });

    expect(res.status).toBe(200);
    expect(res.body.pages).toHaveLength(1);
    expect(res.body.rationale).toBeNull();
    expect(res.body.placeholders).toEqual([]);
  }, 30000);

  it('never returns more than 5 pages, however many the plan lists', async () => {
    const seven = ['index', 'about', 'contact', 'services', 'gallery', 'extra-one', 'extra-two'];
    const claude = fakeClaude({ handlers: { plan: () => reply(planFor(seven)) } });
    const res = await request(buildApp(claude)).post('/api/generate').send({ prompt: 'unique prompt: seven pages' });
    expect(res.status).toBe(200);
    expect(res.body.pages).toHaveLength(5);
    expect(claude.counts.page).toBe(5);
  }, 90000);

  it('fixes a problem on ONE page: the issue names the page, only that page is sent back, the site is re-checked', async () => {
    const good = siteFor(['index', 'about']);
    let editPrompt = '';
    const claude = fakeClaude({
      slugs: ['index', 'about'],
      handlers: {
        // the about page forgets the alt text of its image
        page: (args) => {
          const slug = requestedSlug(args);
          return reply({ html: slug === 'about' ? mainFor(slug).replace(/ alt="[^"]*"/, '') : mainFor(slug), css: '' });
        },
        edit: (args) => {
          editPrompt = String(args.messages[0].content);
          return reply({ css: null, pages: [{ slug: 'about', html: good.pages[1].html, css: '' }], removePages: [] });
        },
      },
    });
    const res = await request(buildApp(claude)).post('/api/generate').send({ prompt: 'unique prompt: fix one page' });

    expect(res.status).toBe(200);
    expect(editPrompt).toMatch(/\[accessibility\] \(page: about\)/);
    expect(res.body.validation.attempts).toBe(1);
    expect(res.body.validation.passed).toBe(true);
    expect(res.body.validation.retryHistory[0].issues.join('\n')).toContain('(page: about)');
    expect(res.body.pages[1].html).toContain('alt="A photo for the about page"');
    expect(res.body.pages[0].html).toBe(good.pages[0].html); // the other page was not touched
  }, 120000);
});
