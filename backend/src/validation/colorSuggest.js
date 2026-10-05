// Colour maths for the contrast fixes. When axe-core reports that a text colour is too close to
// its background, this finds the NEAREST colour (same hue and saturation, only the lightness
// changes) that reaches the required ratio, for the text and for the background separately.
//
// Why: in a real run the same pure red (#ff0000) was used as text on a near-black card (needs a
// LIGHTER red) and as the background of white text (needs a DARKER red). Claude moved the one
// colour back and forth for three attempts. With a ready, verified colour for each pair it can
// change each rule on its own.

const HEX = /^#([0-9a-f]{6})$/i;

export function parseHex(hex) {
  const m = typeof hex === 'string' ? hex.match(HEX) : null;
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

function luminance([r, g, b]) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function rgbToHsl([r, g, b]) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue = (p, q, t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
}

// The closest shade of `colorHex` (lighter or darker, whichever is nearer) whose contrast against
// `otherHex` is at least `target` (a little extra margin is added). Returns { hex, ratio } or null
// when either input is not a plain #rrggbb colour or no shade can reach the target.
export function nearestPassingShade(colorHex, otherHex, target) {
  const color = parseHex(colorHex);
  const other = parseHex(otherHex);
  if (!color || !other || !Number.isFinite(target)) return null;
  const goal = target + 0.2;
  const [h, s, l] = rgbToHsl(color);

  let best = null;
  for (const direction of [1, -1]) {
    for (let step = 1; step <= 100; step += 1) {
      const nl = l + (direction * step) / 100;
      if (nl < 0 || nl > 1) break;
      const rgb = hslToRgb([h, s, nl]);
      const ratio = contrastRatio(rgb, other);
      if (ratio >= goal) {
        if (!best || step < best.step) best = { step, hex: toHex(rgb), ratio: Math.round(ratio * 100) / 100 };
        break;
      }
    }
  }
  return best ? { hex: best.hex, ratio: best.ratio } : null;
}

// One sentence for the fix request: the passing options for the text and for the background.
export function passingOptions(fgHex, bgHex, required) {
  const text = nearestPassingShade(fgHex, bgHex, required);
  const background = nearestPassingShade(bgHex, fgHex, required);
  const parts = [];
  if (text) parts.push(`text colour ${text.hex} (${text.ratio}:1)`);
  if (background) parts.push(`background ${background.hex} (${background.ratio}:1)`);
  return parts.length ? `passing options: ${parts.join(' or ')}` : '';
}
