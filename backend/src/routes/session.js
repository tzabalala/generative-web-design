import { Router } from 'express';
import { getSession, undoLastEntry } from '../sessionStore.js';
import { iterationLimit } from '../rateLimiter.js';
import { logEvent } from '../studyLog.js';

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
    const startedAt = Date.now();
    let previous;
    try {
      previous = undoLastEntry(req.params.id);
    } catch {
      return res.status(404).json({ error: `Unknown sessionId: ${req.params.id}` });
    }

    const session = getSession(req.params.id);
    const base = {
      kind: 'undo',
      sessionId: req.params.id,
      participant: session?.participant ?? null,
      durationMs: Date.now() - startedAt,
    };

    if (!previous) {
      logEvent({ ...base, status: 'noop', httpStatus: 409, errorCode: 'NOTHING_TO_UNDO' });
      return res.status(409).json({ code: 'NOTHING_TO_UNDO', error: 'There is no earlier version to undo to.' });
    }

    logEvent({ ...base, status: 'ok', httpStatus: 200 });
    res.json({
      iterationsUsed: session.iterationCount,
      iterationsLimit: iterationLimit(),
      pages: previous.pages,
      css: previous.css,
      validation: previous.validation,
      rationale: previous.rationale ?? null,
      placeholders: previous.placeholders ?? [],
    });
  });

  return router;
}
