import { requestedScope } from '../src/pageScope.js';
import { PROMPTS } from '../scripts/benchmark.js';

describe('requestedScope', () => {
  it('reads explicit one-page requests as one page, in English and Greek', () => {
    expect(requestedScope('a one-page portfolio for a photographer, with a gallery')).toBe('one');
    expect(requestedScope('A single page for my CV')).toBe('one');
    expect(requestedScope('Μια πρόσκληση γάμου σε μία σελίδα με τον χώρο')).toBe('one');
    expect(requestedScope('a one-page site for a bakery')).toBe('one'); // "one-page" wins over "site"
  });

  it('reads a request whose subject is a page as one page, even when it lists several parts', () => {
    // the cases that were planned as 2 to 4 pages in the 35-prompt benchmark of 2026-10-18
    expect(requestedScope('a contact page for a small bakery, with a form and opening hours')).toBe('one');
    expect(requestedScope('a restaurant homepage with a menu section and a reservation form')).toBe('one');
    expect(requestedScope('a hair salon page with services, prices, and an online booking button')).toBe('one');
    expect(requestedScope('a landing page for a small coffee roastery with a shop section')).toBe('one');
    expect(requestedScope('a real-estate agency page listing three properties with photos and prices')).toBe('one');
    expect(requestedScope('η σελίδα ενός φωτογράφου γάμων με γκαλερί και φόρμα επικοινωνίας')).toBe('one');
    expect(requestedScope('η αρχική σελίδα ενός γυμναστηρίου με προγράμματα συνδρομής')).toBe('one');
  });

  it('reads requests for a website or several pages as a site', () => {
    expect(requestedScope('a website for a local yoga studio')).toBe('site');
    expect(requestedScope('a conference website with a speaker list')).toBe('site');
    expect(requestedScope('a site for my dental clinic')).toBe('site');
    expect(requestedScope('three pages for my bakery: home, menu and contact')).toBe('site');
    expect(requestedScope('ένας ιστότοπος για ένα οδοντιατρείο, με υπηρεσίες')).toBe('site');
    expect(requestedScope('δύο σελίδες για το συνεργείο μου')).toBe('site');
  });

  it('leaves the decision to the model when nothing is clear', () => {
    // "a contact page" is part of what is asked for, not the thing asked for
    expect(requestedScope('A portfolio for a freelance photographer with a gallery and a contact page')).toBe('open');
    expect(requestedScope('Ένα portfolio για έναν ελεύθερο φωτογράφο με γκαλερί και σελίδα επικοινωνίας')).toBe('open');
    expect(requestedScope('something for my bakery')).toBe('open');
    expect(requestedScope('')).toBe('open');
    expect(requestedScope(undefined)).toBe('open');
  });

  it('does not treat words that only contain "site" or "page" as those words', () => {
    expect(requestedScope('a bakery opposite the station')).toBe('open'); // "opposite"
    expect(requestedScope('a pageant for the village')).toBe('open'); // "pageant"
  });

  it('reads the benchmark list as intended: 29 one-page requests and 6 websites', () => {
    const scopes = PROMPTS.map(requestedScope);
    expect(scopes.filter((s) => s === 'one')).toHaveLength(29);
    expect(scopes.filter((s) => s === 'site')).toHaveLength(6);
    expect(scopes[12]).toBe('site'); // "a conference website ..."
    expect(scopes.slice(30)).toEqual(['site', 'site', 'site', 'site', 'site']);
  });
});
