import { checkAccessibility } from './accessibilityChecker.js';
import { checkResponsive } from './responsiveChecker.js';
import { checkVisualResponsive } from './visualResponsiveChecker.js';

// Combined check: accessibility (axe-core, headless browser) + responsive. Responsive has
// two layers: the static CSS-text check and the real layout check at three screen sizes.
// None of this needs a Claude API call; it all runs locally (see the Step 11 caching note).

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
    ...accessibility.violations.map(
      (v) => `[accessibility] ${v.help} (${v.impact}, ${v.nodeCount} elements): ${v.targets.join(', ')}`
    ),
    ...responsive.issues.map((i) => `[responsive] ${i}`),
  ];

  return {
    passed: accessibility.passed && responsive.passed,
    accessibility,
    responsive,
    issueSummary,
  };
}
