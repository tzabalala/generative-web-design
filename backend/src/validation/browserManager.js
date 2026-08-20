import { chromium } from 'playwright';

// Ένα μόνο headless browser instance, ξανά-χρησιμοποιούμενο σε όλα τα requests
// (πιο γρήγορο από το να ανοίγει/κλείνει browser σε κάθε κλήση validation).
let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

export async function withPage(fn) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    return await fn(page);
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}
