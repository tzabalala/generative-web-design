import { checkSite } from '../src/validation/siteChecker.js';
import { siteFor, mainFor, headerFor, planFor, FOOTER } from './helpers/fakeClaude.js';
import { assemblePage } from '../src/site.js';

const withPage = (site, slug, change) => ({
  ...site,
  pages: site.pages.map((p) => (p.slug === slug ? { ...p, ...change(p) } : p)),
});
const issuesOf = (site) => checkSite(site).issues.join('\n');

describe('checkSite on a healthy site', () => {
  it('passes for one page and for several pages', () => {
    expect(checkSite(siteFor(['index']))).toEqual({ passed: true, issues: [] });
    expect(checkSite(siteFor(['index', 'about', 'contact', 'services', 'gallery']))).toEqual({ passed: true, issues: [] });
  });
});

describe('motion', () => {
  const withCss = (css) => ({ ...siteFor(['index']), css: `${siteFor(['index']).css}${css}` });

  it('accepts a logo animation that is switched off for reduced motion', () => {
    const css = '.logo{animation:glow 3s infinite}@keyframes glow{50%{opacity:.8}}@media (prefers-reduced-motion: reduce){.logo{animation:none}}';
    expect(checkSite(withCss(css)).passed).toBe(true);
  });

  it('reports an animation without a reduced-motion rule, whether it is in the shared or in a page css', () => {
    const css = '.logo{animation:glow 3s infinite}@keyframes glow{50%{opacity:.8}}';
    expect(issuesOf(withCss(css))).toContain('prefers-reduced-motion');
    const site = siteFor(['index']);
    site.pages[0].css = '@keyframes x{to{opacity:0}}';
    expect(issuesOf(site)).toContain('prefers-reduced-motion');
  });

  it('does not mind a css without animations', () => {
    expect(issuesOf(withCss('.logo{letter-spacing:.1em;text-shadow:1px 1px 0 #999}'))).toBe('');
  });
});

describe('links between pages', () => {
  it('reports a link to a page that does not exist, and says which file names are valid', () => {
    const site = withPage(siteFor(['index', 'about']), 'about', (p) => ({
      html: p.html.replace('</main>', '<p><a href="pricing.html">Prices</a></p></main>'),
    }));
    const text = issuesOf(site);
    expect(text).toContain('Page "about" has links that do not lead to a page');
    expect(text).toContain('pricing.html');
    expect(text).toContain('index.html, about.html');
  });

  it('reports links that are not page files at all ("/", "about", "../x.html"), but not external links', () => {
    const site = withPage(siteFor(['index', 'about']), 'index', (p) => ({
      html: p.html.replace(
        '</main>',
        '<a href="/">a</a><a href="about">b</a><a href="../x.html">c</a><a href="https://example.com">ok</a><a href="mailto:a@b.c">ok</a><a href="tel:123">ok</a><a href="#top">ok</a></main>'
      ),
    }));
    const text = issuesOf(site);
    expect(text).toContain('/, about, ../x.html');
    expect(text).not.toContain('example.com');
    expect(text).not.toContain('mailto');
  });

  it('checks #section links, on the same page and on another page', () => {
    const base = siteFor(['index', 'about']);
    const good = withPage(withPage(base, 'index', (p) => ({
      html: p.html.replace('</main>', '<a href="#prices">p</a><section id="prices"></section><a href="about.html#team">t</a></main>'),
    })), 'about', (p) => ({ html: p.html.replace('</main>', '<section id="team"></section></main>') }));
    expect(checkSite(good).passed).toBe(true);

    const bad = withPage(base, 'index', (p) => ({
      html: p.html.replace('</main>', '<a href="#nowhere">x</a><a href="about.html#nothing">y</a></main>'),
    }));
    const text = issuesOf(bad);
    expect(text).toContain('sections that do not exist');
    expect(text).toContain('#nowhere');
    expect(text).toContain('about.html#nothing');
  });

  it('also checks the links of a one-page site', () => {
    const site = withPage(siteFor(['index']), 'index', (p) => ({ html: p.html.replace('</main>', '<a href="#gone">x</a></main>') }));
    expect(issuesOf(site)).toContain('#gone');
  });
});

describe('reachability, menu and footer', () => {
  it('reports a page the home page does not link to', () => {
    const plan = planFor(['index', 'about', 'contact']);
    const site = siteFor(['index', 'about', 'contact']);
    // a header without the contact link on every page: contact is no longer reachable
    const header = headerFor(['index', 'about']);
    const noContact = {
      ...site,
      pages: site.pages.map((p) => ({ ...p, html: assemblePage({ ...plan, header }, p, mainFor(p.slug)) })),
    };
    expect(issuesOf(noContact)).toContain('The home page does not link to: contact');
  });

  it('reports a menu that differs from the home page, and ignores the aria-current marker', () => {
    const site = siteFor(['index', 'about']);
    expect(checkSite(site).passed).toBe(true); // the marker alone is not a difference

    const changed = withPage(site, 'about', (p) => ({ html: p.html.replace('About us</a>', 'About</a>') }));
    expect(issuesOf(changed)).toContain('main menu (<nav>) on about is different from the one on the home page');
  });

  it('reports pages without a menu or without a footer', () => {
    const site = siteFor(['index', 'about']);
    const noNav = withPage(site, 'about', (p) => ({ html: p.html.replace(/<nav[\s\S]*<\/nav>/, '') }));
    expect(issuesOf(noNav)).toContain('These pages have no main menu (<nav>): about');

    const noFooter = withPage(site, 'about', (p) => ({ html: p.html.replace(FOOTER, '') }));
    expect(issuesOf(noFooter)).toContain('These pages have no footer: about');

    const otherFooter = withPage(site, 'about', (p) => ({ html: p.html.replace(FOOTER, '<footer>Different</footer>') }));
    expect(issuesOf(otherFooter)).toContain('The footer on about is different');
  });
});

describe('titles', () => {
  it('reports an empty title and a title shared by two pages', () => {
    const site = siteFor(['index', 'about', 'contact']);
    const empty = withPage(site, 'about', () => ({ title: '  ' }));
    expect(issuesOf(empty)).toContain('These pages have no title: about');

    const same = withPage(withPage(site, 'about', () => ({ title: 'Same' })), 'contact', () => ({ title: 'same' }));
    expect(issuesOf(same)).toContain('share the same title');
  });
});

describe('pages that are copies of each other', () => {
  const long =
    'our friendly team welcomes every visitor and offers a wide range of classes for all levels every single week of the year with great care';

  it('reports two pages with the same content under different headings', () => {
    const site = siteFor(['index', 'about']);
    const copied = {
      ...site,
      pages: site.pages.map((p) => ({
        ...p,
        html: assemblePage(planFor(['index', 'about']), p, `<h1>${p.slug} heading</h1><p>${long}</p>`),
      })),
    };
    expect(issuesOf(copied)).toContain('almost the same content: index and about');
  });

  it('does not flag pages that merely share a few words, or very short pages', () => {
    expect(checkSite(siteFor(['index', 'about', 'contact', 'services', 'gallery'])).passed).toBe(true);
    const site = siteFor(['index', 'about']);
    const short = {
      ...site,
      pages: site.pages.map((p) => ({ ...p, html: assemblePage(planFor(['index', 'about']), p, '<h1>Hi</h1><p>Short.</p>') })),
    };
    expect(issuesOf(short)).not.toContain('almost the same content');
  });
});
