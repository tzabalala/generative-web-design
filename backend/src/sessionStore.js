import { randomUUID } from 'crypto';

// In-memory session store (Βήμα 3 data model: κάθε session έχει ένα history
// από (prompt, generated_code, validation_result) τριάδες). MVP-level.
// Κρατάει επίσης το μετρητή iterations (Βήμα 12: rate limiting) και το
// συνολικό token usage (Βήμα 12: καταγραφή κόστους ανά session).
const sessions = new Map();

export function createSession() {
  const id = randomUUID();
  sessions.set(id, {
    history: [],
    iterationCount: 0,
    totalUsage: { inputTokens: 0, outputTokens: 0 },
  });
  return id;
}

export function getSession(id) {
  return sessions.get(id);
}

export function addHistoryEntry(id, entry) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Unknown session: ${id}`);
  session.history.push(entry);
  session.iterationCount += 1;
  if (entry.usage) {
    session.totalUsage.inputTokens += entry.usage.inputTokens;
    session.totalUsage.outputTokens += entry.usage.outputTokens;
  }
  return session;
}

// Βήμα 15 (Undo): γυρίζει στην προηγούμενη, ήδη-παραχθείσα έκδοση από το
// history — καμία νέα κλήση API.
export function undoLastEntry(id) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Unknown session: ${id}`);
  if (session.history.length <= 1) {
    return null; // δεν υπάρχει τίποτα παλαιότερο για undo
  }
  session.history.pop();
  return session.history[session.history.length - 1];
}
