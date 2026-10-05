import { validateSite } from '../src/validation/index.js';
import { runWithValidation } from '../src/validationLoop.js';
import { closeBrowser } from '../src/validation/browserManager.js';
import { fakeClaude, reply, siteFor, userText } from './helpers/fakeClaude.js';

afterAll(async () => {
  await closeBrowser();
});

const breakAlt = (site, slug) => ({
  ...site,
  pages: site.pages.map((p) => (p.slug === slug ? { ...p, html: p.html.replace(/ alt="[^"]*"/, '') } : p)),
});

describe('validateSite', () => {
  it('passes a healthy one-page site and a healthy several-page site', async () => {
    const one = await validateSite(siteFor(['index']));
    expect(one.passed).toBe(true);
    expect(one.site).toEqual({ passed: true, issues: [] });

    const many = await validateSite(siteFor(['index', 'about', 'contact']));
    expect(many.passed).toBe(true);
    expect(many.responsive.visual.pages.map((p) => p.slug)).toEqual(['index', 'about', 'contact']);
  }, 60000);

  it('runs axe-core on EVERY page and says which page a violation is on (only for several pages)', async () => {
    const result = await validateSite(breakAlt(siteFor(['index', 'about']), 'about'));
    expect(result.passed).toBe(false);
    expect(result.accessibility.violations.map((v) => v.page)).toContain('about');
    expect(result.accessibility.violations.map((v) => v.page)).not.toContain('index');
    expect(result.issueSummary.some((i) => i.startsWith('[accessibility] (page: about)'))).toBe(true);

    const single = await validateSite(breakAlt(siteFor(['index']), 'index'));
    expect(single.issueSummary.every((i) => !i.includes('(page:'))).toBe(true);
  }, 60000);

  it('runs the real layout check on every page', async () => {
    const site = siteFor(['index', 'about']);
    site.pages[1] = { ...site.pages[1], css: '.wide{width:900px;height:20px}' };
    site.pages[1].html = site.pages[1].html.replace('</main>', '<div class="wide">x</div></main>');

    const result = await validateSite(site);
    expect(result.responsive.passed).toBe(false);
    expect(result.responsive.issues.join('\n')).toMatch(/\(page: about\) Horizontal scrolling at 375px/);
    expect(result.responsive.visual.pages[0].passed).toBe(true);
    expect(result.responsive.visual.pages[1].passed).toBe(false);
  }, 60000);

  it('includes the site check: a broken link fails the whole site', async () => {
    const site = siteFor(['index', 'about']);
    site.pages[0] = { ...site.pages[0], html: site.pages[0].html.replace('</main>', '<a href="gone.html">x</a></main>') };
    const result = await validateSite(site);
    expect(result.passed).toBe(false);
    expect(result.site.passed).toBe(false);
    expect(result.issueSummary.some((i) => i.startsWith('[site]') && i.includes('gone.html'))).toBe(true);
  }, 60000);

  it('judges the static media-query check once, on the shared css and the page css together', async () => {
    const site = siteFor(['index', 'about']);
    site.css = ':root{--a:#000}body{display:flex;font-size:1rem}';
    site.pages[1] = { ...site.pages[1], css: '@media (max-width:600px){body{font-size:0.9rem}}@media (min-width:601px){body{font-size:1.1rem}}' };
    const result = await validateSite(site);
    expect(result.responsive.mediaRuleCount).toBe(2);
    expect(result.responsive.issues.filter((i) => /@media/.test(i))).toEqual([]);
  }, 60000);
});

describe('runWithValidation on a site', () => {
  it('merges the fix into the site, re-checks all of it, and reports the usage of every call', async () => {
    const good = siteFor(['index', 'about']);
    const broken = breakAlt(good, 'about');
    let fixPrompt = '';
    const claude = fakeClaude({
      handlers: {
        edit: (args) => {
          fixPrompt = userText(args);
          return reply({ css: null, pages: [{ slug: 'about', html: good.pages[1].html }], removePages: [] }, { input_tokens: 7, output_tokens: 9 });
        },
      },
    });

    const result = await runWithValidation(claude, { ...broken, usage: { inputTokens: 1, outputTokens: 2 } });
    expect(result.validation.passed).toBe(true);
    expect(result.validation.attempts).toBe(1);
    expect(result.validation.retryHistory[0].issues[0]).toContain('(page: about)');
    expect(result.pages[1].html).toBe(good.pages[1].html);
    expect(result.pages[0].html).toBe(good.pages[0].html);
    expect(result.usage).toEqual({ inputTokens: 8, outputTokens: 11 });
    expect(fixPrompt).toContain('=== PAGE slug="index"'); // Claude sees the whole site, not one page
    expect(result.validation.site.passed).toBe(true);
  }, 60000);

  it('tells Claude when its replacement matched nothing, and the next attempt can succeed', async () => {
    const good = siteFor(['index']);
    const broken = { ...good, pages: [{ ...good.pages[0], css: '.low{color:#bbbbbb}' }] };
    broken.pages[0].html = broken.pages[0].html.replace('</main>', '<p class="low">Pale text</p></main>');
    const prompts = [];
    const claude = fakeClaude({
      handlers: {
        edit: (args, n) => {
          prompts.push(userText(args));
          // first answer quotes text that is not in the css; the second one is exact and names the page
          return reply(
            n === 1
              ? { css: null, cssEdits: [{ find: '.low { color: #cccccc }', replace: '.low{color:#444}' }], pages: [], removePages: [] }
              : { css: null, cssEdits: [{ find: '#bbbbbb', replace: '#444444', slug: 'index' }], pages: [], removePages: [] }
          );
        },
      },
    });

    const result = await runWithValidation(claude, { ...broken, usage: { inputTokens: 0, outputTokens: 0 } });
    expect(result.validation.passed).toBe(true);
    expect(result.validation.attempts).toBe(2);
    expect(prompts[0]).not.toContain('[edit] Your css replacement');
    expect(prompts[1]).toContain('[edit] Your css replacement of ".low { color: #cccccc }" did not change anything');
    expect(result.pages[0].css).toContain('#444444');
  }, 90000);

  it('stops after MAX_VALIDATION_RETRIES and returns the site with the remaining issues', async () => {
    process.env.MAX_VALIDATION_RETRIES = '2';
    const broken = breakAlt(siteFor(['index', 'about']), 'about');
    const claude = fakeClaude(); // its edits change nothing
    const stages = [];
    const result = await runWithValidation(claude, { ...broken, usage: { inputTokens: 0, outputTokens: 0 } }, {
      onStage: (name, extra) => stages.push(`${name}${extra ? ` ${extra.attempt}/${extra.max}` : ''}`),
    });
    delete process.env.MAX_VALIDATION_RETRIES;

    expect(claude.counts.edit).toBe(2);
    expect(result.validation.passed).toBe(false);
    expect(result.validation.attempts).toBe(2);
    expect(result.validation.remainingIssues.join('\n')).toContain('(page: about)');
    expect(stages).toEqual(['checking 0/2', 'fixing 1/2', 'checking 1/2', 'fixing 2/2', 'checking 2/2']);
  }, 120000);
});
