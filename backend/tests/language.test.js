import { requestedScope } from '../src/pageScope.js';
import { requestLanguage, siteLanguageNote, designLanguageNote } from '../src/language.js';
import { buildPlanMessages, buildPageMessages, buildDesignMessages } from '../src/promptEngineering.js';
import { planFor, siteFor } from './helpers/fakeClaude.js';

describe('requestLanguage', () => {
  it('reads Greek, English, and leaves other languages to the model', () => {
    expect(requestLanguage('μια σελίδα για ένα ζαχαροπλαστείο')).toBe('el');
    expect(requestLanguage('a landing page for a local yoga studio')).toBe('en');
    expect(requestLanguage('A portfolio with a gallery')).toBe('en');
    expect(requestLanguage('un site pour ma boulangerie, avec le menu')).toBe(null);
    expect(requestLanguage('eine Webseite für meine Bäckerei mit Öffnungszeiten')).toBe(null);
    expect(requestLanguage('')).toBe(null);
    // a Greek request that mentions an English word is still Greek
    expect(requestLanguage('ένα portfolio για έναν φωτογράφο with a gallery')).toBe('el');
  });

  it('does not take English words hidden inside other words', () => {
    expect(requestLanguage('una pagina per la mia pasticceria')).toBe(null); // "per", "la" are not English words
    expect(requestLanguage('tienda online')).toBe(null);
  });
});

describe('the language goes into every generation call', () => {
  // Sonnet 5 wrote English requests in Italian and Spanish when only asked for "the same language"
  it('the plan and every page say English for an English request, Greek for a Greek one', () => {
    const en = 'a landing page for a local yoga studio';
    const [planEn] = buildPlanMessages(en, { scope: requestedScope(en) });
    expect(planEn.content).toContain('in English');

    const el = 'μια σελίδα για ένα ζαχαροπλαστείο';
    const [planEl] = buildPlanMessages(el);
    expect(planEl.content).toContain('in Greek (Ελληνικά)');

    const plan = planFor(['index', 'about']);
    const [pageEn] = buildPageMessages(en, plan, plan.pages[1]);
    expect(pageEn.content).toContain('write ALL visible text of the website in English');
  });

  it('the design notes follow the same rule', () => {
    expect(designLanguageNote('a site for a dentist')).toContain('in English');
    expect(designLanguageNote('ένας ιστότοπος για οδοντίατρο')).toContain('in Greek (Ελληνικά)');
    expect(designLanguageNote('un site pour un dentiste')).toContain('same language as the request');
    const [design] = buildDesignMessages(siteFor(['index']), 'a site for a dentist');
    expect(design.content).toContain('in English');
  });

  it('an unclear language keeps the old "same language" rule', () => {
    expect(siteLanguageNote('un site pour ma boulangerie')).toContain('same language as the request');
  });
});
