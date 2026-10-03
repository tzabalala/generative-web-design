import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';
import { getDb, closeDb } from '../src/db.js';
import { createSession, getSession } from '../src/sessionStore.js';
import { logEvent } from '../src/studyLog.js';

// A database file created by the FIRST release of the app: no `participant` column on
// sessions and no `events` table. Opening it with the current code must upgrade it in
// place and keep every existing row (this is exactly what happens on the student's laptop).
const dbFile = join(tmpdir(), `gaw-legacy-${randomUUID()}.sqlite`);

beforeAll(() => {
  const legacy = new DatabaseSync(dbFile);
  legacy.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      iteration_count INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      position INTEGER NOT NULL, prompt TEXT NOT NULL, html TEXT NOT NULL, css TEXT NOT NULL,
      validation TEXT, rationale TEXT, placeholders TEXT, created_at INTEGER NOT NULL,
      UNIQUE (session_id, position)
    );
    CREATE TABLE cache (key TEXT PRIMARY KEY, result TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);
  legacy.prepare('INSERT INTO sessions (id, iteration_count, created_at) VALUES (?, 3, ?)').run('old-session', 1);
  legacy
    .prepare('INSERT INTO history (session_id, position, prompt, html, css, created_at) VALUES (?, 0, ?, ?, ?, 1)')
    .run('old-session', 'old prompt', '<p>old</p>', 'p{}');
  legacy.close();

  process.env.DB_PATH = dbFile;
});

afterAll(() => {
  closeDb();
  delete process.env.DB_PATH;
  for (const suffix of ['', '-wal', '-shm']) rmSync(dbFile + suffix, { force: true });
});

describe('opening a database created by an older version', () => {
  it('adds the missing column and table without losing existing data', () => {
    const conn = getDb();

    const columns = conn.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
    expect(columns).toContain('participant');
    const tables = conn.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name);
    expect(tables).toContain('events');

    const old = getSession('old-session');
    expect(old.iterationCount).toBe(3);
    expect(old.participant).toBeNull();
    expect(old.history[0].prompt).toBe('old prompt');
  });

  it('works normally afterwards: new sessions can carry a participant, events can be logged', () => {
    const id = createSession('P09');
    expect(getSession(id).participant).toBe('P09');

    logEvent({ kind: 'generate', status: 'ok', sessionId: id, participant: 'P09', prompt: 'after migration' });
    const row = getDb().prepare('SELECT * FROM events WHERE session_id = ?').get(id);
    expect(row.participant).toBe('P09');
  });

  it('is safe to open the same file again (the migration is idempotent)', () => {
    closeDb();
    expect(() => getDb()).not.toThrow();
    expect(getSession('old-session').iterationCount).toBe(3);
  });
});
