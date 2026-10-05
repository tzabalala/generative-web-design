import http from 'http';
import { readFileSync } from 'fs';

// A tiny stand-in for the Anthropic API, used ONLY by the end-to-end tests so they cost
// nothing and are repeatable. The real backend talks to it exactly as it would talk to
// Claude (the SDK is pointed here with ANTHROPIC_BASE_URL). The design rationale and the
// replacement guide are real Claude output captured earlier (fixtures/yoga.json); the small
// website is written below so the multi-page paths (plan, one call per page, edits that
// touch one page, a new page, the shared stylesheet) really run.
//
// What it answers, decided from the request the backend sends:
//   plan    -> 3 pages (index, about, contact), or ONE page when the request says "one-page".
//              The shared css has a REAL colour-contrast problem (an accent colour that is
//              too light for the background), so the validation loop has something to fix.
//              A request containing CLEAN gets an accessible colour from the start;
//              BREAK gets text that is not JSON (an API failure).
//   page    -> the content of the page that was asked for
//   fix     -> small "cssEdits" for a contrast problem; for a layout problem the page
//              without the box that is too wide
//   refine  -> a change to the page the user is looking at (or the page the instruction
//              names). WIDE adds a 900px-wide box to the home page (a mobile layout bug);
//              ADDPAGE adds a gallery page and puts it in the menu of every page
//   design  -> the stored design rationale and replacement guide
const fixture = JSON.parse(readFileSync(new URL('./fixtures/yoga.json', import.meta.url), 'utf8'));

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SITE_NAME = 'Serenity Yoga Studio';
const BAD_ACCENT = '#d4422f'; // 4.25:1 on the page background: just under the 4.5:1 that is required
const GOOD_ACCENT = '#9b2c1c';

const TITLES = { index: 'Home', about: 'About', contact: 'Contact', gallery: 'Gallery' };

const css = (accent) =>
  `:root{--ink:#1c2b24;--bg:#f9f7f4;--accent:${accent}}` +
  'body{margin:0;font-family:Georgia,serif;color:var(--ink);background:var(--bg);font-size:1rem;line-height:1.6}' +
  '.container{max-width:68rem;margin:0 auto;padding:0 1.25rem}' +
  'header .container{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:0.75rem}' +
  'nav{display:flex;flex-wrap:wrap;gap:0.5rem}nav a{display:inline-block;padding:0.6rem 0.9rem;color:var(--ink)}' +
  'nav a[aria-current="page"]{font-weight:700;text-decoration:underline}' +
  '.accent{color:var(--accent);font-weight:700}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:1rem}' +
  'footer{background:#1c2b24;color:#fff;padding:1.5rem 0}' +
  '@media (max-width:600px){body{font-size:0.95rem}}@media (min-width:601px){body{font-size:1.1rem}}';

const navLinks = (slugs) => slugs.map((s) => `<a href="${s}.html">${TITLES[s]}</a>`).join('');
const header = (slugs) =>
  `<header><div class="container"><a href="index.html">${SITE_NAME}</a><nav aria-label="Main">${navLinks(slugs)}</nav></div></header>`;
const footer = `<footer><div class="container"><p>${SITE_NAME}, 428 Oak Street, Portland</p></div></footer>`;

// Content of each page. They share almost no words, so they are clearly not copies.
const MAIN = {
  index: () =>
    `<section><div class="container"><h1>Find Your Inner Peace</h1><p>Morning flow classes for every level, taught in a quiet sunlit room by friendly teachers.</p>` +
    `<p class="accent">First class free this month</p><div class="grid"><article><h2>Morning Flow</h2><p>Gentle stretching and breathing to start the day.</p></article>` +
    `<article><h2>Evening Calm</h2><p>Slow restorative poses to release the tension of the day.</p></article></div>` +
    `<img src="studio.jpg" alt="The sunlit yoga room with rows of mats"></div></section>`,
  about: () =>
    `<section><div class="container"><h1>About our teachers</h1><p>Founded ten years ago by Sarah Mitchell, a certified instructor with a passion for mindful movement. ` +
    `Every teacher completes advanced training and keeps learning with workshops each year.</p><h2>Our philosophy</h2><p>Practice at your own pace, without competition or judgement.</p></div></section>`,
  contact: () =>
    `<section><div class="container"><h1>Visit or call us</h1><p>Find the studio on Oak Street, five minutes from the tram stop, with free parking behind the building.</p>` +
    `<form><label for="name">Your name</label><input id="name" type="text"><label for="msg">Question</label><textarea id="msg"></textarea>` +
    `<button type="submit" style="min-height:44px;min-width:120px">Send question</button></form></div></section>`,
  gallery: () =>
    `<section><div class="container"><h1>Photographs from the studio</h1><p>Moments from retreats, sunrise sessions and rooftop celebrations over the years.</p>` +
    `<div class="grid"><img src="g1.jpg" alt="Class on the rooftop at sunrise"><img src="g2.jpg" alt="Mats and props ready for a workshop"></div></div></section>`,
};

const mainOf = (slug, wide = false) => {
  const html = MAIN[slug]();
  return wide ? html.replace('</section>', '<div class="e2e-wide">x</div></section>') : html;
};

function planFor(request) {
  const slugs = /one-page/i.test(request) ? ['index'] : ['index', 'about', 'contact'];
  const accent = /CLEAN/.test(request) ? GOOD_ACCENT : BAD_ACCENT;
  return {
    pages: slugs.map((slug) => ({
      slug,
      title: `${TITLES[slug]} - ${SITE_NAME}`,
      purpose: `What the ${slug} page is for.`,
      layout: 'sections',
      anchors: [],
    })),
    header: header(slugs),
    footer,
    css: css(accent),
  };
}

// ---- reading what the backend sends ---------------------------------------------------------

function between(text, start, end) {
  const from = text.indexOf(start);
  if (from < 0) return '';
  const rest = text.slice(from + start.length);
  const to = end ? rest.indexOf(end) : -1;
  return to < 0 ? rest : rest.slice(0, to);
}

// The site as serialised by the backend (promptEngineering.js: serializeSite)
function parseSite(user) {
  const pages = [];
  const re =
    /=== PAGE slug="([^"]+)" title="([^"]*)" ===\n--- page html ---\n([\s\S]*?)\n--- page css ---\n([\s\S]*?)(?=\n\n=== PAGE |\n+The website currently has|\n+The user is currently|\n+Apply this change|\n+Fix ONLY|$)/g;
  let m;
  while ((m = re.exec(user))) pages.push({ slug: m[1], title: m[2], html: m[3], css: m[4].trim() });
  return { css: between(user, '=== SHARED CSS ===\n', '\n\n=== PAGE'), pages };
}

function decide(system, user) {
  if (system.includes('design consultant')) {
    return { kind: 'design', payload: { rationale: fixture.rationale, placeholders: fixture.placeholders } };
  }

  if (system.includes('You do NOT write the pages themselves')) {
    if (user.includes('BREAK')) return { kind: 'plan', payload: 'I am sorry, I cannot produce that.' };
    return { kind: 'plan', payload: planFor(user) };
  }

  if (system.includes('writing ONE page')) {
    const slug = (user.match(/Write the page "([^"]+)" now/) || [, 'index'])[1];
    return { kind: 'page', payload: { html: mainOf(slug), css: '' } };
  }

  if (user.startsWith('The following website failed')) {
    const issues = between(user, 'failed these automated checks:\n', '\n\n=== SHARED CSS');
    if (/Horizontal scrolling/.test(issues)) {
      // remove the box that is too wide from the page it is on
      const site = parseSite(user);
      const pages = site.pages
        .filter((p) => p.html.includes('e2e-wide'))
        .map((p) => ({ slug: p.slug, html: p.html.replace('<div class="e2e-wide">x</div>', ''), css: '' }));
      return { kind: 'fix', payload: { css: null, cssEdits: [], pages, removePages: [] } };
    }
    // contrast: change the colour where it is defined, in the shared css
    return {
      kind: 'fix',
      payload: { css: null, cssEdits: [{ find: BAD_ACCENT, replace: GOOD_ACCENT }], pages: [], removePages: [] },
    };
  }

  if (user.startsWith('Here is the current website')) {
    const instruction = (user.match(/Apply this change: (.*)/) || [, ''])[1].trim();
    const site = parseSite(user);
    const viewed = (user.match(/currently looking at the page "([^"]+)"/) || [, ''])[1];
    const slugs = site.pages.map((p) => p.slug);
    const find = (slug) => site.pages.find((p) => p.slug === slug);

    if (instruction.includes('WIDE')) {
      const home = find('index');
      return {
        kind: 'refine',
        payload: {
          css: null,
          cssEdits: [],
          pages: [{ slug: 'index', html: home.html.replace('</section>', '<div class="e2e-wide">x</div></section>'), css: '.e2e-wide{width:900px;height:20px}' }],
          removePages: [],
        },
      };
    }

    if (instruction.includes('ADDPAGE')) {
      const all = [...slugs, 'gallery'];
      const plan = { header: header(all) };
      // the new menu link goes into EVERY existing page with ONE edit (no slug); only the new
      // page is returned in full
      const pages = [
        {
          slug: 'gallery',
          title: `Gallery - ${SITE_NAME}`,
          html: `${plan.header.replace('<a href="gallery.html">', '<a href="gallery.html" aria-current="page">')}<main id="main">${mainOf('gallery')}</main>${footer}`,
          css: '',
        },
      ];
      return {
        kind: 'refine',
        payload: {
          css: null,
          cssEdits: [],
          htmlEdits: [{ find: '</nav>', replace: '<a href="gallery.html">Gallery</a></nav>' }],
          pages,
          removePages: [],
        },
      };
    }

    // any other change: the heading of the page the user is looking at (home if none)
    const target = find(viewed) ?? find('index');
    const edited = target.html.replace(/<h1>([^<]*)<\/h1>/, (m, text) => `<h1>${text} (edited: ${escapeHtml(instruction)})</h1>`);
    return { kind: 'refine', payload: { css: null, cssEdits: [], pages: [{ slug: target.slug, html: edited, css: target.css }], removePages: [] } };
  }

  return { kind: 'unknown', payload: { css: null, pages: [], removePages: [] } };
}

export async function createFakeAnthropic({ delayMs = 0 } = {}) {
  const state = { delayMs, calls: [] };

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) {
      res.writeHead(404).end();
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const system = typeof body.system === 'string' ? body.system : JSON.stringify(body.system ?? '');
    const firstUser = (body.messages || []).find((m) => m.role === 'user');
    const user = typeof firstUser?.content === 'string' ? firstUser.content : JSON.stringify(firstUser?.content ?? '');

    const { kind, payload } = decide(system, user);
    state.calls.push(kind);
    if (state.delayMs) await new Promise((resolve) => setTimeout(resolve, state.delayMs));

    // The backend starts the answer with a "{" prefill, so the reply continues AFTER it.
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload).slice(1);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'msg_fake',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1200, output_tokens: 3400 },
      })
    );
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    get calls() {
      return state.calls;
    },
    resetCalls() {
      state.calls.length = 0;
    },
    setDelay(ms) {
      state.delayMs = ms;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
