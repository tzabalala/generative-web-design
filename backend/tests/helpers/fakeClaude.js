import { jest } from '@jest/globals';
import { assemblePage } from '../../src/site.js';

// A stand-in for the Anthropic client used by the backend tests. It answers each of the four
// kinds of call the backend makes (plan, page, edit, design), decided from the system prompt,
// with a small site that passes every check, so a test only has to override what it is about.

export const SHARED_CSS =
  ':root{--ink:#111;--bg:#fff}body{color:var(--ink);background:var(--bg);font-size:1rem}.nav{display:flex;gap:1rem}' +
  '@media (max-width:600px){body{font-size:0.9rem}}@media (min-width:601px){body{font-size:1.1rem}}';

const TITLES = { index: 'Home', about: 'About us', contact: 'Contact', services: 'Services', gallery: 'Gallery' };
const titleOf = (slug) => TITLES[slug] ?? slug;

export const headerFor = (slugs) =>
  `<header><a href="index.html">Test Studio</a><nav aria-label="Main" class="nav">${slugs
    .map((s) => `<a href="${s}.html">${titleOf(s)}</a>`)
    .join('')}</nav></header>`;

export const FOOTER = '<footer><p>Test Studio, 1 Example Street</p></footer>';

// Words that are different for every page, so the pages are not "copies" of each other.
const WORDS = {
  index: 'welcome visitors discover classes schedule beginners mornings evenings friendly teachers relaxed atmosphere sunlit studio',
  about: 'founded decade ago passionate instructors certified training philosophy community values mindful movement history story',
  contact: 'address street phone email opening hours monday friday saturday reach questions enquiry booking directions parking',
  services: 'pricing packages membership drop class private lessons workshops retreats corporate groups discount offers monthly',
  gallery: 'photographs moments events celebrations garden rooftop sessions retreat sunrise equipment mats props candid',
};

export const mainFor = (slug) =>
  `<h1>${titleOf(slug)} page</h1><section><h2>${titleOf(slug)} details</h2><p>${WORDS[slug] ?? `content for ${slug} with several unique words ${slug} ${slug.length} alpha beta gamma delta epsilon zeta eta theta iota kappa`}</p>` +
  `<img src="${slug}.jpg" alt="A photo for the ${slug} page"></section>`;

export function planFor(slugs = ['index']) {
  return {
    pages: slugs.map((slug) => ({
      slug,
      title: `${titleOf(slug)} - Test Studio`,
      purpose: `What the ${slug} page is for.`,
      layout: 'hero then sections',
      anchors: [],
    })),
    header: headerFor(slugs),
    footer: FOOTER,
    css: SHARED_CSS,
  };
}

export const reply = (obj, usage = { input_tokens: 10, output_tokens: 20 }) => ({
  content: [{ text: JSON.stringify(obj).slice(1) }], // the backend re-adds the "{" prefill
  usage,
});

export const rawReply = (text, usage = { input_tokens: 10, output_tokens: 20 }) => ({
  content: [{ text }],
  usage,
});

export const kindOf = (args) => {
  const system = String(args.system);
  if (system.includes('design consultant')) return 'design';
  if (system.includes('You do NOT write the pages themselves')) return 'plan';
  if (system.includes('writing ONE page')) return 'page';
  if (system.includes('editing an existing website')) return 'edit';
  return 'unknown';
};

export const userText = (args) => String(args.messages.find((m) => m.role === 'user').content);

// The page the backend asks for in a page call ('Write the page "about" now.')
export const requestedSlug = (args) => userText(args).match(/Write the page "([^"]+)" now/)?.[1];

export const DESIGN = { rationale: { summary: 'A calm studio site' }, placeholders: [] };

// handlers: optional overrides per kind: (args, callNumberForThatKind) => reply
// slugs: the pages of the site this fake "plans"
export function fakeClaude({ slugs = ['index'], handlers = {} } = {}) {
  const counts = { plan: 0, page: 0, edit: 0, design: 0, unknown: 0 };
  const create = jest.fn(async (args) => {
    const kind = kindOf(args);
    counts[kind] += 1;
    if (handlers[kind]) return handlers[kind](args, counts[kind]);
    if (kind === 'plan') return reply(planFor(slugs));
    if (kind === 'page') return reply({ html: mainFor(requestedSlug(args)), css: '' });
    if (kind === 'design') return reply(DESIGN);
    if (kind === 'edit') return reply({ css: null, pages: [], removePages: [] });
    throw new Error('unexpected call');
  });
  return { messages: { create }, counts };
}

// A complete valid site, as the backend stores it (header + main + footer around each page)
export function siteFor(slugs = ['index']) {
  const plan = planFor(slugs);
  return {
    css: SHARED_CSS,
    pages: plan.pages.map((p) => ({
      slug: p.slug,
      title: p.title,
      html: assemblePage(plan, p, mainFor(p.slug)),
      css: '',
    })),
  };
}
