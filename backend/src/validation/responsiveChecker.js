// Βήμα 9: CSS Responsive Checker — δική μας υλοποίηση, δεν υπάρχει έτοιμο
// εργαλείο γι' αυτό. MVP-level: στατικός έλεγχος ύπαρξης @media κανόνων σε
// τουλάχιστον 2 breakpoints (mobile + desktop), όχι πλήρης οπτικός έλεγχος
// (γνωστός περιορισμός, βλ. Chapter 5.5).
const MOBILE_MAX_WIDTH = 900; // px — κάτω από αυτό θεωρείται "mobile" breakpoint
const MEDIA_RULE_RE = /@media[^{]*\(([a-z-]+)\s*:\s*(\d+)(?:px)?\)/gi;

export function checkResponsive(css) {
  const issues = [];
  const mediaRules = [...css.matchAll(MEDIA_RULE_RE)].map((m) => ({
    feature: m[1].toLowerCase(),
    value: Number(m[2]),
  }));

  const hasMobileBreakpoint = mediaRules.some(
    (r) => r.feature === 'max-width' && r.value <= MOBILE_MAX_WIDTH
  );
  const hasDesktopBreakpoint = mediaRules.some(
    (r) =>
      (r.feature === 'min-width' && r.value > MOBILE_MAX_WIDTH * 0.4) ||
      (r.feature === 'max-width' && r.value > MOBILE_MAX_WIDTH)
  );

  if (mediaRules.length < 2) {
    issues.push('Λιγότερα από 2 @media rules βρέθηκαν στο CSS.');
  }
  if (!hasMobileBreakpoint) {
    issues.push('Δεν βρέθηκε @media rule για mobile breakpoint (π.χ. max-width: 600px).');
  }
  if (!hasDesktopBreakpoint) {
    issues.push('Δεν βρέθηκε @media rule για desktop breakpoint (π.χ. min-width: 601px).');
  }

  const usesRelativeUnits = /\d+(\.\d+)?(%|rem|em|vw|vh)\b/.test(css);
  if (!usesRelativeUnits) {
    issues.push('Δεν βρέθηκαν relative units (%, rem, em, vw, vh) στο CSS.');
  }

  const usesFlexOrGrid = /display\s*:\s*(flex|grid)/i.test(css);
  if (!usesFlexOrGrid) {
    issues.push('Δεν βρέθηκε χρήση flexbox/grid layout στο CSS.');
  }

  return {
    passed: issues.length === 0,
    mediaRuleCount: mediaRules.length,
    hasMobileBreakpoint,
    hasDesktopBreakpoint,
    issues,
  };
}
