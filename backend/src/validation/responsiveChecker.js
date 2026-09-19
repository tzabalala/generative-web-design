// Step 9: CSS Responsive Checker — our own implementation, since no off-the-shelf tool
// exists for this. MVP-level: a static check that @media rules exist for at least 2
// breakpoints (mobile + desktop), not a full visual check (known limitation, see
// Chapter 5.5).
const MOBILE_MAX_WIDTH = 900; // px — at or below this counts as a "mobile" breakpoint
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
    issues.push('Fewer than 2 @media rules found in the CSS.');
  }
  if (!hasMobileBreakpoint) {
    issues.push('No @media rule found for a mobile breakpoint (e.g. max-width: 600px).');
  }
  if (!hasDesktopBreakpoint) {
    issues.push('No @media rule found for a desktop breakpoint (e.g. min-width: 601px).');
  }

  const usesRelativeUnits = /\d+(\.\d+)?(%|rem|em|vw|vh)\b/.test(css);
  if (!usesRelativeUnits) {
    issues.push('No relative units (%, rem, em, vw, vh) found in the CSS.');
  }

  const usesFlexOrGrid = /display\s*:\s*(flex|grid)/i.test(css);
  if (!usesFlexOrGrid) {
    issues.push('No flexbox/grid layout found in the CSS.');
  }

  return {
    passed: issues.length === 0,
    mediaRuleCount: mediaRules.length,
    hasMobileBreakpoint,
    hasDesktopBreakpoint,
    issues,
  };
}
