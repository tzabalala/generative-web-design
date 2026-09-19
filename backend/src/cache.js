import { createHash } from 'crypto';
import { getDb } from './db.js';
import { PROMPT_VERSION } from './promptEngineering.js';

// Step 11: cache of (prompt+context) -> (validated result) pairs. Before every call to
// Claude we check whether a cached result already exists.
//
// It is now PERSISTENT (SQLite) and survives server restarts. That is why the key
// includes PROMPT_VERSION: when the prompts change, old answers (built with different
// instructions) stop matching and are never served again.
//
// Note: undo does NOT read from here; it reads the session's history.

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
