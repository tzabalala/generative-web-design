import { normalizeRationale, normalizePlaceholders } from '../src/designExtras.js';

describe('normalizeRationale', () => {
  it('keeps well-formed fields and trims strings', () => {
    const r = normalizeRationale({
      summary: '  Ζεστή, οικεία εικόνα  ',
      audience: 'Ντόπιοι',
      colors: [{ hex: '#1A2B3C', name: 'Navy', why: 'Εμπιστοσύνη' }],
      typography: 'Serif',
      layout: 'Hero πρώτα',
      conversion: 'Κουμπί κράτησης',
    });
    expect(r.summary).toBe('Ζεστή, οικεία εικόνα');
    expect(r.colors).toEqual([{ hex: '#1A2B3C', name: 'Navy', why: 'Εμπιστοσύνη' }]);
  });

  it('returns null for missing/garbage input instead of throwing', () => {
    expect(normalizeRationale(undefined)).toBeNull();
    expect(normalizeRationale('text')).toBeNull();
    expect(normalizeRationale([])).toBeNull();
    expect(normalizeRationale({})).toBeNull();
  });

  it('nulls out an invalid hex so it can never be used as a CSS value', () => {
    const r = normalizeRationale({
      colors: [{ hex: 'red; background:url(x)', name: 'Bad', why: 'x' }],
    });
    expect(r.colors[0].hex).toBeNull();
  });

  it('caps the number of colours', () => {
    const colors = Array.from({ length: 20 }, (_, i) => ({ hex: '#000000', name: `c${i}`, why: 'x' }));
    expect(normalizeRationale({ colors }).colors).toHaveLength(8);
  });
});

describe('normalizePlaceholders', () => {
  const html = '<h1>Cinema Astra</h1><img src="https://example.com/a.jpg" alt="x">';

  it('keeps searchText only when it appears verbatim in the code', () => {
    const list = normalizePlaceholders(
      [
        { what: 'Όνομα', where: 'Τίτλος', searchText: 'Cinema Astra', replaceWith: 'Το όνομά σου' },
        { what: 'Τηλέφωνο', where: 'Footer', searchText: '210 1234567', replaceWith: 'Το τηλέφωνό σου' },
      ],
      html,
      ''
    );
    expect(list[0].searchText).toBe('Cinema Astra');
    expect(list[1].searchText).toBe('');
    expect(list[1].what).toBe('Τηλέφωνο');
  });

  it('drops entries with no "what" and tolerates non-arrays', () => {
    expect(normalizePlaceholders([{ where: 'x' }, null, 'str'], html, '')).toEqual([]);
    expect(normalizePlaceholders(undefined, html, '')).toEqual([]);
  });
});
