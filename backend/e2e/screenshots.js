import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { startHarness } from './harness.js';
import { submitPrompt, trackWork } from './helpers.js';

// Takes screenshots of the real interface for documentation, using the same fake-Claude
// setup as the end-to-end test (so it is free). The content of the generated page in the
// pictures is canned data from an earlier real run, not a live answer.
//
//   node e2e/screenshots.js <output-folder>
const outDir = resolve(process.argv[2] || 'e2e-screenshots');
mkdirSync(outDir, { recursive: true });
const shot = (name) => join(outDir, name);

const harness = await startHarness({ delayMs: 0 });
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto(`${harness.appUrl}/?p=P01`);
  await page.screenshot({ path: shot('01-start.png') });

  // Mid-wait: slow the fake down so the "fixing" step stays on screen long enough to capture.
  harness.fake.setDelay(2500);
  await submitPrompt(page, 'a website for a local yoga studio');
  await page.waitForSelector('.prompt-form__stage');
  await page.waitForFunction(() => /Fixing a problem/.test(document.querySelector('.prompt-form__stage')?.textContent || ''), null, { timeout: 30000 });
  await page.locator('.app__column--controls').screenshot({ path: shot('02-working.png') });
  await trackWork(page);
  harness.fake.setDelay(0);

  await page.waitForSelector('iframe.live-preview__frame');
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot('03-result.png') });
  // The other pages of the website: a tab, and a click on a menu link inside the preview.
  await page.locator('.live-preview__tab', { hasText: 'About' }).click();
  await page.waitForTimeout(300);
  await page.locator('.live-preview').screenshot({ path: shot('13-about-tab.png') });
  await page.frameLocator('iframe.live-preview__frame').getByRole('link', { name: 'Contact' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('.live-preview').screenshot({ path: shot('14-contact-tab.png') });
  await page.locator('.live-preview__tab', { hasText: 'Home' }).click();
  await page.screenshot({ path: shot('04-result-full.png'), fullPage: true });
  await page.locator('.app__column--controls').screenshot({ path: shot('05-history.png') });
  await page.locator('.app__column--report').screenshot({ path: shot('06-report.png') });
  // The two explanation panels under the preview (the guide is long, so only its top part).
  await page.locator('.rationale').screenshot({ path: shot('11-rationale.png') });
  await page.locator('.guide').scrollIntoViewIfNeeded();
  const guideBox = await page.locator('.guide').boundingBox();
  const scrollY = await page.evaluate(() => window.scrollY); // boundingBox is relative to the window
  await page.screenshot({
    path: shot('12-guide.png'),
    fullPage: true,
    clip: { x: guideBox.x, y: guideBox.y + scrollY, width: guideBox.width, height: Math.min(guideBox.height, 620) },
  });
  await page.evaluate(() => window.scrollTo(0, 0));

  await submitPrompt(page, 'make the heading calmer');
  await trackWork(page);
  await page.waitForTimeout(300);
  await page.locator('.app__column--controls').screenshot({ path: shot('07-history-two.png') });

  await page.click('.lang__btn[lang="el"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('08-greek.png') });
  await page.click('.lang__btn[lang="en"]');

  await page.click('.app__new-page');
  await submitPrompt(page, 'BREAK this one');
  await trackWork(page);
  await page.waitForSelector('.app__error');
  await page.screenshot({ path: shot('09-error.png') });

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await phone.newPage();
  await mobile.goto(`${harness.appUrl}/?p=P01`);
  await submitPrompt(mobile, 'CLEAN yoga studio page');
  await trackWork(mobile);
  await mobile.waitForSelector('iframe.live-preview__frame');
  await mobile.waitForTimeout(500);
  await mobile.evaluate(() => window.scrollTo(0, 0)); // the form was scrolled into view by the typing
  await mobile.screenshot({ path: shot('10-mobile.png') });

  console.log(`Screenshots written to ${outDir}`);
} finally {
  await browser.close();
  await harness.stop();
}
