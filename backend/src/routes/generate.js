import { Router } from 'express';
import { generateSite } from '../siteGenerator.js';
import { ClaudeOutputError } from '../claudeErrors.js';
import { runWithValidation } from '../validationLoop.js';
import { addDesignGuide } from '../designStep.js';
import { createSession, addHistoryEntry } from '../sessionStore.js';
import { generateCacheKey, getCached, setCached } from '../cache.js';
import { resolveModel } from '../config.js';
import { createReporter } from '../progress.js';
import { logEvent, cleanParticipant, validationStats } from '../studyLog.js';

const NO_USAGE = { inputTokens: 0, outputTokens: 0 };

export function generateRouter(anthropic) {
  const router = Router();

  router.post('/', async (req, res) => {
    const { prompt, requestId, participant: rawParticipant } = req.body ?? {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Missing required field: prompt (non-empty string)' });
    }

    const participant = cleanParticipant(rawParticipant);
    const report = createReporter(requestId);
    const startedAt = Date.now();
    let model;

    try {
      model = resolveModel();
      const cacheKey = generateCacheKey(prompt);
      let result = getCached(cacheKey);
      let fromCache = true;

      if (result) {
        report('cached');
      } else {
        fromCache = false;
        const initial = await generateSite(anthropic, prompt, { onStage: report });
        const validated = await runWithValidation(anthropic, initial, { onStage: report });
        report('designing');
        result = await addDesignGuide(anthropic, validated, prompt);
        setCached(cacheKey, result);
      }

      const sessionId = createSession(participant);
      const usage = fromCache ? NO_USAGE : result.usage;
      addHistoryEntry(sessionId, {
        prompt,
        pages: result.pages,
        css: result.css,
        validation: result.validation,
        rationale: result.rationale,
        placeholders: result.placeholders,
        usage,
      });

      logEvent({
        kind: 'generate',
        status: 'ok',
        httpStatus: 200,
        sessionId,
        participant,
        durationMs: Date.now() - startedAt,
        model,
        fromCache,
        prompt,
        usage,
        ...validationStats(result.validation),
      });

      res.json({
        sessionId,
        pages: result.pages,
        css: result.css,
        validation: result.validation,
        rationale: result.rationale,
        placeholders: result.placeholders,
        fromCache,
      });
    } catch (err) {
      const badOutput = err instanceof ClaudeOutputError;
      logEvent({
        kind: 'generate',
        status: 'error',
        httpStatus: err.code === 'PAGE_LIMIT' ? 422 : badOutput ? 502 : 500,
        errorCode: err.name,
        participant,
        durationMs: Date.now() - startedAt,
        model,
        prompt,
      });
      if (err.code === 'PAGE_LIMIT') {
        return res.status(422).json({ code: 'PAGE_LIMIT', error: err.message });
      }
      if (badOutput) {
        return res.status(502).json({ error: err.message, raw: err.raw });
      }
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
