import { Router } from 'express';
import { buildGenerateMessages } from '../promptEngineering.js';
import { callClaudeForCode, ClaudeOutputError } from '../claudeCodeClient.js';
import { runWithValidation } from '../validationLoop.js';
import { createSession, addHistoryEntry } from '../sessionStore.js';
import { generateCacheKey, getCached, setCached } from '../cache.js';

export function generateRouter(anthropic) {
  const router = Router();

  router.post('/', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Missing required field: prompt (non-empty string)' });
    }

    try {
      const cacheKey = generateCacheKey(prompt);
      let result = getCached(cacheKey);
      let fromCache = true;

      if (!result) {
        fromCache = false;
        const initial = await callClaudeForCode(anthropic, buildGenerateMessages(prompt));
        result = await runWithValidation(anthropic, initial);
        setCached(cacheKey, result);
      }

      const sessionId = createSession();
      addHistoryEntry(sessionId, {
        prompt,
        html: result.html,
        css: result.css,
        validation: result.validation,
        usage: fromCache ? { inputTokens: 0, outputTokens: 0 } : result.usage,
      });

      res.json({
        sessionId,
        html: result.html,
        css: result.css,
        validation: result.validation,
        fromCache,
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
