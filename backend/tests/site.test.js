import {
  MAX_PAGES,
  isValidSlug,
  normalizePlan,
  normalizePageReply,
  normalizeDelta,
  applyDelta,
  assemblePage,
  markCurrent,
  pageCss,
  siteHaystack,
  siteFingerprint,
  pagesFromLegacy,
} from '../src/site.js';
import { ClaudeOutputError } from '../src/claudeErrors.js';
import { planFor, siteFor, headerFor } from './helpers/fakeClaude.js';

describe('isValidSlug', () => {
  it('accepts file-name-like slugs only', () => {
    for (const ok of ['index', 'about', 'our-team', 'page-2', 'a'.repeat(40)]) expect(isValidSlug(ok)).toBe(true);
    for (const bad of ['', 'About', 'a b', '../x', 'x.html', '-a', 'a-', 'a--b', 'a'.repeat(41), null, 7]) {
      expect(isValidSlug(bad)).toBe(false);
    }
  });
});

describe('normalizePlan', () => {
  it('keeps a good plan and puts the home page first', () => {
    const raw = planFor(['about', 'index', 'contact']);
    const plan = normalizePlan(raw);
    expect(plan.pages.map((p) => p.slug)).toEqual(['index', 'about', 'contact']);
  });

  it('never allows more than 5 pages', () => {
    const plan = normalizePlan(planFor(['index', 'a', 'b', 'c', 'd', 'e', 'f', 'g']));
    expect(plan.pages).toHaveLength(MAX_PAGES);
  });

  it('turns the first page into the home page when none is called index', () => {
    const plan = normalizePlan(planFor(['welcome', 'about']));
    expect(plan.pages.map((p) => p.slug)).toEqual(['index', 'about']);
  });

  it('repairs invalid and duplicate slugs instead of trusting them', () => {
    const raw = planFor(['index', 'About Us!', 'index', '../etc/passwd']);
    const plan = normalizePlan(raw);
    expect(plan.pages.map((p) => p.slug)).toEqual(['index', 'page-2', 'page-3', 'page-4']);
    expect(new Set(plan.pages.map((p) => p.slug)).size).toBe(4);
  });

  it('fills in a missing title and rejects a plan without css, header, footer or pages', () => {
    const raw = planFor(['index']);
    raw.pages[0].title = '';
    expect(normalizePlan(raw).pages[0].title).toBe('Home');

    for (const missing of ['css', 'header', 'footer', 'pages']) {
      const broken = planFor(['index']);
      delete broken[missing];
      expect(() => normalizePlan(broken)).toThrow(ClaudeOutputError);
    }
    expect(() => normalizePlan('text')).toThrow(ClaudeOutputError);
    expect(() => normalizePlan({ ...planFor(['index']), pages: [] })).toThrow(ClaudeOutputError);
  });

  it('keeps only valid anchor ids', () => {
    const raw = planFor(['index']);
    raw.pages[0].anchors = ['prices', 'Bad Id', 'contact'];
    expect(normalizePlan(raw).pages[0].anchors).toEqual(['prices', 'contact']);
  });
});

describe('normalizePageReply', () => {
  it('needs html and tolerates a missing css', () => {
    expect(normalizePageReply({ html: '<h1>x</h1>' })).toEqual({ html: '<h1>x</h1>', css: '' });
    expect(() => normalizePageReply({ css: 'a{}' })).toThrow(ClaudeOutputError);
    expect(() => normalizePageReply({ html: '  ' })).toThrow(ClaudeOutputError);
  });
});

describe('markCurrent / assemblePage', () => {
  const header = headerFor(['index', 'about']);

  it('marks only the menu entry of the current page', () => {
    const marked = markCurrent(header, 'about');
    expect(marked).toContain('<a href="about.html" aria-current="page">About us</a>');
    expect(marked).not.toContain('<a href="index.html" aria-current');
    expect(marked.match(/aria-current/g)).toHaveLength(1);
  });

  it('does not mark the site-name link, and does not mark twice', () => {
    const home = markCurrent(header, 'index');
    expect(home).toContain('<a href="index.html">Test Studio</a>');
    expect(markCurrent(home, 'index')).toBe(home);
  });

  it('puts the same header and footer around every page, and unwraps a <main> Claude added anyway', () => {
    const plan = planFor(['index', 'about']);
    const a = assemblePage(plan, plan.pages[0], '<h1>A</h1>');
    const b = assemblePage(plan, plan.pages[1], '<main class="x"><h1>B</h1></main>');
    expect(a.startsWith('<header>')).toBe(true);
    expect(a).toContain('<main id="main">\n<h1>A</h1>\n</main>');
    expect(b).toContain('<main id="main">\n<h1>B</h1>\n</main>');
    expect(b.match(/<main/g)).toHaveLength(1);
    expect(a.endsWith('</footer>')).toBe(true);
  });
});

describe('normalizeDelta / applyDelta', () => {
  const site = siteFor(['index', 'about']);

  it('replaces only the pages that come back and keeps their old page css unless one is given', () => {
    const withCss = { ...site, pages: [site.pages[0], { ...site.pages[1], css: '.old{}' }] };
    const delta = normalizeDelta({ css: null, pages: [{ slug: 'about', html: '<p>new</p>' }], removePages: [] });
    const next = applyDelta(withCss, delta);
    expect(next.pages[0].html).toBe(site.pages[0].html);
    expect(next.pages[1]).toMatchObject({ slug: 'about', html: '<p>new</p>', css: '.old{}' });
    expect(next.pages[1].title).toBe(site.pages[1].title);
    expect(next.css).toBe(site.css);
  });

  it('replaces the shared css only when one is returned, and never changes its input', () => {
    const snapshot = JSON.stringify(site);
    const next = applyDelta(site, normalizeDelta({ css: 'body{color:red}', pages: [], removePages: [] }));
    expect(next.css).toBe('body{color:red}');
    expect(JSON.stringify(site)).toBe(snapshot);
    expect(applyDelta(site, normalizeDelta({ css: '  ', pages: [] })).css).toBe(site.css);
  });

  it('adds and removes pages, keeping the home page first', () => {
    const added = applyDelta(site, normalizeDelta({ pages: [{ slug: 'contact', title: 'Contact', html: '<p>c</p>' }] }));
    expect(added.pages.map((p) => p.slug)).toEqual(['index', 'about', 'contact']);
    const removed = applyDelta(added, normalizeDelta({ removePages: ['about'] }));
    expect(removed.pages.map((p) => p.slug)).toEqual(['index', 'contact']);
  });

  it('refuses to remove the home page, to exceed 5 pages, or to use an invalid page name', () => {
    expect(applyDelta(site, normalizeDelta({ removePages: ['index'] })).pages.map((p) => p.slug)).toContain('index');
    const six = ['a', 'b', 'c', 'd'].map((slug) => ({ slug, html: '<p/>' }));
    expect(() => applyDelta(site, normalizeDelta({ pages: six }))).toThrow(/longer than 5/);
    expect(() => normalizeDelta({ pages: [{ slug: '../hack', html: '<p/>' }] })).toThrow(ClaudeOutputError);
    expect(() => normalizeDelta({ pages: [{ slug: 'ok', html: '' }] })).toThrow(ClaudeOutputError);
    expect(() => normalizeDelta('nope')).toThrow(ClaudeOutputError);
  });
});

describe('cssEdits and htmlEdits', () => {
  const site = siteFor(['index', 'about']);
  const edits = (extra) => normalizeDelta({ pages: [], ...extra });

  it('applies exact replacements to the shared css', () => {
    const css = ':root{--c:#d4422f}a{color:#d4422f}';
    const next = applyDelta({ ...site, css }, edits({ cssEdits: [{ find: '#d4422f', replace: '#9b2c1c' }] }));
    expect(next.css).toBe(':root{--c:#9b2c1c}a{color:#9b2c1c}');
    expect(applyDelta({ ...site, css }, edits({ cssEdits: [{ find: 'nope', replace: 'x' }] })).css).toBe(css);
  });

  it('applies an html edit without a slug to every page', () => {
    const next = applyDelta(site, edits({ htmlEdits: [{ find: '1 Example Street', replace: '9 New Road' }] }));
    for (const p of next.pages) {
      expect(p.html).toContain('9 New Road');
      expect(p.html).not.toContain('1 Example Street');
    }
  });

  it('applies an html edit with a slug to that page only', () => {
    const next = applyDelta(site, edits({ htmlEdits: [{ find: 'About us page', replace: 'Our story', slug: 'about' }] }));
    expect(next.pages[1].html).toContain('Our story');
    expect(next.pages[0].html).toBe(site.pages[0].html);
  });

  it('does not touch a page that was returned in full, unless the edit names it', () => {
    const full = { slug: 'about', html: '<p>1 Example Street</p>' };
    const everywhere = applyDelta(site, normalizeDelta({ pages: [full], htmlEdits: [{ find: '1 Example Street', replace: 'X' }] }));
    expect(everywhere.pages[1].html).toBe('<p>1 Example Street</p>');
    expect(everywhere.pages[0].html).toContain('X');

    const named = applyDelta(site, normalizeDelta({ pages: [full], htmlEdits: [{ find: '1 Example Street', replace: 'X', slug: 'about' }] }));
    expect(named.pages[1].html).toBe('<p>X</p>');
  });

  it('ignores malformed edits and an invalid slug on an edit', () => {
    const d = normalizeDelta({
      pages: [],
      cssEdits: [{ find: '', replace: 'x' }, { find: 'a' }, null, 'str', { find: 'a', replace: 'b' }],
      htmlEdits: [{ find: 'a', replace: 'b', slug: '../x' }, { replace: 'x' }],
    });
    expect(d.cssEdits).toEqual([{ find: 'a', replace: 'b' }]);
    expect(d.htmlEdits).toEqual([{ find: 'a', replace: 'b', slug: undefined }]);
  });
});

describe('small helpers', () => {
  const site = siteFor(['index', 'about']);

  it('pageCss joins the shared and the page rules', () => {
    expect(pageCss(site, { css: '' })).toBe(site.css);
    expect(pageCss(site, { css: '.p{}' })).toBe(`${site.css}\n.p{}`);
  });

  it('siteHaystack contains every page and every stylesheet', () => {
    const hay = siteHaystack({ css: 'SHARED', pages: [{ html: 'ONE', css: 'P1' }, { html: 'TWO', css: '' }] });
    for (const part of ['ONE', 'TWO', 'SHARED', 'P1']) expect(hay).toContain(part);
  });

  it('siteFingerprint ignores whitespace differences but not content', () => {
    const a = { css: 'a  {}', pages: [{ slug: 'index', title: 't', html: '<p>x</p>', css: '' }] };
    const b = { css: 'a {}', pages: [{ slug: 'index', title: 't', html: '<p>x</p>', css: '' }] };
    const c = { css: 'a {}', pages: [{ slug: 'index', title: 't', html: '<p>y</p>', css: '' }] };
    expect(siteFingerprint(a)).toBe(siteFingerprint(b));
    expect(siteFingerprint(a)).not.toBe(siteFingerprint(c));
  });

  it('pagesFromLegacy makes a one-page site', () => {
    expect(pagesFromLegacy('<p/>', 'p{}')).toEqual({
      css: 'p{}',
      pages: [{ slug: 'index', title: '', html: '<p/>', css: '' }],
    });
  });
});
