// Cleaning/validation of the "extras" Claude returns besides html/css: the design
// rationale (marketing reasoning) and the dummy-data replacement guide. Tolerant of
// incomplete answers — a broken rationale must never prevent the page from being delivered.
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

// searchText must appear VERBATIM in the code, otherwise the user would Ctrl+F for
// something that does not exist. If it is not found we blank it (keeping the rest of
// the instruction).
// `parts` is all the code a snippet may come from (for a site: every page and the stylesheets).
export function normalizePlaceholders(raw, ...parts) {
  if (!Array.isArray(raw)) return [];
  const haystack = parts.join('\n');

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
