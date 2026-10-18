// The language of the GENERATED site, decided in code from the user's request, because the
// prompt rule "write in the same language as the request" was not followed: on the first real
// Claude Sonnet 5 calls (2026-10-18) English requests came back in Italian ("Fotografa
// Freelance") and Spanish ("Horario de Clases", an address in Madrid), while Greek requests
// stayed Greek. Haiku 4.5 had always followed the rule.
//
//   'el'  - the request contains Greek letters
//   'en'  - the request contains common English function words ("the", "for", "with", ...),
//           which other Latin-script languages do not use
//   null  - anything else (e.g. French or German): the model keeps the old rule

const ENGLISH_WORDS = /(?<![\p{L}])(?:the|for|with|and|my|our|of|to|about|that|showing|listing|including|where|which|some|this)(?![\p{L}])/iu;

export function requestLanguage(request) {
  const text = String(request ?? '');
  if (/[Ͱ-Ͽ]/.test(text)) return 'el';
  if (ENGLISH_WORDS.test(text)) return 'en';
  return null;
}

const NAMES = { el: 'Greek (Ελληνικά)', en: 'English' };

// The language line added to the generation messages (plan and every page).
export function siteLanguageNote(request) {
  const lang = requestLanguage(request);
  return lang
    ? `Language: write ALL visible text of the website in ${NAMES[lang]}, the language of the request. Invented names, addresses and phone numbers must also fit a business that writes in ${NAMES[lang]}.`
    : 'Language: write all visible text of the website in the same language as the request.';
}

// The language line of the design call (rationale and replacement guide).
export function designLanguageNote(request) {
  const lang = requestLanguage(request);
  const fields =
    'summary, audience, colour names and reasons, typography, layout, conversion, and the what/where/replaceWith of every placeholder';
  return lang
    ? `Write ALL text values (${fields}) in ${NAMES[lang]}. Keep "searchText" exactly as it appears in the code.`
    : 'Write all text values in the same language as the request. Keep "searchText" exactly as it appears in the code.';
}
