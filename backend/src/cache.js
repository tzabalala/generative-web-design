import { createHash } from 'crypto';
import { getDb } from './db.js';
import { PROMPT_VERSION } from './promptEngineering.js';
import { resolveModel } from './config.js';
import { siteFingerprint } from './site.js';

// Step 11: cache of (prompt+context) -> (validated result) pairs. Before every call to
// Claude we check whether a cached result already exists.
//
// It is PERSISTENT (SQLite) and survives server restarts, so the key must change whenever
// an old answer would no longer be valid:
//   - PROMPT_VERSION: bumped when the prompts OR the validation rules change;
//   - the model id: a page written by Haiku must never be served as if Sonnet wrote it
//     (this matters for the Haiku vs Sonnet comparison and for the final demo).
//
// Note: undo does NOT read from here; it reads the session's history.

function normalize(text) {
  return text.trim().replace(/\s+/g, ' ');
}

const hash = (s) =>
  createHash('sha256').update(`${PROMPT_VERSION}:${resolveModel()}:${s}`).digest('hex');

export function generateCacheKey(prompt) {
  return hash(`generate:${normalize(prompt)}`);
}

// The page the user was looking at is part of the key: it is a hint that can change which
// page Claude edits, so two different hints must not share an answer.
export function refineCacheKey(site, instruction, currentPage = '') {
  return hash(`refine:${siteFingerprint(site)}::${normalize(instruction)}::${currentPage ?? ''}`);
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
