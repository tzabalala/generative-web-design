import { pickSites, pageDocument } from '../scripts/expertReviewPack.js';

const row = (number, { pages = 1, language = 'en', passed = true, group = 'main' } = {}) => ({
  number,
  prompt: `request ${number}`,
  pages,
  language,
  group,
  before: { passed: false },
  after: { passed },
});

describe('pickSites', () => {
  it('picks one site of each kind, in list order, never the same site twice', () => {
    const rows = [
      row(1),
      row(2, { language: 'el' }),
      row(3, { pages: 4 }),
      row(4, { pages: 3, language: 'el' }),
      row(5, { pages: 5, passed: false }),
      row(6),
      row(36, { group: 'heldOut' }),
    ];
    const picks = pickSites(rows);
    expect(picks.map((p) => p.row.number)).toEqual([1, 2, 3, 4, 5, 36]);
    expect(picks[4].kind).toBe('still failing after the repairs');
  });

  it('fills missing kinds with other sites and skips rows that failed to run', () => {
    const rows = [row(1), { number: 2, error: 'credit balance is too low' }, row(3), row(4), row(5), row(6), row(7), row(8)];
    const picks = pickSites(rows);
    expect(picks).toHaveLength(6);
    expect(picks.map((p) => p.row.number)).not.toContain(2);
    expect(new Set(picks.map((p) => p.row.number)).size).toBe(6);
  });
});

describe('pageDocument', () => {
  it('writes a complete page that links the shared stylesheet, with the language of its content', () => {
    const en = pageDocument({ slug: 'about', title: 'About & us', html: '<main><h1>About</h1></main>', css: '.a{}' });
    expect(en).toMatch(/^<!DOCTYPE html>/);
    expect(en).toContain('<html lang="en">');
    expect(en).toContain('<title>About &amp; us</title>');
    expect(en).toContain('<link rel="stylesheet" href="style.css">\n<style>.a{}</style>');
    const el = pageDocument({ slug: 'index', title: '', html: '<main><h1>Καλώς ήρθατε</h1></main>', css: '' });
    expect(el).toContain('<html lang="el">');
    expect(el).toContain('<title>index</title>');
    expect(el).not.toContain('<style>');
  });
});
