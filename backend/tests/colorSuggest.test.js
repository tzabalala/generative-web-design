import { parseHex, contrastRatio, nearestPassingShade, passingOptions } from '../src/validation/colorSuggest.js';

const ratio = (a, b) => contrastRatio(parseHex(a), parseHex(b));

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(ratio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(ratio('#ff0000', '#1a1a1a')).toBeCloseTo(4.35, 1); // the real failing pair
    expect(ratio('#ffffff', '#ff0000')).toBeCloseTo(3.99, 1);
  });
});

describe('parseHex', () => {
  it('accepts #rrggbb only', () => {
    expect(parseHex('#FF0080')).toEqual([255, 0, 128]);
    for (const bad of ['#fff', 'red', '#ff00', 'rgb(1,2,3)', undefined, null]) expect(parseHex(bad)).toBeNull();
  });
});

describe('nearestPassingShade', () => {
  it('lightens a red used as text on a dark card, and the result really passes', () => {
    const fix = nearestPassingShade('#ff0000', '#1a1a1a', 4.5);
    expect(fix.ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio(fix.hex, '#1a1a1a')).toBeGreaterThanOrEqual(4.5);
    expect(parseHex(fix.hex)[1]).toBeGreaterThan(0); // lighter than pure red
  });

  it('darkens a red used as the background of white text, and the result really passes', () => {
    const fix = nearestPassingShade('#ff0000', '#ffffff', 4.5);
    expect(ratio(fix.hex, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(parseHex(fix.hex)[0]).toBeLessThan(255); // darker than pure red
  });

  it('keeps the hue: a blue stays blue-ish', () => {
    const [r, , b] = parseHex(nearestPassingShade('#3366ff', '#ffffff', 4.5).hex);
    expect(b).toBeGreaterThan(r);
  });

  it('is nearly a no-op for a colour that is almost passing', () => {
    const fix = nearestPassingShade('#d4422f', '#f9f7f4', 4.5); // 4.25:1 in a real run
    expect(fix.ratio).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(parseHex(fix.hex)[0] - 0xd4)).toBeLessThan(40);
  });

  it('returns null for colours it cannot read', () => {
    expect(nearestPassingShade('red', '#fff', 4.5)).toBeNull();
  });
});

describe('passingOptions', () => {
  it('offers both a text colour and a background colour that pass', () => {
    const text = passingOptions('#ffffff', '#ff0000', 4.5);
    expect(text).toMatch(/^passing options: text colour #[0-9a-f]{6} \(\d\.\d+:1\) or background #[0-9a-f]{6} \(\d\.\d+:1\)$/);
  });

  it('is empty when the colours cannot be read', () => {
    expect(passingOptions('transparent', '#fff', 4.5)).toBe('');
  });
});
