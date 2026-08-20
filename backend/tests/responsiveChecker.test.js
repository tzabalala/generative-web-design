import { checkResponsive } from '../src/validation/responsiveChecker.js';

describe('checkResponsive', () => {
  it('passes CSS with mobile+desktop breakpoints, relative units, and flex/grid', () => {
    const css = `
      body { font-size: 1rem; }
      .row { display: flex; }
      @media (max-width: 600px) { body { font-size: 0.9rem; } }
      @media (min-width: 601px) { body { font-size: 1.1rem; } }
    `;
    const result = checkResponsive(css);
    expect(result.passed).toBe(true);
    expect(result.hasMobileBreakpoint).toBe(true);
    expect(result.hasDesktopBreakpoint).toBe(true);
  });

  it('fails CSS with no media queries at all', () => {
    const result = checkResponsive('body { color: red; }');
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('fails CSS with only a mobile breakpoint (missing desktop)', () => {
    const css = '@media (max-width: 500px) { body { color: red; } } .x{display:grid} body{width:1rem}';
    const result = checkResponsive(css);
    expect(result.hasMobileBreakpoint).toBe(true);
    expect(result.hasDesktopBreakpoint).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('fails CSS that only uses absolute px units, no flex/grid', () => {
    const css = `
      body { width: 500px; }
      @media (max-width: 600px) { body { width: 300px; } }
      @media (min-width: 900px) { body { width: 800px; } }
    `;
    const result = checkResponsive(css);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.includes('relative units'))).toBe(true);
    expect(result.issues.some((i) => i.includes('flexbox/grid'))).toBe(true);
  });
});
