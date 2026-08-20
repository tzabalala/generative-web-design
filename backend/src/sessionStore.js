import { randomUUID } from 'crypto';

// In-memory session store (Βήμα 3 data model: κάθε session έχει ένα history
// από (prompt, generated_code, validation_result) τριάδες). MVP-level —
// θα αντικατασταθεί/επεκταθεί στο Βήμα 11 (caching layer).
const sessions = new Map();

export function createSession() {
  const id = randomUUID();
  sessions.set(id, { history: [] });
  return id;
}

export function getSession(id) {
  return sessions.get(id);
}

export function addHistoryEntry(id, entry) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Unknown session: ${id}`);
  session.history.push(entry);
  return session;
}
