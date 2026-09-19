import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Persistent storage (SQLite, a single file). Uses Node's built-in node:sqlite
// (no external package / C++ compilation).
//   - Production/development: backend/data/app.sqlite  (not in git, see .gitignore)
//   - Tests: memory (:memory:) so they never write to the real file
//   - Override: the DB_PATH environment variable
const here = dirname(fileURLToPath(import.meta.url));

function resolveDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  if (process.env.NODE_ENV === 'test') return ':memory:';
  return resolve(here, '../data/app.sqlite');
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id             TEXT PRIMARY KEY,
    iteration_count INTEGER NOT NULL DEFAULT 0,
    input_tokens   INTEGER NOT NULL DEFAULT 0,
    output_tokens  INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,
    prompt       TEXT NOT NULL,
    html         TEXT NOT NULL,
    css          TEXT NOT NULL,
    validation   TEXT,
    rationale    TEXT,
    placeholders TEXT,
    created_at   INTEGER NOT NULL,
    UNIQUE (session_id, position)
  );

  CREATE TABLE IF NOT EXISTS cache (
    key        TEXT PRIMARY KEY,
    result     TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`;

let db = null;

export function getDb() {
  if (!db) {
    const path = resolveDbPath();
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(SCHEMA);
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

// Runs fn inside a transaction: either all changes are applied or none.
export function transaction(fn) {
  const conn = getDb();
  conn.exec('BEGIN');
  try {
    const result = fn(conn);
    conn.exec('COMMIT');
    return result;
  } catch (err) {
    conn.exec('ROLLBACK');
    throw err;
  }
}
