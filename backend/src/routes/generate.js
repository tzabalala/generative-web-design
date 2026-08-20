import { Router } from 'express';
import { SYSTEM_PROMPT, buildGenerateMessages } from '../promptEngineering.js';
import { createSession, addHistoryEntry } from '../sessionStore.js';

export function generateRouter(anthropic) {
  const router = Router();

  router.post('/', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Missing required field: prompt (non-empty string)' });
    }

    try {
      const message = await anthropic.messages.create({
        model: process.env.CLAUDE_MODEL_DEV,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: buildGenerateMessages(prompt),
      });

      // Το prefill ("{") δεν επαναλαμβάνεται στην απάντηση, οπότε το προσθέτουμε πίσω.
      // Αν παρόλα αυτά η απάντηση καταλήξει σε ```code fence, το αφαιρούμε ως safety net.
      const raw = ('{' + message.content[0].text).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return res.status(502).json({ error: 'Claude returned non-JSON output', raw });
      }

      const { html, css } = parsed;
      if (typeof html !== 'string' || typeof css !== 'string') {
        return res.status(502).json({ error: 'Claude JSON is missing html/css fields', raw: parsed });
      }

      const sessionId = createSession();
      addHistoryEntry(sessionId, { prompt, html, css, validation: null });

      res.json({ sessionId, html, css });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
