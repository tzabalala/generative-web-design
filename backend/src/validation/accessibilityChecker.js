import { createRequire } from 'module';
import { withPage } from './browserManager.js';

const require = createRequire(import.meta.url);
const axeCorePath = require.resolve('axe-core');

function buildFullPage(html, css) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Preview</title>
<style>${css}</style>
</head>
<body>${html}</body>
</html>`;
}

// Βήμα 8: axe-core τρέχει πάνω σε headless browser (Playwright) που φορτώνει
// το HTML και εκτελεί τον accessibility έλεγχο. ΔΕΝ χρειάζεται κλήση API.
export async function checkAccessibility(html, css) {
  const fullPage = buildFullPage(html, css);

  return withPage(async (page) => {
    await page.setContent(fullPage, { waitUntil: 'load' });
    await page.addScriptTag({ path: axeCorePath });
    const results = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      return await axe.run();
    });

    const violations = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      nodeCount: v.nodes.length,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));

    return {
      passed: violations.length === 0,
      violations,
    };
  });
}
