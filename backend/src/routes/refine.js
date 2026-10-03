import { Router } from 'express';
import { buildRefineMessages } from '../promptEngineering.js';
import { callClaudeForCode, ClaudeOutputError } from '../claudeCodeClient.js';
import { runWithValidation } from '../validationLoop.js';
import { addDesignGuide } from '../designStep.js';
import { getSession, addHistoryEntry } from '../sessionStore.js';
import { refineCacheKey, getCached, setCached } from '../cache.js';
import { isOverLimit, iterationLimit } from '../rateLimiter.js';
import { resolveModel } from '../config.js';
import { createReporter } from '../progress.js';
import { logEvent, validationStats } from '../studyLog.js';

const NO_USAGE = { inputTokens: 0, outputTokens: 0 };

export function refineRouter(anthropic) {
  const router = Router();

  router.post('/', async (req, res) => {
    const { sessionId, instruction, requestId } = req.body ?? {};
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

    const participant = session.participant;
    const startedAt = Date.now();

    if (isOverLimit(session)) {
      logEvent({
        kind: 'refine',
        status: 'limit',
        httpStatus: 429,
        errorCode: 'ITERATION_LIMIT',
        sessionId,
        participant,
        durationMs: 0,
        prompt: instruction,
      });
      return res.status(429).json({
        code: 'ITERATION_LIMIT',
        error: `Maximum number of edits (${iterationLimit()}) reached for this page.`,
      });
    }

    const report = createReporter(requestId);
    const current = session.history[session.history.length - 1];
    let model;

    try {
      model = resolveModel();
      const cacheKey = refineCacheKey(current.html, current.css, instruction);
      let result = getCached(cacheKey);
      let fromCache = true;

      if (result) {
        report('cached');
      } else {
        fromCache = false;
        report('generating');
        const initial = await callClaudeForCode(
          anthropic,
          buildRefineMessages(current.html, current.css, instruction)
        );
        const validated = await runWithValidation(anthropic, initial, { onStage: report });
        report('designing');
        result = await addDesignGuide(
          anthropic,
          validated,
          `${session.history[0].prompt}
(Latest change requested by the user: ${instruction})`
        );
        setCached(cacheKey, result);
      }

      const usage = fromCache ? NO_USAGE : result.usage;
      const updated = addHistoryEntry(sessionId, {
        prompt: instruction,
        html: result.html,
        css: result.css,
        validation: result.validation,
        rationale: result.rationale,
        placeholders: result.placeholders,
        usage,
      });

      logEvent({
        kind: 'refine',
        status: 'ok',
        httpStatus: 200,
        sessionId,
        participant,
        durationMs: Date.now() - startedAt,
        model,
        fromCache,
        prompt: instruction,
        usage,
        ...validationStats(result.validation),
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
      const badOutput = err instanceof ClaudeOutputError;
      logEvent({
        kind: 'refine',
        status: 'error',
        httpStatus: badOutput ? 502 : 500,
        errorCode: err.name,
        sessionId,
        participant,
        durationMs: Date.now() - startedAt,
        model,
        prompt: instruction,
      });
      if (badOutput) {
        return res.status(502).json({ error: err.message, raw: err.raw });
      }
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
