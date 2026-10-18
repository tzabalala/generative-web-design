import { generateSite } from '../src/siteGenerator.js';
import { ClaudeOutputError } from '../src/claudeErrors.js';
import { fakeClaude, reply, rawReply, planFor, mainFor, requestedSlug, kindOf, userText } from './helpers/fakeClaude.js';

afterEach(() => {
  delete process.env.PAGE_CONCURRENCY;
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('generateSite', () => {
  it('plans first, then writes every page, and returns css, pages and the summed usage', async () => {
    const claude = fakeClaude({ slugs: ['index', 'about', 'contact'] });
    const site = await generateSite(claude, 'a site for a studio');

    expect(site.pages.map((p) => p.slug)).toEqual(['index', 'about', 'contact']);
    expect(site.pages.map((p) => p.title)).toEqual(['Home - Test Studio', 'About us - Test Studio', 'Contact - Test Studio']);
    expect(site.css).toContain('@media');
    expect(claude.counts).toMatchObject({ plan: 1, page: 3 });
    expect(claude.messages.create.mock.calls[0][0].system).toContain('You do NOT write the pages themselves');
    expect(site.usage).toEqual({ inputTokens: 40, outputTokens: 80 }); // 4 calls of 10 + 20
  });

  it('asks for the plan once more when a request for ONE page was planned as several pages', async () => {
    const claude = fakeClaude({
      handlers: {
        plan: (args, n) => reply(n === 1 ? planFor(['index', 'menu', 'contact']) : planFor(['index'])),
      },
    });
    const site = await generateSite(claude, 'a restaurant homepage with a menu section and a reservation form');

    expect(site.pages.map((p) => p.slug)).toEqual(['index']);
    expect(claude.counts).toMatchObject({ plan: 2, page: 1 });
    const planCalls = claude.messages.create.mock.calls.filter(([args]) => kindOf(args) === 'plan');
    expect(userText(planCalls[0][0])).toContain('This request is for ONE page');
    expect(userText(planCalls[1][0])).toContain('Your previous plan had several pages');
    expect(site.usage).toEqual({ inputTokens: 30, outputTokens: 60 }); // both plans + one page
  });

  it('keeps the first plan when the second one is not smaller (a usable site, not an error)', async () => {
    const claude = fakeClaude({ slugs: ['index', 'about'] });
    const site = await generateSite(claude, 'a contact page for a small bakery');
    expect(site.pages.map((p) => p.slug)).toEqual(['index', 'about']);
    expect(claude.counts).toMatchObject({ plan: 2, page: 2 });
  });

  it('does not ask again for a website or an unclear request', async () => {
    for (const request of ['a website for a yoga studio', 'a portfolio with a gallery and a contact page']) {
      const claude = fakeClaude({ slugs: ['index', 'about', 'contact'] });
      const site = await generateSite(claude, request);
      expect(site.pages).toHaveLength(3);
      expect(claude.counts.plan).toBe(1);
    }
  });

  it('keeps the page order of the plan even when the pages finish in another order', async () => {
    const claude = fakeClaude({
      slugs: ['index', 'about', 'contact'],
      handlers: {
        page: async (args) => {
          const slug = requestedSlug(args);
          await delay({ index: 60, about: 30, contact: 0 }[slug]); // the last page finishes first
          return reply({ html: mainFor(slug), css: `.${slug}{}` });
        },
      },
    });
    const site = await generateSite(claude, 'x');
    expect(site.pages.map((p) => p.slug)).toEqual(['index', 'about', 'contact']);
    expect(site.pages.map((p) => p.css)).toEqual(['.index{}', '.about{}', '.contact{}']);
  });

  it('writes pages a few at a time, never more than PAGE_CONCURRENCY at once', async () => {
    process.env.PAGE_CONCURRENCY = '2';
    let running = 0;
    let peak = 0;
    const claude = fakeClaude({
      slugs: ['index', 'about', 'contact', 'services', 'gallery'],
      handlers: {
        page: async (args) => {
          running += 1;
          peak = Math.max(peak, running);
          await delay(20);
          running -= 1;
          return reply({ html: mainFor(requestedSlug(args)), css: '' });
        },
      },
    });
    await generateSite(claude, 'x');
    expect(peak).toBe(2);
  });

  it('reports planning, then writing with the number of pages that are ready', async () => {
    process.env.PAGE_CONCURRENCY = '1';
    const stages = [];
    await generateSite(fakeClaude({ slugs: ['index', 'about'] }), 'x', {
      onStage: (name, extra) => stages.push([name, extra?.done, extra?.total]),
    });
    expect(stages).toEqual([
      ['planning', undefined, undefined],
      ['writing', 0, 2],
      ['writing', 1, 2],
      ['writing', 2, 2],
    ]);
  });

  it('survives a progress callback that throws', async () => {
    const site = await generateSite(fakeClaude(), 'x', {
      onStage: () => {
        throw new Error('boom');
      },
    });
    expect(site.pages).toHaveLength(1);
  });

  it('asks a page once more after a bad answer, but not after another kind of error', async () => {
    const flaky = fakeClaude({
      handlers: { page: (args, n) => (n === 1 ? rawReply('nope"}') : reply({ html: mainFor('index'), css: '' })) },
    });
    expect((await generateSite(flaky, 'x')).pages).toHaveLength(1);
    expect(flaky.counts.page).toBe(2);

    const down = fakeClaude({
      handlers: {
        page: () => {
          throw new Error('network down');
        },
      },
    });
    await expect(generateSite(down, 'x')).rejects.toThrow('network down');
    expect(down.counts.page).toBe(1);
  });

  it('fails with a ClaudeOutputError when the plan is unusable', async () => {
    const claude = fakeClaude({ handlers: { plan: () => reply({ ...planFor(['index']), header: '' }) } });
    await expect(generateSite(claude, 'x')).rejects.toBeInstanceOf(ClaudeOutputError);
    expect(claude.counts.page).toBe(0); // nothing was written
  });

  it('stops starting new pages after the first failure', async () => {
    process.env.PAGE_CONCURRENCY = '1';
    const claude = fakeClaude({
      slugs: ['index', 'about', 'contact', 'services'],
      handlers: {
        page: () => {
          throw new Error('stop here');
        },
      },
    });
    await expect(generateSite(claude, 'x')).rejects.toThrow('stop here');
    expect(claude.counts.page).toBe(1);
  });
});
