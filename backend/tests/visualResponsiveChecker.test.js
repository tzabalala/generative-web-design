import { checkVisualResponsive, VIEWPORTS } from '../src/validation/visualResponsiveChecker.js';
import { validateCode } from '../src/validation/index.js';
import { closeBrowser } from '../src/validation/browserManager.js';

afterAll(async () => {
  await closeBrowser();
});

const byName = (result, name) => result.viewports.find((v) => v.name === name);

describe('checkVisualResponsive (real browser)', () => {
  it('checks three screen sizes', () => {
    expect(VIEWPORTS.map((v) => v.width)).toEqual([375, 768, 1280]);
  });

  it('passes a fluid page', async () => {
    const result = await checkVisualResponsive(
      '<main><h1>Hello</h1><p>Some text</p><button style="padding:12px 20px">Go</button></main>',
      'main{max-width:100%}img{max-width:100%}'
    );
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.viewports.every((v) => !v.overflows)).toBe(true);
  }, 30000);

  it('flags a fixed-width box that makes the page scroll sideways on a phone, and names it', async () => {
    const result = await checkVisualResponsive(
      '<main><div class="wide">too wide</div></main>',
      '.wide{width:900px;height:40px;background:#ddd}'
    );
    expect(result.passed).toBe(false);
    expect(byName(result, 'mobile').overflows).toBe(true);
    expect(byName(result, 'tablet').overflows).toBe(true); // 900px > 768px
    expect(byName(result, 'desktop').overflows).toBe(false); // 900px fits in 1280px
    expect(result.issues[0]).toMatch(/Horizontal scrolling at 375px \(mobile\)/);
    expect(result.issues[0]).toContain('div.wide');
  }, 30000);

  it('reports the outermost offender only, not every child inside it', async () => {
    const result = await checkVisualResponsive(
      '<main><section class="row"><p class="a">one</p><p class="b">two</p></section></main>',
      '.row{width:1000px;display:flex}.a,.b{width:500px}'
    );
    const mobile = byName(result, 'mobile');
    const selectors = mobile.culprits.map((c) => c.selector);
    expect(selectors).toContain('section.row');
    expect(selectors).not.toContain('p.a');
  }, 30000);

  it('does not blame content that its own container clips or scrolls', async () => {
    const result = await checkVisualResponsive(
      '<main><div class="scroller"><div class="wide">wide table stand-in</div></div></main>',
      '.scroller{overflow-x:auto;width:100%}.wide{width:900px;height:30px}'
    );
    expect(result.passed).toBe(true);
  }, 30000);

  it('ignores position:fixed boxes, which do not widen the page', async () => {
    const result = await checkVisualResponsive(
      '<main><p>text</p><div class="bar">bar</div></main>',
      '.bar{position:fixed;top:0;left:0;width:1500px;height:10px}'
    );
    expect(result.passed).toBe(true);
  }, 30000);

  it('flags tiny buttons on the phone screen only', async () => {
    const result = await checkVisualResponsive(
      '<main><button class="x" style="width:16px;height:16px;padding:0">x</button></main>',
      'body{margin:0}'
    );
    expect(result.passed).toBe(false);
    expect(byName(result, 'mobile').smallTargets[0]).toMatchObject({ selector: 'button.x', width: 16, height: 16 });
    expect(byName(result, 'tablet').smallTargets).toEqual([]);
    expect(result.issues[0]).toMatch(/Tap targets too small at 375px/);
    expect(result.issues[0]).toContain('2.5.8');
  }, 30000);

  it('does not flag disabled or hidden buttons', async () => {
    const result = await checkVisualResponsive(
      '<main><button disabled style="width:10px;height:10px">x</button><button style="display:none;width:10px;height:10px">y</button></main>',
      'body{margin:0}'
    );
    expect(result.passed).toBe(true);
  }, 30000);
});

describe('validateCode with the layout check', () => {
  const GOOD = {
    html: '<main><h1>Hi</h1><p>text</p></main>',
    css: 'body{color:#000;background:#fff;font-size:1rem}.x{display:flex}@media (max-width:600px){body{font-size:0.9rem}}@media (min-width:601px){body{font-size:1.1rem}}',
  };

  it('passes a good page and exposes the layout details under responsive.visual', async () => {
    const r = await validateCode(GOOD.html, GOOD.css);
    expect(r.passed).toBe(true);
    expect(r.responsive.visual.viewports).toHaveLength(3);
    expect(r.responsive.hasMobileBreakpoint).toBe(true); // static result still present
  }, 30000);

  it('fails a page that scrolls sideways even though its CSS has all the media queries', async () => {
    const r = await validateCode(GOOD.html.replace('</main>', '<div class="wide">w</div></main>'), GOOD.css + '.wide{width:900px;height:20px}');
    expect(r.passed).toBe(false);
    expect(r.responsive.passed).toBe(false);
    expect(r.responsive.visual.passed).toBe(false);
    expect(r.issueSummary.some((i) => i.startsWith('[responsive] Horizontal scrolling at 375px'))).toBe(true);
  }, 30000);

  it('can be switched off with VISUAL_RESPONSIVE_CHECK=off', async () => {
    process.env.VISUAL_RESPONSIVE_CHECK = 'off';
    try {
      const r = await validateCode(GOOD.html.replace('</main>', '<div class="wide">w</div></main>'), GOOD.css + '.wide{width:900px;height:20px}');
      expect(r.responsive.visual).toMatchObject({ skipped: true, passed: true });
      expect(r.passed).toBe(true);
    } finally {
      delete process.env.VISUAL_RESPONSIVE_CHECK;
    }
  }, 30000);
});
