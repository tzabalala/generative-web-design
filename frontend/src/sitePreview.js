// Showing ONE page of a generated website inside the sandboxed preview frame.
//
// The frame has no JavaScript, so a click on a menu link cannot be handled inside it. A link
// to another page of the site ("about.html") would try to load that file from OUR server,
// which is wrong. So, in the preview only, every such link is rewritten into a link that
// asks the TOP window to change its address to "<this address>#page=about" (the sandbox
// flag allow-top-navigation-by-user-activation permits exactly this, and only after a real
// click). The app listens for that address change and switches to the page.
// The file the user DOWNLOADS keeps the real links ("about.html").

export const PAGE_HASH = '#page=';

// Where "the top window" currently is, without the #fragment, so the link only changes the hash.
export function currentBase() {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
}

export function slugFromHash(hash, slugs) {
  if (typeof hash !== 'string' || !hash.startsWith(PAGE_HASH)) return null;
  const slug = hash.slice(PAGE_HASH.length);
  return slugs.includes(slug) ? slug : null;
}

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Links to a page of the site become top-window links; links to a page that does not exist
// are neutralised (otherwise the frame would load our own app inside itself).
export function rewritePageLinks(html, slugs, base) {
  return html.replace(/<a\b([^>]*)>/gi, (whole, attrs) => {
    const href = attrs.match(/(^|\s)href\s*=\s*(["'])(.*?)\2/i);
    if (!href) return whole;
    const target = href[3].trim().match(/^(?:\.\/)?([a-z0-9-]+)\.html(?:#.*)?$/i);
    if (!target) return whole;

    const slug = target[1].toLowerCase();
    const known = slugs.includes(slug);
    const others = attrs
      .replace(href[0], ' ')
      .replace(/\s+target\s*=\s*(["']).*?\1/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const newHref = known ? escapeAttr(`${base}${PAGE_HASH}${slug}`) : '#';
    return `<a ${others ? `${others} ` : ''}href="${newHref}"${known ? ' target="_top"' : ''}>`;
  });
}

// The complete document shown in the frame for one page.
export function previewDocument({ pages, css, slug, base = currentBase() }) {
  const page = pages.find((p) => p.slug === slug) ?? pages[0];
  if (!page) return '';
  const slugs = pages.map((p) => p.slug);
  const styles = page.css ? `${css}\n${page.css}` : css;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeText(page.title || page.slug)}</title>
<style>${styles}</style>
</head>
<body>${rewritePageLinks(page.html, slugs, base)}</body>
</html>`;
}
