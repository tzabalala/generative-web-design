// Το αρχείο που κατεβάζει ο χρήστης. Περιέχει στην αρχή ένα σχόλιο HTML με τον
// οδηγό αντικατάστασης των δοκιμαστικών στοιχείων, ώστε ο οδηγός να ΜΕΝΕΙ μαζί
// με το αρχείο ακόμα κι αν ο χρήστης το ανοίξει μήνες αργότερα, εκτός εργαλείου.

// Μέσα σε σχόλιο HTML η ακολουθία "--" (και το "-->") τερματίζει/χαλάει το σχόλιο.
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
// Το κείμενο του h1 προέρχεται ήδη από HTML (τα & είναι ήδη entities), οπότε εδώ
// εξουδετερώνουμε μόνο τα < και >.
const escapeHtml = (s) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Η γλώσσα και ο τίτλος προκύπτουν από το ίδιο το περιεχόμενο (ελληνικοί
// χαρακτήρες → el, αλλιώς en· τίτλος = πρώτο <h1>) ώστε να μη δηλώνεται λάθος
// γλώσσα σελίδας (θέμα προσβασιμότητας για screen readers).
export function detectLangAndTitle(html) {
  const lang = /[Ͱ-Ͽ]/.test(stripTags(html)) ? 'el' : 'en';
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
