import { checkAccessibility } from './accessibilityChecker.js';
import { checkResponsive } from './responsiveChecker.js';
import { checkVisualResponsive } from './visualResponsiveChecker.js';
import { checkSite } from './siteChecker.js';
import { pageCss } from '../site.js';

// Combined check: accessibility (axe-core, headless browser) + responsive + (for sites of
// several pages) how the pages fit together. Responsive has two layers: the static CSS-text
// check and the real layout check at three screen sizes. None of this needs a Claude API
// call; it all runs locally (see the Step 11 caching note).

// VISUAL_RESPONSIVE_CHECK=off in .env switches the real layout check off (e.g. to compare
// against the earlier static-only results). It is on by default.
function visualCheckEnabled() {
  return (process.env.VISUAL_RESPONSIVE_CHECK || 'on').trim().toLowerCase() !== 'off';
}

// A crash of the browser during the layout check must not block the user's page: report it
// as "skipped" and let the other checks decide.
async function runVisualCheck(html, css) {
  if (!visualCheckEnabled()) {
    return { passed: true, skipped: true, viewports: [], issues: [] };
  }
  try {
    return await checkVisualResponsive(html, css);
  } catch (err) {
    console.warn(`[validation] layout check skipped: ${err.message}`);
    return { passed: true, skipped: true, error: err.message, viewports: [], issues: [] };
  }
}

// The one-line description of an axe violation that goes into the fix request. For colour
// contrast it includes the real colours and ratios (see accessibilityChecker.js).
const describeViolation = (v, tag = '') =>
  `[accessibility]${tag} ${v.help} (${v.impact}, ${v.nodeCount} elements): ${v.targets.join(', ')}` +
  (v.details?.length ? `. Details: ${v.details.join('; ')}` : '');

// One page (the original single-page check). Kept as it was: the benchmark and several tests
// use it directly.
export async function validateCode(html, css) {
  const [accessibility, staticResponsive, visual] = await Promise.all([
    checkAccessibility(html, css),
    Promise.resolve(checkResponsive(css)),
    runVisualCheck(html, css),
  ]);

  // Presented as ONE "responsive" result (the UI shows a single line for it), with the real
  // layout details kept under `visual`.
  const responsive = {
    ...staticResponsive,
    visual,
    passed: staticResponsive.passed && visual.passed,
    issues: [...staticResponsive.issues, ...visual.issues],
  };

  const issueSummary = [
    ...accessibility.violations.map((v) => describeViolation(v)),
    ...responsive.issues.map((i) => `[responsive] ${i}`),
  ];

  return {
    passed: accessibility.passed && responsive.passed,
    accessibility,
    responsive,
    issueSummary,
  };
}

// A whole site. Accessibility and the layout check run on EVERY page (each with the shared
// CSS plus its own); the static CSS check runs once on all the CSS together; the site check
// judges how the pages fit together. The result has the same shape as validateCode() plus a
// `site` entry, so the rest of the tool treats one page and many pages alike. Issues of a
// site with several pages say which page they belong to.
export async function validateSite(site) {
  const many = site.pages.length > 1;
  const tag = (slug) => (many ? ` (page: ${slug})` : '');

  const violations = [];
  const visualPages = [];
  const visualIssues = [];

  for (const page of site.pages) {
    const css = pageCss(site, page);
    // axe gets the stylesheets separately, so it can say where a colour comes from
    const cssParts = [
      { name: 'shared css', css: site.css },
      { name: `css of page ${page.slug}`, css: page.css ?? '' },
    ];
    const [accessibility, visual] = await Promise.all([
      checkAccessibility(page.html, cssParts),
      runVisualCheck(page.html, css),
    ]);
    violations.push(...accessibility.violations.map((v) => ({ ...v, page: page.slug })));
    visualPages.push({ slug: page.slug, ...visual });
    visualIssues.push(...visual.issues.map((i) => ({ slug: page.slug, text: i })));
  }

  const allCss = [site.css, ...site.pages.map((p) => p.css ?? '')].join('\n');
  const staticResponsive = checkResponsive(allCss);

  const home = visualPages[0];
  const visual = {
    passed: visualPages.every((p) => p.passed),
    skipped: visualPages.every((p) => p.skipped),
    viewports: home.viewports,
    pages: visualPages,
    issues: visualIssues.map((i) => (many ? `(page: ${i.slug}) ${i.text}` : i.text)),
  };

  const accessibility = { passed: violations.length === 0, violations };
  const responsive = {
    ...staticResponsive,
    visual,
    passed: staticResponsive.passed && visual.passed,
    issues: [...staticResponsive.issues, ...visual.issues],
  };
  const siteResult = checkSite(site);

  const issueSummary = [
    ...violations.map((v) => describeViolation(v, tag(v.page))),
    ...responsive.issues.map((i) => `[responsive] ${i}`),
    ...siteResult.issues.map((i) => `[site] ${i}`),
  ];

  return {
    passed: accessibility.passed && responsive.passed && siteResult.passed,
    accessibility,
    responsive,
    site: siteResult,
    issueSummary,
  };
}
