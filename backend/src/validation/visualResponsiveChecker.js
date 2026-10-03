import { withPage } from './browserManager.js';

// Step 9, stretch goal: a REAL layout check. The static checker (responsiveChecker.js)
// only proves that media queries exist in the CSS text; it cannot tell whether the page
// actually fits a phone. This opens the page in the headless browser at three screen
// sizes and measures what really happens:
//
//   1. Horizontal scrolling: the page is wider than the screen (the classic mobile bug).
//   2. Tap targets: buttons smaller than 24x24 px on the phone-sized screen
//      (WCAG 2.2 success criterion 2.5.8, Target Size Minimum, level AA).
//
// Deliberately conservative: every issue reported here is sent back to Claude as a
// "fix this" request, so a false alarm costs time and money. Only objective, easy to
// verify problems are reported.
export const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

const MIN_TARGET_PX = 24;
const TOLERANCE_PX = 1;
const MAX_LISTED = 5;

function buildFullPage(html, css) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Preview</title>
<style>${css}</style>
</head>
<body>${html}</body>
</html>`;
}

// Runs INSIDE the browser page (Playwright serialises it), so it must be self-contained.
function measureInPage({ minTarget, tolerance, checkTargets, maxListed }) {
  const vw = window.innerWidth;
  const doc = document.documentElement;
  const scrollWidth = Math.max(doc.scrollWidth, document.body ? document.body.scrollWidth : 0);

  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) return `${s}#${el.id}`;
    if (typeof el.className === 'string' && el.className.trim()) {
      s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
    }
    return s;
  };
  const rectOf = (el) => el.getBoundingClientRect();
  const isVisible = (el, rect) => {
    const st = getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  // An element inside a box that hides or scrolls its own horizontal overflow never makes
  // the PAGE scroll sideways, so it is not a problem.
  const isClipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== doc; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'hidden' || ox === 'clip' || ox === 'auto' || ox === 'scroll') {
        if (rectOf(p).right <= vw + tolerance) return true;
      }
    }
    return false;
  };

  const overflows = scrollWidth > vw + tolerance;
  let culprits = [];
  if (overflows && document.body) {
    const sticking = new Set();
    for (const el of document.body.querySelectorAll('*')) {
      const rect = rectOf(el);
      if (!isVisible(el, rect)) continue;
      if (getComputedStyle(el).position === 'fixed') continue; // fixed boxes do not widen the page
      if (rect.right > vw + tolerance && !isClipped(el)) sticking.add(el);
    }
    // Report the OUTERMOST offenders: a child of an overflowing box overflows too, but
    // fixing the parent fixes the child, so listing both is just noise.
    const seen = new Set();
    for (const el of sticking) {
      if (el.parentElement && sticking.has(el.parentElement)) continue;
      const label = describe(el);
      if (seen.has(label)) continue;
      seen.add(label);
      culprits.push({ selector: label, width: Math.round(rectOf(el).width) });
    }
    culprits = culprits.slice(0, maxListed);
  }

  const smallTargets = [];
  if (checkTargets) {
    const query = 'button, input[type=button], input[type=submit], input[type=reset], select, [role=button]';
    for (const el of document.querySelectorAll(query)) {
      if (el.disabled) continue;
      const rect = rectOf(el);
      if (!isVisible(el, rect)) continue;
      if (rect.width < minTarget || rect.height < minTarget) {
        smallTargets.push({
          selector: describe(el),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    }
  }

  return {
    viewportWidth: vw,
    scrollWidth,
    overflows,
    culprits,
    smallTargets: smallTargets.slice(0, maxListed),
    smallTargetCount: smallTargets.length,
  };
}

// Measures the page that is ALREADY loaded in `page`, at its current viewport size.
// Exported so the end-to-end tests can run the very same check on the tool's own UI.
export function measureLayout(page, { checkTargets = false } = {}) {
  return page.evaluate(measureInPage, {
    minTarget: MIN_TARGET_PX,
    tolerance: TOLERANCE_PX,
    checkTargets,
    maxListed: MAX_LISTED,
  });
}

function issuesFor(viewport, m) {
  const issues = [];
  if (m.overflows) {
    const list = m.culprits.map((c) => `${c.selector} (${c.width}px wide)`).join(', ');
    issues.push(
      `Horizontal scrolling at ${viewport.width}px (${viewport.name}): the content is ${m.scrollWidth}px wide, wider than the ${m.viewportWidth}px screen. ` +
        `Elements sticking out: ${list || 'unknown'}. Use fluid widths (%, max-width: 100%, flex-wrap, grid auto-fit) so nothing exceeds the screen width.`
    );
  }
  if (m.smallTargetCount > 0) {
    const list = m.smallTargets.map((t) => `${t.selector} (${t.width}x${t.height}px)`).join(', ');
    issues.push(
      `Tap targets too small at ${viewport.width}px (${viewport.name}): ${list}. WCAG 2.2 (2.5.8) requires at least ${MIN_TARGET_PX}x${MIN_TARGET_PX}px.`
    );
  }
  return issues;
}

export async function checkVisualResponsive(html, css, { viewports = VIEWPORTS } = {}) {
  return withPage(async (page) => {
    await page.setContent(buildFullPage(html, css), { waitUntil: 'load' });

    const results = [];
    const issues = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      // Tap targets only matter on the phone-sized screen.
      const m = await measureLayout(page, { checkTargets: viewport.name === 'mobile' });
      results.push({
        name: viewport.name,
        width: viewport.width,
        scrollWidth: m.scrollWidth,
        overflows: m.overflows,
        culprits: m.culprits,
        smallTargets: m.smallTargets,
      });
      issues.push(...issuesFor(viewport, m));
    }

    return { passed: issues.length === 0, viewports: results, issues };
  });
}
