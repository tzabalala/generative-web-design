// The file the user downloads. It starts with an HTML comment holding the guide for
// replacing the dummy content, so the guide STAYS with the file even if the user opens
// it months later, outside the tool.

// Inside an HTML comment the sequence "--" (and "-->") ends/breaks the comment.
function safe(text) {
  return String(text ?? '').replace(/-{2,}/g, '-').replace(/\s+/g, ' ').trim();
}

export function buildGuideComment(placeholders) {
  if (!placeholders || !placeholders.length) return '';

  const items = placeholders
    .map((p, i) => {
      const lines = [`${i + 1}. ${safe(p.what)}`];
      if (p.where) lines.push(`   Πού: ${safe(p.where)}`);
      if (p.searchText) lines.push(`   Αναζήτηση (Ctrl+F): ${safe(p.searchText)}`);
      if (p.replaceWith) lines.push(`   Βάλε: ${safe(p.replaceWith)}`);
      return lines.join('\n');
    })
    .join('\n\n');

  return `<!--
ΟΔΗΓΟΣ: ΔΟΚΙΜΑΣΤΙΚΑ ΣΤΟΙΧΕΙΑ ΠΡΟΣ ΑΝΤΙΚΑΤΑΣΤΑΣΗ
Αυτή η σελίδα περιέχει δοκιμαστικό περιεχόμενο. Αντικατάστησέ το πριν τη δημοσιεύσεις.
Άνοιξε το αρχείο σε editor (Σημειωματάριο / VS Code), πάτα Ctrl+F και βάλε το απόσπασμα.
Για εικόνες: βάλε τη φωτογραφία στον ίδιο φάκελο, άλλαξε το src και ΤΟ alt (περιγραφή για screen readers).
Όταν τελειώσεις, μπορείς να σβήσεις αυτό το σχόλιο.

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
// (an accessibility issue for screen readers).
export function detectLangAndTitle(html) {
  const lang = /[\u0370-\u03FF]/.test(stripTags(html)) ? 'el' : 'en';
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const fromH1 = h1 ? stripTags(h1[1]) : '';
  const title = fromH1 || (lang === 'el' ? 'Η σελίδα μου' : 'My page');
  return { lang, title };
}

export function buildDownloadHtml({ html, css, placeholders }) {
  const { lang, title } = detectLangAndTitle(html);
  return `<!DOCTYPE html>
${buildGuideComment(placeholders)}<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>${html}</body>
</html>`;
}
