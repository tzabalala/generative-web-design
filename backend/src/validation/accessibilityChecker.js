import { createRequire } from 'module';
import { withPage } from './browserManager.js';

const require = createRequire(import.meta.url);
const axeCorePath = require.resolve('axe-core');

// `css` is either one string, or a list of { name, css } parts (for a website: the shared
// stylesheet and the page's own rules). Each part becomes its own <style> element, so the
// checker can tell Claude WHERE a colour comes from ("the shared css", "this page's css").
function buildFullPage(html, css) {
  const parts = typeof css === 'string' ? [{ name: 'css', css }] : css;
  const styles = parts
    .map((p) => `<style data-source="${String(p.name).replace(/"/g, '')}">${p.css}</style>`)
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Preview</title>
${styles}
</head>
<body>${html}</body>
</html>`;
}

// Runs INSIDE the browser page. For an element that failed the contrast check, finds the CSS
// rules that set its text colour and its background colour (looking at the element itself and
// then at its ancestors, because both are inherited visually), and says which stylesheet each
// rule is in. A bare "contrast too low" made Claude fix the wrong place in a real run: the
// colour came from a rule in the shared stylesheet that beat the override it added on the page.
function explainColorSources({ selectors, props }) {
  const describe = [];

  const rulesOf = (sheet) => {
    const found = [];
    const walk = (list) => {
      for (const rule of list) {
        if (rule.cssRules && rule.media) {
          let applies = false;
          try {
            applies = window.matchMedia(rule.media.mediaText).matches;
          } catch {
            applies = false;
          }
          if (applies) walk(rule.cssRules);
        } else if (rule.selectorText && rule.style) {
          found.push(rule);
        }
      }
    };
    try {
      walk(sheet.cssRules);
    } catch {
      /* a sheet that cannot be read is skipped */
    }
    return found;
  };

  const sheets = [...document.styleSheets].map((sheet) => ({
    source: (sheet.ownerNode && sheet.ownerNode.getAttribute('data-source')) || 'css',
    rules: rulesOf(sheet),
  }));

  // The LAST matching declaration of a property wins in a simple case; the output lists the
  // last two so Claude sees both the winner and what it may be fighting.
  const settersOf = (el, prop) => {
    const out = [];
    for (const { source, rules } of sheets) {
      for (const rule of rules) {
        let matches = false;
        try {
          matches = el.matches(rule.selectorText);
        } catch {
          matches = false;
        }
        const value = matches ? rule.style.getPropertyValue(prop) : '';
        if (value) out.push(`${prop}: ${value.trim()} in the ${source}, rule "${rule.selectorText.trim()}"`);
      }
    }
    return out.slice(-2);
  };

  const climb = (el, prop) => {
    for (let node = el, depth = 0; node && depth < 6; node = node.parentElement, depth += 1) {
      const setters = settersOf(node, prop);
      if (setters.length) return setters;
    }
    return [];
  };

  for (const selector of selectors) {
    let el = null;
    try {
      el = document.querySelector(selector);
    } catch {
      el = null;
    }
    if (!el) continue;
    const lines = props.flatMap((prop) => climb(el, prop));
    if (lines.length) describe.push(`${selector} -> ${lines.join(' | ')}`);
  }
  return describe;
}

// Step 8: axe-core runs on a headless browser (Playwright) that loads the HTML and
// performs the accessibility check. No API call needed.
export async function checkAccessibility(html, css) {
  const fullPage = buildFullPage(html, css);

  return withPage(async (page) => {
    await page.setContent(fullPage, { waitUntil: 'load' });
    await page.addScriptTag({ path: axeCorePath });
    const results = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      return await axe.run();
    });

    // For a colour-contrast violation axe also knows the real colours and the ratio. Handing
    // these to Claude in the fix request is what lets it pick a colour that really passes.
    const contrastDetails = (nodes) => {
      const seen = new Set();
      for (const n of nodes) {
        for (const check of [...n.any, ...n.all, ...n.none]) {
          const d = check.data;
          if (d && d.fgColor && d.bgColor && d.contrastRatio) {
            seen.add(`text ${d.fgColor} on ${d.bgColor} is ${d.contrastRatio}:1, needs ${d.expectedContrastRatio}`);
          }
        }
        if (seen.size >= 4) break;
      }
      return [...seen].slice(0, 4);
    };

    const violations = [];
    for (const v of results.violations) {
      const targets = v.nodes.slice(0, 5).map((n) => n.target.join(' '));
      const details = v.id === 'color-contrast' ? contrastDetails(v.nodes) : [];
      if (v.id === 'color-contrast') {
        const sources = await page
          .evaluate(explainColorSources, {
            selectors: v.nodes.slice(0, 3).map((n) => n.target[n.target.length - 1]),
            props: ['color', 'background-color'], // longhand also covers a `background:` shorthand
          })
          .catch(() => []);
        details.push(...sources.map((s) => `where the colours are set: ${s}`));
      }
      violations.push({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        nodeCount: v.nodes.length,
        targets,
        details,
      });
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  });
}
