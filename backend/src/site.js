import { ClaudeOutputError, PageLimitError } from './claudeErrors.js';

// A generated website is a SITE: one shared stylesheet plus 1 to MAX_PAGES pages.
//
//   site = { css: "<shared CSS>", pages: [ { slug, title, html, css } ] }
//
//   slug  - the file name without ".html" ("index" is always the home page)
//   title - the text of the page's <title>
//   html  - the whole <body> content of the page: header, <main> and footer
//   css   - rules used only by this page (the shared CSS holds everything common)
//
// Everything that comes back from Claude is untrusted: it is cleaned and checked here before
// it reaches the validation loop, the database or the browser.

export const MAX_PAGES = 5;
export const HOME_SLUG = 'index';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 40;
const MAX_TITLE_LENGTH = 120;

export const isValidSlug = (s) => typeof s === 'string' && s.length <= MAX_SLUG_LENGTH && SLUG_RE.test(s);

const str = (v) => (typeof v === 'string' ? v : '');
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

function fail(message, raw) {
  throw new ClaudeOutputError(message, raw);
}

// ---- the plan (first call of a generation) -------------------------------------------------

// plan = { css, header, footer, pages: [ { slug, title, purpose, layout, anchors } ] }
export function normalizePlan(parsed) {
  if (!isObject(parsed)) fail('Claude site plan is not an object', parsed);
  if (typeof parsed.css !== 'string' || !parsed.css.trim()) fail('Claude site plan is missing the shared css', parsed);
  if (typeof parsed.header !== 'string' || !parsed.header.trim()) fail('Claude site plan is missing the header', parsed);
  if (typeof parsed.footer !== 'string' || !parsed.footer.trim()) fail('Claude site plan is missing the footer', parsed);
  if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) fail('Claude site plan lists no pages', parsed);

  const used = new Set();
  const pages = [];
  for (const raw of parsed.pages.slice(0, MAX_PAGES)) {
    if (!isObject(raw)) continue;
    let slug = str(raw.slug).trim().toLowerCase();
    if (!isValidSlug(slug) || used.has(slug)) slug = `page-${pages.length + 1}`;
    used.add(slug);
    pages.push({
      slug,
      title: str(raw.title).trim().slice(0, MAX_TITLE_LENGTH),
      purpose: str(raw.purpose).trim(),
      layout: str(raw.layout).trim(),
      anchors: (Array.isArray(raw.anchors) ? raw.anchors : []).filter(isValidSlug).slice(0, 12),
    });
  }
  if (pages.length === 0) fail('Claude site plan lists no usable pages', parsed);

  // The home page is always "index". If the plan did not name one, the first page becomes it.
  if (!used.has(HOME_SLUG)) pages[0].slug = HOME_SLUG;
  else pages.sort((a, b) => (a.slug === HOME_SLUG ? -1 : b.slug === HOME_SLUG ? 1 : 0));

  for (const p of pages) if (!p.title) p.title = p.slug === HOME_SLUG ? 'Home' : p.slug;

  return { css: parsed.css, header: parsed.header, footer: parsed.footer, pages };
}

// ---- one page (the following calls of a generation) ----------------------------------------

export function normalizePageReply(parsed) {
  if (!isObject(parsed) || typeof parsed.html !== 'string' || !parsed.html.trim()) {
    fail('Claude page reply is missing the html field', parsed);
  }
  return { html: parsed.html, css: str(parsed.css) };
}

// The server, not Claude, puts the shared header and footer around every page, so the menu
// is identical on all of them. The page's own link gets aria-current="page".
// Only links inside the <nav> are marked (the site name in the header also links home, but it
// is not a menu entry).
export function markCurrent(headerHtml, slug) {
  const link = new RegExp(`<a\\b([^>]*?)\\bhref=(["'])(?:\\./)?${slug}\\.html\\2([^>]*)>`, 'gi');
  return headerHtml.replace(/<nav\b[\s\S]*?<\/nav>/gi, (nav) =>
    nav.replace(link, (whole, before, quote, after) =>
      /aria-current\s*=/.test(whole) ? whole : `<a${before}href=${quote}${slug}.html${quote}${after} aria-current="page">`
    )
  );
}

// Claude is told to write only what goes INSIDE <main>; if it wrapped it anyway, unwrap it.
function unwrapMain(html) {
  const trimmed = html.trim();
  const m = trimmed.match(/^<main\b[^>]*>([\s\S]*)<\/main>$/i);
  return m ? m[1].trim() : trimmed;
}

export function assemblePage(plan, page, mainHtml) {
  return [
    markCurrent(plan.header.trim(), page.slug),
    `<main id="main">`,
    unwrapMain(mainHtml),
    `</main>`,
    plan.footer.trim(),
  ].join('\n');
}

// ---- edits (refine and fix): Claude returns only what changed --------------------------------

// delta = { css: string | null, cssEdits: [ { find, replace } ],
//          htmlEdits: [ { find, replace, slug? } ],
//          pages: [ { slug, title?, html, css? } ], removePages: [slug] }
//   css      - a COMPLETE new shared stylesheet (null = unchanged)
//   cssEdits - small exact replacements inside the shared stylesheet (e.g. one colour in :root),
//              much cheaper and more precise than rewriting it all
//   htmlEdits - the same for the html of the pages. With a slug: that page only. Without: EVERY
//              page that was not returned in full (those are used exactly as returned), which
//              is how something repeated on all pages (the menu, the footer, a phone number)
//              is changed without rewriting every page
export function normalizeDelta(parsed) {
  if (!isObject(parsed)) fail('Claude edit is not an object', parsed);

  const pages = [];
  for (const raw of Array.isArray(parsed.pages) ? parsed.pages : []) {
    if (!isObject(raw)) continue;
    const slug = str(raw.slug).trim().toLowerCase();
    if (!isValidSlug(slug)) fail(`Claude edit uses an invalid page name: "${slug}"`, parsed);
    if (typeof raw.html !== 'string' || !raw.html.trim()) fail(`Claude edit page "${slug}" has no html`, parsed);
    pages.push({
      slug,
      title: typeof raw.title === 'string' ? raw.title.trim().slice(0, MAX_TITLE_LENGTH) : undefined,
      html: raw.html,
      css: typeof raw.css === 'string' ? raw.css : undefined,
    });
  }

  const removePages = (Array.isArray(parsed.removePages) ? parsed.removePages : []).filter(isValidSlug);
  const css = typeof parsed.css === 'string' && parsed.css.trim() ? parsed.css : null;
  const cssEdits = (Array.isArray(parsed.cssEdits) ? parsed.cssEdits : [])
    .filter((e) => isObject(e) && typeof e.find === 'string' && e.find !== '' && typeof e.replace === 'string')
    .map((e) => ({ find: e.find, replace: e.replace }));
  const htmlEdits = (Array.isArray(parsed.htmlEdits) ? parsed.htmlEdits : [])
    .filter((e) => isObject(e) && typeof e.find === 'string' && e.find !== '' && typeof e.replace === 'string')
    .map((e) => ({ find: e.find, replace: e.replace, slug: isValidSlug(e.slug) ? e.slug : undefined }));
  return { css, cssEdits, htmlEdits, pages, removePages };
}

// Returns a NEW site with the delta applied (the input is never modified).
export function applyDelta(site, delta) {
  const bySlug = new Map(site.pages.map((p) => [p.slug, { ...p }]));

  for (const slug of delta.removePages) if (slug !== HOME_SLUG) bySlug.delete(slug);

  for (const p of delta.pages) {
    const old = bySlug.get(p.slug);
    bySlug.set(p.slug, {
      slug: p.slug,
      title: p.title || old?.title || p.slug,
      html: p.html,
      // A page that is returned keeps its old page CSS unless the reply sets it.
      css: p.css !== undefined ? p.css : old?.css ?? '',
    });
  }

  // Exact replacements in the html. A page returned in full is used exactly as returned, so
  // an edit without a slug skips it (it already contains the change); an edit that names the
  // page applies to it anyway.
  const returnedInFull = new Set(delta.pages.map((p) => p.slug));
  for (const { find, replace, slug } of delta.htmlEdits ?? []) {
    for (const page of bySlug.values()) {
      if (slug ? page.slug !== slug : returnedInFull.has(page.slug)) continue;
      page.html = page.html.split(find).join(replace);
    }
  }

  const pages = [...bySlug.values()];
  if (!bySlug.has(HOME_SLUG)) fail('Claude edit removed the home page ("index")', delta);
  if (pages.length > MAX_PAGES) {
    throw new PageLimitError(`That change would make the website longer than ${MAX_PAGES} pages, which is the limit.`, delta);
  }
  pages.sort((a, b) => (a.slug === HOME_SLUG ? -1 : b.slug === HOME_SLUG ? 1 : 0));

  // A replacement whose text is not found changes nothing (the next check will say so).
  let css = delta.css ?? site.css;
  for (const { find, replace } of delta.cssEdits ?? []) css = css.split(find).join(replace);

  return { css, pages };
}

// ---- small helpers --------------------------------------------------------------------------

// The CSS a single page is shown and checked with: the shared rules plus its own.
export const pageCss = (site, page) => (page.css ? `${site.css}\n${page.css}` : site.css);

// All the text of a site in one string, so "does this snippet exist verbatim?" can be answered.
export const siteHaystack = (site) =>
  `${site.pages.map((p) => p.html).join('\n')}\n${site.css}\n${site.pages.map((p) => p.css ?? '').join('\n')}`;

// Whitespace-insensitive identity of a site (used for cache keys).
export const siteFingerprint = (site) =>
  JSON.stringify({ css: site.css, pages: site.pages.map((p) => [p.slug, p.title, p.html, p.css ?? '']) })
    .replace(/\s+/g, ' ');

// Pages stored by the first, single-page version of the tool have only "html" and "css".
export function pagesFromLegacy(html, css) {
  return { css: css ?? '', pages: [{ slug: HOME_SLUG, title: '', html: html ?? '', css: '' }] };
}
