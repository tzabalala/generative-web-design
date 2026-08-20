import { createHash } from 'crypto';

// Βήμα 11: cache ζευγών (prompt+context) -> (ελεγμένο αποτέλεσμα). Πριν από
// κάθε κλήση στο Claude ελέγχεται αν υπάρχει ήδη cached αποτέλεσμα. Το ίδιο
// cache χρησιμοποιείται και για undo/history (Βήμα 15) — καμία επιπλέον
// κλήση API όταν ο χρήστης γυρίζει σε προηγούμενη, ήδη-παραχθείσα έκδοση.
const cache = new Map();

function normalize(text) {
  return text.trim().replace(/\s+/g, ' ');
}

export function generateCacheKey(prompt) {
  return createHash('sha256').update(`generate:${normalize(prompt)}`).digest('hex');
}

export function refineCacheKey(currentHtml, currentCss, instruction) {
  return createHash('sha256')
    .update(`refine:${normalize(currentHtml)}::${normalize(currentCss)}::${normalize(instruction)}`)
    .digest('hex');
}

export function getCached(key) {
  return cache.get(key);
}

export function setCached(key, value) {
  cache.set(key, value);
}
