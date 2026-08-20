import { checkAccessibility } from './accessibilityChecker.js';
import { checkResponsive } from './responsiveChecker.js';

// Ενοποιημένος έλεγχος: accessibility (axe-core, headless browser) +
// responsive (custom parser). Κανένα από τα δύο δεν χρειάζεται νέα κλήση
// στο Claude API — τρέχουν εξ ολοκλήρου τοπικά (Βήμα 11 σημείωση caching).
export async function validateCode(html, css) {
  const [accessibility, responsive] = await Promise.all([
    checkAccessibility(html, css),
    Promise.resolve(checkResponsive(css)),
  ]);

  const issueSummary = [
    ...accessibility.violations.map(
      (v) => `[accessibility] ${v.help} (${v.impact}, ${v.nodeCount} στοιχεία): ${v.targets.join(', ')}`
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
