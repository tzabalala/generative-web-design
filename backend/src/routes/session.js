import { Router } from 'express';
import { getSession, undoLastEntry } from '../sessionStore.js';
import { iterationLimit } from '../rateLimiter.js';

export function sessionRouter() {
  const router = Router();

  router.get('/:id', (req, res) => {
    const session = getSession(req.params.id);
    if (!session) return res.status(404).json({ error: `Unknown sessionId: ${req.params.id}` });
    res.json({
      history: session.history,
      iterationsUsed: session.iterationCount,
      iterationsLimit: iterationLimit(),
      totalUsage: session.totalUsage,
    });
  });

  router.post('/:id/undo', (req, res) => {
    let previous;
    try {
      previous = undoLastEntry(req.params.id);
    } catch {
      return res.status(404).json({ error: `Unknown sessionId: ${req.params.id}` });
    }
    if (!previous) {
      return res.status(409).json({ error: 'Δεν υπάρχει παλαιότερη έκδοση για undo.' });
    }
    res.json({
      iterationsUsed: getSession(req.params.id).iterationCount,
      iterationsLimit: iterationLimit(),
      html: previous.html,
      css: previous.css,
      validation: previous.validation,
      rationale: previous.rationale ?? null,
      placeholders: previous.placeholders ?? [],
    });
  });

  return router;
}
