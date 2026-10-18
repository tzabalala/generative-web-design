// How many pages does a request ask for? Decided in code, before the plan call, because the
// prompt rule alone was not followed: in the 35-prompt benchmark (2026-10-18) 8 of the 29
// requests worded as ONE page ("a contact page for a small bakery", "a restaurant homepage
// with a menu ...", even "a landing page for ...") were planned as sites of 2 to 4 pages, and
// sites of several pages failed the checks far more often (50% passing against 95%).
//
//   'one'  - the request is for one page: an explicit "one-page"/"single page", or the thing
//            asked for (the words before "with", "for", ...) is a page, homepage or landing page
//   'site' - it asks for a website, a site, or several pages
//   'open' - nothing clear (for example "a portfolio with a gallery and a contact page"):
//            the model decides, as before
//
// English and Greek. Greek letters are not "word" characters for \b, so word edges are
// written with Unicode letter look-arounds.

const word = (alternatives) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'iu');

const ONE_PAGE = word(
  'one[- ]page|single[- ]page|onepage|μία σελίδα|μια σελίδα|μιας σελίδας|μίας σελίδας|μονοσέλιδ\\p{L}*'
);
const SITE = word(
  'web ?sites?|sites?|pages|multi[- ]page|ιστότοπ\\p{L}*|ιστοτόπ\\p{L}*|ιστοχώρ\\p{L}*|σελίδες|σελίδων'
);
const PAGE = word('page|homepage|home page|landing page|σελίδα|σελίδας|αρχική');

// The head of the request: the words before the first "with", "for", "that", a comma, ...
// ("a restaurant homepage" | "with a menu section and a reservation form").
const HEAD_END = word('with|for|that|which|listing|explaining|including|where|showing|featuring|με|για|που|όπου');

export function requestedScope(request) {
  const text = String(request ?? '');
  if (ONE_PAGE.test(text)) return 'one';
  if (SITE.test(text)) return 'site';
  const end = text.search(/[,;:]/);
  const headEnd = text.search(HEAD_END);
  const cut = [end, headEnd].filter((i) => i >= 0);
  const head = cut.length ? text.slice(0, Math.min(...cut)) : text;
  return PAGE.test(head) ? 'one' : 'open';
}
