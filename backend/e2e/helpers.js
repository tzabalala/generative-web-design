import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core');

// Runs axe-core on the tool's OWN interface (the same checker the tool applies to the pages
// it generates). `iframes: false` keeps axe out of the generated-page preview: that page is
// somebody else's content and has its own checks; here we judge the tool around it. The
// iframe element itself (its title, its role) is still checked.
export async function axeViolations(page) {
  const loaded = await page.evaluate(() => Boolean(window.axe));
  if (!loaded) await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const results = await axe.run(document, { iframes: false, resultTypes: ['violations'] });
    return results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));
  });
}

export async function submitPrompt(page, text) {
  await page.fill('#prompt-input', text);
  await page.click('.prompt-form__submit');
}

// Waits for the "working" status to appear and then follows it until it disappears,
// remembering every step text that was shown on the way. Returns the list of step texts.
export async function trackWork(page, { timeoutMs = 120000 } = {}) {
  await page.waitForSelector('.prompt-form__working', { state: 'attached', timeout: 15000 });
  const seen = [];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await page.locator('.prompt-form__working').count()) === 0) return seen;
    const text = await page
      .locator('.prompt-form__stage')
      .first()
      .textContent({ timeout: 100 })
      .catch(() => null);
    if (text && !seen.includes(text.trim())) seen.push(text.trim());
    await page.waitForTimeout(120);
  }
  throw new Error('The request did not finish in time');
}

export const currentSessionId = (page) => page.evaluate(() => localStorage.getItem('gaw.sessionId'));

export async function fetchSession(harness, sessionId) {
  const res = await fetch(`${harness.backendUrl}/api/session/${sessionId}`);
  return res.json();
}
