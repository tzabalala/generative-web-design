import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { generateRouter } from './routes/generate.js';
import { refineRouter } from './routes/refine.js';
import { sessionRouter } from './routes/session.js';
import { progressRouter } from './routes/progress.js';
import { modelProfile, resolveModel } from './config.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// A site is written page by page, several calls at a time, so a short rate-limit hiccup
// (HTTP 429) is more likely than before: the SDK waits and retries it a few times itself.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 5 });
const PORT = process.env.PORT || 3000;

app.use('/api/generate', generateRouter(anthropic));
app.use('/api/refine', refineRouter(anthropic));
app.use('/api/session', sessionRouter());
app.use('/api/progress', progressRouter());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Step 4 of the Technical Implementation Plan: a "Hello World" endpoint that calls
// the Claude API and returns a simple reply, to confirm the connection works.
app.get('/api/test-claude', async (req, res) => {
  try {
    const message = await anthropic.messages.create({
      model: resolveModel(),
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Reply with exactly: "Claude API connection OK"' }],
    });
    res.json({ reply: message.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
    console.log(`Claude model: ${resolveModel()} (profile: ${modelProfile()})`);
  });
}

export default app;
