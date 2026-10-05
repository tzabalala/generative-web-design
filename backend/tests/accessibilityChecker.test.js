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

  it('reports the real colours and the ratio of a contrast problem, so the fix can be exact', async () => {
    const html = '<main><h1>Title</h1><p class="soft">Soft text</p></main>';
    const css = 'body{color:#000;background:#f9f7f4}.soft{color:#d4422f}';
    const result = await checkAccessibility(html, css);
    const contrast = result.violations.find((v) => v.id === 'color-contrast');
    expect(contrast).toBeDefined();
    expect(contrast.details[0]).toMatch(/text #d4422f on #f9f7f4 is \d\.\d+:1, needs 4\.5/);
  }, 30000);

  it('offers colours that pass, for the text and for the background', async () => {
    const result = await checkAccessibility('<main><h1>T</h1><p class="x">Hello</p></main>', 'body{background:#1a1a1a;color:#fff}.x{color:#ff0000}');
    const text = result.violations.find((v) => v.id === 'color-contrast').details[0];
    expect(text).toMatch(/text #ff0000 on #1a1a1a is 4\.3\d:1, needs 4\.5:1 \(passing options: text colour #[0-9a-f]{6} \(\d\.\d+:1\) or background #[0-9a-f]{6}/);
  }, 30000);

  it('says which stylesheet and rule set the colours, when given the stylesheets as separate parts', async () => {
    const html = '<main><h1>Title</h1><p><span class="price">9.50</span></p></main>';
    const parts = [
      { name: 'shared css', css: 'body{color:#000;background:#f9f7f4}p span{color:#d4422f}' },
      { name: 'css of page index', css: '.price{font-weight:700}' },
    ];
    const result = await checkAccessibility(html, parts);
    const text = result.violations.find((v) => v.id === 'color-contrast').details.join(' ');
    // the browser reports colours as rgb(); a var(--x) would be shown as written
    expect(text).toContain('color: rgb(212, 66, 47) in the shared css, rule "p span"');
    expect(text).toContain('background-color: rgb(249, 247, 244) in the shared css, rule "body"');
  }, 30000);

  it('has no details for violations that are not about contrast', async () => {
    const result = await checkAccessibility('<main><h1>T</h1><img src="a.jpg"></main>', 'body{color:#000;background:#fff}');
    expect(result.violations.find((v) => v.id === 'image-alt').details).toEqual([]);
  }, 30000);

  it('flags an image with no alt text', async () => {
    const html = '<main><h1>Title</h1><img src="a.jpg"></main>';
    const css = 'body{color:#000;background:#fff}';
    const result = await checkAccessibility(html, css);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.id === 'image-alt')).toBe(true);
  }, 30000);
});
