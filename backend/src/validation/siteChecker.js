import { HOME_SLUG } from '../site.js';

// Checks that only make sense for a site of SEVERAL pages. axe-core and the layout check
// judge one page at a time; this one judges how the pages fit together:
//
//   1. every link to another page of the site points to a page that exists (and a
//      "#section" link points to a section that exists);
//   2. every page can be reached from the home page;
//   3. the main menu and the footer are the same on every page;
//   4. every page has its own, different title;
//   5. the pages are not copies of each other (the content of each page must follow from
//      what that page presents, not just carry a different heading).
//
// Pure text analysis: no browser, no API call. Like every other check, each issue is sent
// back to Claude as a "fix this" request, so it only reports objective, verifiable problems.
const MIN_WORDS_FOR_SIMILARITY = 15;
const SIMILARITY_THRESHOLD = 0.5; // 3-word-shingle overlap; different pages score about 0.0-0.1
const MAX_LISTED = 6;

const stripTags = (s) => s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ');
const collapse = (s) => s.replace(/\s+/g, ' ').trim();

function anchorsIn(html) {
  const out = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[2].trim());
  return out;
}

function idsIn(html) {
  const out = new Set();
  const re = /\b(?:id|name)\s*=\s*(["'])(.*?)\1/gi;
  let m;
  while ((m = re.exec(html))) out.add(m[2]);
  return out;
}

const isExternal = (href) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href); // https:, mailto:, tel:, //host

// The site's own <tag ...>...</tag> (the shared menu or footer), with the "current page"
// marker removed so that the menu of the page you are on does not count as a difference.
// Only what is OUTSIDE <main> counts: the server puts the shared header and footer around
// <main>, and the content may legitimately hold its own <footer> or <nav>. Taking the first
// one anywhere was a false alarm found by the Sonnet 5 benchmark (2026-10-18): a testimonial
// written as <blockquote>...<footer>- Maria Chen</footer></blockquote> on the home page was
// compared with the site footer of the other pages, the site was reported as failing, and the
// loop spent all three repairs on a problem that did not exist (3 of the 5 Sonnet failures).
export function blockOf(html, tag) {
  const outsideMain = html.replace(/<main\b[\s\S]*<\/main>/i, ' ');
  const m = outsideMain.match(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'i'));
  if (!m) return null;
  return collapse(m[0].replace(/\s*aria-current\s*=\s*(["'])[^"']*\1/gi, ''));
}

function mainText(html) {
  const m = html.match(/<main\b[^>]*>([\s\S]*)<\/main>/i);
  return collapse(stripTags(m ? m[1] : html)).toLowerCase();
}

function shingles(text) {
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length < MIN_WORDS_FOR_SIMILARITY) return null;
  const set = new Set();
  for (let i = 0; i + 2 < words.length; i += 1) set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return set;
}

function jaccard(a, b) {
  let shared = 0;
  for (const x of a) if (b.has(x)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

const listed = (items) =>
  items.length > MAX_LISTED ? `${items.slice(0, MAX_LISTED).join(', ')} and ${items.length - MAX_LISTED} more` : items.join(', ');

// Motion must be switchable off: WCAG 2.2.2 (Pause, Stop, Hide) and 2.3.3 (Animation from
// Interactions) are the reasons for the prefers-reduced-motion rule. The text logo is the most
// likely place for an animation, but the rule applies to all the css of the site.
function motionIssues(site) {
  const all = [site.css, ...site.pages.map((p) => p.css ?? '')].join('\n');
  const animates = /@keyframes|animation(?:-name)?\s*:/i.test(all);
  return animates && !/prefers-reduced-motion/i.test(all)
    ? [
        'The css uses an animation but has no @media (prefers-reduced-motion: reduce) rule. Add one that switches every animation off (animation: none), for visitors who are sensitive to motion.',
      ]
    : [];
}

export function checkSite(site) {
  const issues = [...motionIssues(site)];
  const { pages } = site;
  const slugs = new Set(pages.map((p) => p.slug));
  const idsBySlug = new Map(pages.map((p) => [p.slug, idsIn(p.html)]));

  // 1. links
  for (const page of pages) {
    const broken = new Set();
    const missingSections = new Set();
    for (const href of anchorsIn(page.html)) {
      if (!href || href === '#' || href.toLowerCase() === '#top' || isExternal(href)) continue;

      if (href.startsWith('#')) {
        if (!idsBySlug.get(page.slug).has(href.slice(1))) missingSections.add(href);
        continue;
      }

      const m = href.match(/^(?:\.\/)?([a-z0-9-]+)\.html(?:#(.*))?$/i);
      if (!m) {
        broken.add(href); // "/", "about", "about/", "../x.html" ... not a page file of this site
        continue;
      }
      const target = m[1].toLowerCase();
      if (!slugs.has(target)) {
        broken.add(href);
      } else if (m[2] && !idsBySlug.get(target).has(m[2])) {
        missingSections.add(href);
      }
    }
    if (broken.size) {
      issues.push(
        `Page "${page.slug}" has links that do not lead to a page of this site: ${listed([...broken])}. ` +
          `Link to the pages by file name, exactly: ${[...slugs].map((s) => `${s}.html`).join(', ')}.`
      );
    }
    if (missingSections.size) {
      issues.push(
        `Page "${page.slug}" links to sections that do not exist: ${listed([...missingSections])}. Add an element with that id, or fix the link.`
      );
    }
  }

  if (pages.length > 1) {
    // 2. reachability from the home page
    const home = pages.find((p) => p.slug === HOME_SLUG);
    const fromHome = new Set(
      anchorsIn(home.html)
        .map((h) => h.match(/^(?:\.\/)?([a-z0-9-]+)\.html(?:#.*)?$/i)?.[1]?.toLowerCase())
        .filter(Boolean)
    );
    const unreachable = pages.filter((p) => p.slug !== HOME_SLUG && !fromHome.has(p.slug)).map((p) => p.slug);
    if (unreachable.length) {
      issues.push(`The home page does not link to: ${listed(unreachable)}. Every page must be reachable from the main menu.`);
    }

    // 3. one menu and one footer for the whole site
    for (const tag of ['nav', 'footer']) {
      const reference = blockOf(home.html, tag);
      const label = tag === 'nav' ? 'main menu (<nav>)' : 'footer';
      const missing = pages.filter((p) => !blockOf(p.html, tag)).map((p) => p.slug);
      if (missing.length) {
        issues.push(`These pages have no ${label}: ${listed(missing)}. Every page needs the same ${label}.`);
        continue;
      }
      const different = pages.filter((p) => p.slug !== HOME_SLUG && blockOf(p.html, tag) !== reference).map((p) => p.slug);
      if (different.length) {
        issues.push(
          `The ${label} on ${listed(different)} is different from the one on the home page. ` +
            `It must be identical on every page (only aria-current="page" may differ).`
        );
      }
    }

    // 4. titles
    const emptyTitle = pages.filter((p) => !p.title.trim()).map((p) => p.slug);
    if (emptyTitle.length) issues.push(`These pages have no title: ${listed(emptyTitle)}.`);
    const seen = new Map();
    for (const p of pages) {
      const key = p.title.trim().toLowerCase();
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(p.slug);
    }
    for (const [title, group] of seen) {
      if (group.length > 1) issues.push(`Pages ${listed(group)} share the same title ("${title}"). Every page needs its own title.`);
    }

    // 5. pages that are copies of each other
    const fingerprints = pages.map((p) => ({ slug: p.slug, set: shingles(mainText(p.html)) }));
    const copies = [];
    for (let i = 0; i < fingerprints.length; i += 1) {
      for (let j = i + 1; j < fingerprints.length; j += 1) {
        const a = fingerprints[i];
        const b = fingerprints[j];
        if (a.set && b.set && jaccard(a.set, b.set) >= SIMILARITY_THRESHOLD) copies.push(`${a.slug} and ${b.slug}`);
      }
    }
    if (copies.length) {
      issues.push(
        `These pages have almost the same content: ${listed(copies)}. Each page must present its own content, ` +
          `with a structure that suits it, not a copy of another page with a different heading.`
      );
    }
  }

  return { passed: issues.length === 0, issues };
}
