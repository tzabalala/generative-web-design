import { randomUUID } from 'crypto';
import { getDb, transaction } from './db.js';

// Μόνιμο session store (SQLite). Βήμα 3 data model: κάθε session έχει ένα history
// από (prompt, generated_code, validation_result) τριάδες, τώρα μαζί με το σκεπτικό
// σχεδιασμού και τον οδηγό dummy δεδομένων. Κρατάει επίσης το μετρητή iterations
// (Βήμα 12: rate limiting) και το συνολικό token usage.
//
// ΠΡΟΣΟΧΗ: το getSession() επιστρέφει ΣΤΙΓΜΙΟΤΥΠΟ, όχι ζωντανό αντικείμενο. Για τον
// ενημερωμένο μετρητή μετά από αλλαγή χρησιμοποίησε την τιμή που επιστρέφει το
// addHistoryEntry().

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

// Βήμα 15 (Undo): γυρίζει στην προηγούμενη, ήδη-παραχθείσα έκδοση από το
// history — καμία νέα κλήση API. Ο μετρητής iterations ΔΕΝ μειώνεται (αλλιώς
// το όριο θα παρακαμπτόταν με refine → undo → refine → undo...).
export function undoLastEntry(id) {
  return transaction((db) => {
    if (!db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(id)) {
      throw new Error(`Unknown session: ${id}`);
    }

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM history WHERE session_id = ?').get(id);
    if (n <= 1) return null; // δεν υπάρχει τίποτα παλαιότερο για undo

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
