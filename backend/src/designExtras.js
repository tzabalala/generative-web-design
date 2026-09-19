// Καθαρισμός/επικύρωση των "extras" που επιστρέφει το Claude πέρα από html/css:
// το design rationale (marketing σκεπτικό) και ο οδηγός αντικατάστασης dummy
// δεδομένων. Είναι ΑΝΟΧΗ σε ελλιπή απάντηση — ένα σπασμένο rationale δεν πρέπει
// ποτέ να αποτρέψει την παράδοση της σελίδας.
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const MAX_COLORS = 8;
const MAX_PLACEHOLDERS = 30;

const str = (v) => (typeof v === 'string' ? v.trim() : '');

export function normalizeRationale(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const colors = (Array.isArray(raw.colors) ? raw.colors : [])
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({
      hex: HEX.test(str(c.hex)) ? str(c.hex) : null,
      name: str(c.name),
      why: str(c.why),
    }))
    .filter((c) => c.hex || c.name || c.why)
    .slice(0, MAX_COLORS);

  const rationale = {
    summary: str(raw.summary),
    audience: str(raw.audience),
    colors,
    typography: str(raw.typography),
    layout: str(raw.layout),
    conversion: str(raw.conversion),
  };

  const hasContent =
    colors.length > 0 ||
    rationale.summary ||
    rationale.audience ||
    rationale.typography ||
    rationale.layout ||
    rationale.conversion;
  return hasContent ? rationale : null;
}

// Το searchText πρέπει να υπάρχει ΑΥΤΟΥΣΙΟ στον κώδικα, αλλιώς ο χρήστης θα ψάχνει
// στο Ctrl+F κάτι που δεν υπάρχει. Αν δεν βρεθεί, το αφήνουμε κενό (κρατάμε την
// υπόλοιπη οδηγία).
export function normalizePlaceholders(raw, html, css) {
  if (!Array.isArray(raw)) return [];
  const haystack = `${html}\n${css}`;

  return raw
    .filter((p) => p && typeof p === 'object')
    .map((p) => {
      const searchText = str(p.searchText);
      return {
        what: str(p.what),
        where: str(p.where),
        searchText: searchText && haystack.includes(searchText) ? searchText : '',
        replaceWith: str(p.replaceWith),
      };
    })
    .filter((p) => p.what)
    .slice(0, MAX_PLACEHOLDERS);
}
