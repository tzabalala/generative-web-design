import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { generateRouter } from './routes/generate.js';

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PORT = process.env.PORT || 3000;

app.use('/api/generate', generateRouter(anthropic));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Βήμα 4 του Technical Implementation Plan: "Hello World" endpoint που καλεί
// το Claude API και επιστρέφει απλή απάντηση, για επιβεβαίωση σύνδεσης.
app.get('/api/test-claude', async (req, res) => {
  try {
    const message = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL_DEV,
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
  });
}

export default app;
