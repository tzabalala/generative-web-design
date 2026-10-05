import { describe, it, expect } from 'vitest';
import { rewritePageLinks, previewDocument, slugFromHash } from '../src/sitePreview.js';

const BASE = 'http://localhost:5173/?p=P01';
const SLUGS = ['index', 'about', 'our-team'];

describe('rewritePageLinks', () => {
  it('turns a link to a page of the site into a top-window link to #page=slug, keeping the query string', () => {
    const out = rewritePageLinks('<a href="about.html">About</a>', SLUGS, BASE);
    expect(out).toBe(`<a href="${BASE}#page=about" target="_top">About</a>`);
  });

  it('handles ./, #fragments, other attributes, single quotes and upper case', () => {
    expect(rewritePageLinks('<a class="x" href=\'./our-team.html#bio\' rel="a">T</a>', SLUGS, BASE)).toBe(
      `<a class="x" rel="a" href="${BASE}#page=our-team" target="_top">T</a>`
    );
    expect(rewritePageLinks('<A HREF="About.HTML">x</A>', SLUGS, BASE)).toContain('#page=about');
  });

  it('replaces an old target, so the link always goes to the top window', () => {
    const out = rewritePageLinks('<a href="about.html" target="_blank">x</a>', SLUGS, BASE);
    expect(out.match(/target=/g)).toHaveLength(1);
    expect(out).toContain('target="_top"');
  });

  it('neutralises a link to a page that does not exist (it would load the app inside the frame)', () => {
    expect(rewritePageLinks('<a href="missing.html">x</a>', SLUGS, BASE)).toBe('<a href="#">x</a>');
  });

  it('leaves everything else alone: external links, mailto, section links, anchors without href', () => {
    for (const html of [
      '<a href="https://example.com/about.html">x</a>',
      '<a href="mailto:a@b.c">x</a>',
      '<a href="#contact">x</a>',
      '<a name="top">x</a>',
      '<link href="about.html">',
      '<p>about.html</p>',
    ]) {
      expect(rewritePageLinks(html, SLUGS, BASE)).toBe(html);
    }
  });

  it('does not treat data-href like href', () => {
    const html = '<a data-href="about.html" href="https://x.y">x</a>';
    expect(rewritePageLinks(html, SLUGS, BASE)).toBe(html);
  });

  it('escapes the base so a quote in the address cannot break out of the attribute', () => {
    const out = rewritePageLinks('<a href="about.html">x</a>', SLUGS, 'http://h/?q="x');
    expect(out).toContain('http://h/?q=&quot;x#page=about');
  });
});

describe('previewDocument', () => {
  const pages = [
    { slug: 'index', title: 'Home & Co', html: '<h1>Home</h1>', css: '.h{}' },
    { slug: 'about', title: 'About', html: '<h1>About</h1><a href="index.html">Home</a>', css: '' },
  ];

  it('builds a full document for the chosen page, with shared css first and the page css after it', () => {
    const doc = previewDocument({ pages, css: 'SHARED{}', slug: 'index', base: BASE });
    expect(doc).toContain('<h1>Home</h1>');
    expect(doc).not.toContain('<h1>About</h1>');
    expect(doc.indexOf('SHARED{}')).toBeLessThan(doc.indexOf('.h{}'));
    expect(doc).toContain('<title>Home &amp; Co</title>');
  });

  it('rewrites the links of the chosen page only against the pages that exist', () => {
    const doc = previewDocument({ pages, css: '', slug: 'about', base: BASE });
    expect(doc).toContain(`${BASE}#page=index`);
  });

  it('shows the first page when the slug is unknown, and nothing when there are no pages', () => {
    expect(previewDocument({ pages, css: '', slug: 'nope', base: BASE })).toContain('<h1>Home</h1>');
    expect(previewDocument({ pages: [], css: '', slug: 'x', base: BASE })).toBe('');
  });
});

describe('slugFromHash', () => {
  it('reads #page=slug for existing pages only', () => {
    expect(slugFromHash('#page=about', SLUGS)).toBe('about');
    expect(slugFromHash('#page=nope', SLUGS)).toBeNull();
    expect(slugFromHash('#contact', SLUGS)).toBeNull();
    expect(slugFromHash('', SLUGS)).toBeNull();
    expect(slugFromHash(undefined, SLUGS)).toBeNull();
  });
});
