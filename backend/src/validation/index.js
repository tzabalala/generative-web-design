import { checkAccessibility } from './accessibilityChecker.js';
import { checkResponsive } from './responsiveChecker.js';

// Combined check: accessibility (axe-core, headless browser) + responsive (custom
// parser). Neither needs a new Claude API call — both run entirely locally (see the
// Step 11 caching note).
export async function validateCode(html, css) {
  const [accessibility, responsive] = await Promise.all([
    checkAccessibility(html, css),
    Promise.resolve(checkResponsive(css)),
  ]);

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
