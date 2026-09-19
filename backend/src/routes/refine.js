import { Router } from 'express';
import { buildRefineMessages } from '../promptEngineering.js';
import { callClaudeForCode, ClaudeOutputError } from '../claudeCodeClient.js';
import { runWithValidation } from '../validationLoop.js';
import { addDesignGuide } from '../designStep.js';
import { getSession, addHistoryEntry } from '../sessionStore.js';
import { refineCacheKey, getCached, setCached } from '../cache.js';
import { isOverLimit, iterationLimit } from '../rateLimiter.js';

export function refineRouter(anthropic) {
  const router = Router();

  router.post('/', async (req, res) => {
    const { sessionId, instruction } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Missing required field: sessionId' });
    }
    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      return res.status(400).json({ error: 'Missing required field: instruction (non-empty string)' });
    }

    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: `Unknown sessionId: ${sessionId}` });
    }
    if (isOverLimit(session)) {
      return res.status(429).json({
        error: `Έχεις φτάσει το μέγιστο αριθμό επεξεργασιών (${iterationLimit()}) για αυτή τη σελίδα.`,
      });
    }

    const current = session.history[session.history.length - 1];

    try {
      const cacheKey = refineCacheKey(current.html, current.css, instruction);
      let result = getCached(cacheKey);
      let fromCache = true;

      if (!result) {
        fromCache = false;
        const initial = await callClaudeForCode(
          anthropic,
          buildRefineMessages(current.html, current.css, instruction)
        );
        const validated = await runWithValidation(anthropic, initial);
        result = await addDesignGuide(
          anthropic,
          validated,
          `${session.history[0].prompt}
(Latest change requested by the user: ${instruction})`
        );
        setCached(cacheKey, result);
      }

      const updated = addHistoryEntry(sessionId, {
        prompt: instruction,
        html: result.html,
        css: result.css,
        validation: result.validation,
        rationale: result.rationale,
        placeholders: result.placeholders,
        usage: fromCache ? { inputTokens: 0, outputTokens: 0 } : result.usage,
      });

      res.json({
        sessionId,
        html: result.html,
        css: result.css,
        validation: result.validation,
        rationale: result.rationale,
        placeholders: result.placeholders,
        fromCache,
        iterationsUsed: updated.iterationCount,
        iterationsLimit: iterationLimit(),
      });
    } catch (err) {
      if (err instanceof ClaudeOutputError) {
        return res.status(502).json({ error: err.message, raw: err.raw });
      }
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
