import { translate } from './i18n.js';

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
