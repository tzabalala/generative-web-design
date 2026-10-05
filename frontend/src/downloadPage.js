import { translate } from './i18n.js';
import { buildZip } from './zip.js';

// The file the user downloads. It starts with an HTML comment holding the guide for
// replacing the dummy content, so the guide STAYS with the file even if the user opens
// it months later, outside the tool. The comment is written in the UI language that was
// active at download time.

// Inside an HTML comment the sequence "--" (and "-->") ends/breaks the comment.
function safe(text) {
  return String(text ?? '').replace(/-{2,}/g, '-').replace(/\s+/g, ' ').trim();
}

export function buildGuideComment(placeholders, locale = 'en') {
  if (!placeholders || !placeholders.length) return '';
  const T = (key) => translate(locale, key);

  const items = placeholders
    .map((p, i) => {
      const lines = [`${i + 1}. ${safe(p.what)}`];
      if (p.where) lines.push(`   ${T('download.where')}: ${safe(p.where)}`);
      if (p.searchText) lines.push(`   ${T('download.search')}: ${safe(p.searchText)}`);
      if (p.replaceWith) lines.push(`   ${T('download.replace')}: ${safe(p.replaceWith)}`);
      return lines.join('\n');
    })
    .join('\n\n');

  return `<!--
${T('download.guideIntro')}

${items}
-->
`;
}

const stripTags = (s) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
// The h1 text already comes from HTML (the & are already entities), so here we
// neutralise only < and >.
const escapeHtml = (s) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Language and title are derived from the content itself (Greek characters → el,
// otherwise en; title = first <h1>) so the page never declares the wrong language
// (an accessibility issue for screen readers). This is the language of the GENERATED page,
// independent of the UI language.
export function detectLangAndTitle(html) {
  const lang = /[Ͱ-Ͽ]/.test(stripTags(html)) ? 'el' : 'en';
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const fromH1 = h1 ? stripTags(h1[1]) : '';
  const title = fromH1 || translate(lang, 'download.fallbackTitle');
  return { lang, title };
}

export function buildDownloadHtml({ html, css, placeholders, locale = 'en' }) {
  const { lang, title } = detectLangAndTitle(html);
  return `<!DOCTYPE html>
${buildGuideComment(placeholders, locale)}<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>${html}</body>
</html>`;
}

// One page of a website that is downloaded as several files: it links to the shared
// style.css, and carries its own page rules (if any) inline. Only the home page carries the
// replacement guide.
export function buildSitePageHtml({ page, guideComment = '' }) {
  const { lang, title } = detectLangAndTitle(page.html);
  const own = page.css ? `\n<style>${page.css}</style>` : '';
  return `<!DOCTYPE html>
${guideComment}<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(page.title || title)}</title>
<link rel="stylesheet" href="style.css">${own}
</head>
<body>${page.html}</body>
</html>`;
}

// What the "Download" button hands to the browser.
//   one page   -> a single self-contained .html file (CSS inside), as before;
//   several    -> a .zip with one .html per page and one shared style.css, so the links
//                 between the pages ("about.html") work when the files are opened.
// Returns { filename, type, data } where data is a string or a Uint8Array.
export function buildDownload({ pages, css, placeholders, locale = 'en' }) {
  if (pages.length === 1) {
    const [page] = pages;
    return {
      filename: 'page.html',
      type: 'text/html',
      data: buildDownloadHtml({
        html: page.html,
        css: page.css ? `${css}\n${page.css}` : css,
        placeholders,
        locale,
      }),
    };
  }

  const guide = buildGuideComment(placeholders, locale);
  const files = pages.map((page) => ({
    name: `${page.slug}.html`,
    content: buildSitePageHtml({ page, guideComment: page.slug === 'index' ? guide : '' }),
  }));
  files.push({ name: 'style.css', content: css });
  return { filename: 'website.zip', type: 'application/zip', data: buildZip(files) };
}
