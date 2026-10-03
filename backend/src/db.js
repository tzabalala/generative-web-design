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

  -- Append-only study/cost log (see studyLog.js). Never updated, never deleted by the app.
  CREATE TABLE IF NOT EXISTS events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ts               INTEGER NOT NULL,   -- when the request finished (ms since epoch)
    kind             TEXT NOT NULL,      -- generate | refine | undo
    session_id       TEXT,
    participant      TEXT,               -- anonymous code from ?p=P03, or NULL
    status           TEXT NOT NULL,      -- ok | error | limit | noop
    http_status      INTEGER,
    error_code       TEXT,
    duration_ms      INTEGER,            -- how long the server needed for this request
    model            TEXT,               -- Claude model that produced the result
    from_cache       INTEGER,            -- 1 = served from the cache, no Claude call
    prompt           TEXT,
    attempts         INTEGER,            -- automatic fix attempts used (0 = clean first try)
    passed           INTEGER,            -- 1 = final result passed every check
    remaining_issues INTEGER,
    initial_issues   INTEGER,            -- issues found in the raw generation, before any fix
    input_tokens     INTEGER,
    output_tokens    INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_events_session ON events (session_id);
`;

// Columns added after the first release. CREATE TABLE IF NOT EXISTS does not touch an
// existing table, so a database created by an older version needs these added in place
// (existing rows are kept).
const COLUMN_MIGRATIONS = [{ table: 'sessions', column: 'participant', ddl: 'TEXT' }];

function columnExists(conn, table, column) {
  return conn.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

export function migrate(conn) {
  for (const { table, column, ddl } of COLUMN_MIGRATIONS) {
    if (!columnExists(conn, table, column)) {
      conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
  }
}

let db = null;

export function getDb() {
  if (!db) {
    const path = resolveDbPath();
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(SCHEMA);
    migrate(db);
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
