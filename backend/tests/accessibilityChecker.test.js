import { checkAccessibility } from '../src/validation/accessibilityChecker.js';
import { closeBrowser } from '../src/validation/browserManager.js';

afterAll(async () => {
  await closeBrowser();
});

describe('checkAccessibility', () => {
  it('passes clean, accessible HTML', async () => {
    const html = '<main><h1>Title</h1><img src="a.jpg" alt="A cat sleeping on a windowsill"></main>';
    const css = 'body{color:#000;background:#fff}';
    const result = await checkAccessibility(html, css);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  }, 30000);

  it('flags an image with no alt text', async () => {
    const html = '<main><h1>Title</h1><img src="a.jpg"></main>';
    const css = 'body{color:#000;background:#fff}';
    const result = await checkAccessibility(html, css);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.id === 'image-alt')).toBe(true);
  }, 30000);
});
