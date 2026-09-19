import { createHash } from 'crypto';
import { getDb } from './db.js';
import { PROMPT_VERSION } from './promptEngineering.js';

// Βήμα 11: cache ζευγών (prompt+context) -> (ελεγμένο αποτέλεσμα). Πριν από
// κάθε κλήση στο Claude ελέγχεται αν υπάρχει ήδη cached αποτέλεσμα.
//
// Πλέον είναι ΜΟΝΙΜΟ (SQLite): επιζεί των restart του server. Γι' αυτό το κλειδί
// περιλαμβάνει το PROMPT_VERSION: όταν αλλάξουν τα prompts, οι παλιές απαντήσεις
// (φτιαγμένες με άλλες οδηγίες) παύουν να ταιριάζουν και δεν σερβίρονται ξανά.
//
// Σημείωση: το undo ΔΕΝ διαβάζει από εδώ· διαβάζει το history του session.

function normalize(text) {
  return text.trim().replace(/\s+/g, ' ');
}

const hash = (s) => createHash('sha256').update(`${PROMPT_VERSION}:${s}`).digest('hex');

export function generateCacheKey(prompt) {
  return hash(`generate:${normalize(prompt)}`);
}

export function refineCacheKey(currentHtml, currentCss, instruction) {
  return hash(
    `refine:${normalize(currentHtml)}::${normalize(currentCss)}::${normalize(instruction)}`
  );
}

export function getCached(key) {
  const row = getDb().prepare('SELECT result FROM cache WHERE key = ?').get(key);
  return row ? JSON.parse(row.result) : undefined;
}

export function setCached(key, value) {
  getDb()
    .prepare('INSERT OR REPLACE INTO cache (key, result, created_at) VALUES (?, ?, ?)')
    .run(key, JSON.stringify(value), Date.now());
}
