import { randomUUID } from 'crypto';
import { getDb, transaction } from './db.js';

// Persistent session store (SQLite). Step 3 data model: each session has a history of
// (prompt, generated_code, validation_result) triples, now together with the design
// rationale and the dummy-data guide. It also keeps the iteration counter
// (Step 12: rate limiting) and the total token usage.
//
// WARNING: getSession() returns a SNAPSHOT, not a live object. To get the updated
// counter after a change, use the value returned by addHistoryEntry().

const toJson = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
const fromJson = (s, fallback) => (s === null || s === undefined ? fallback : JSON.parse(s));

function rowToEntry(r) {
  return {
    prompt: r.prompt,
    html: r.html,
    css: r.css,
    validation: fromJson(r.validation, null),
    rationale: fromJson(r.rationale, null),
    placeholders: fromJson(r.placeholders, []),
  };
}

export function createSession() {
  const id = randomUUID();
  getDb().prepare('INSERT INTO sessions (id, created_at) VALUES (?, ?)').run(id, Date.now());
  return id;
}

export function getSession(id) {
  const db = getDb();
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!s) return undefined;

  const rows = db
    .prepare('SELECT * FROM history WHERE session_id = ? ORDER BY position')
    .all(id);

  return {
    history: rows.map(rowToEntry),
    iterationCount: s.iteration_count,
    totalUsage: { inputTokens: s.input_tokens, outputTokens: s.output_tokens },
  };
}

export function addHistoryEntry(id, entry) {
  transaction((db) => {
    if (!db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(id)) {
      throw new Error(`Unknown session: ${id}`);
    }

    const { next } = db
      .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM history WHERE session_id = ?')
      .get(id);

    db.prepare(
      `INSERT INTO history
         (session_id, position, prompt, html, css, validation, rationale, placeholders, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      next,
      entry.prompt,
      entry.html,
      entry.css,
      toJson(entry.validation),
      toJson(entry.rationale),
      toJson(entry.placeholders ?? []),
      Date.now()
    );

    db.prepare(
      `UPDATE sessions
         SET iteration_count = iteration_count + 1,
             input_tokens    = input_tokens + ?,
             output_tokens   = output_tokens + ?
       WHERE id = ?`
    ).run(entry.usage?.inputTokens ?? 0, entry.usage?.outputTokens ?? 0, id);
  });

  return getSession(id);
}

// Step 15 (Undo): goes back to the previous, already-generated version from the
// history — no new API call. The iteration counter is NOT decremented (otherwise the
// limit could be bypassed with refine → undo → refine → undo...).
export function undoLastEntry(id) {
  return transaction((db) => {
    if (!db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(id)) {
      throw new Error(`Unknown session: ${id}`);
    }

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM history WHERE session_id = ?').get(id);
    if (n <= 1) return null; // nothing older to undo to

    db.prepare(
      `DELETE FROM history
        WHERE session_id = ?
          AND position = (SELECT MAX(position) FROM history WHERE session_id = ?)`
    ).run(id, id);

    const last = db
      .prepare('SELECT * FROM history WHERE session_id = ? ORDER BY position DESC LIMIT 1')
      .get(id);
    return rowToEntry(last);
  });
}
