import http from 'http';
import { readFileSync } from 'fs';

// A tiny stand-in for the Anthropic API, used ONLY by the end-to-end tests so they cost
// nothing and are repeatable. The real backend talks to it exactly as it would talk to
// Claude (the SDK is pointed here with ANTHROPIC_BASE_URL), and the answers are real
// Claude output captured earlier (fixtures/yoga.json).
//
// What it answers, decided from the request the backend sends:
//   generate  -> the "raw" page (it has a real colour-contrast problem), so the validation
//                loop genuinely has something to fix. Prompt containing CLEAN gets the
//                already-fixed page; BREAK gets text that is not JSON (an API failure).
//   fix       -> the fixed page
//   refine    -> the current page with the instruction written into the heading. An
//                instruction containing WIDE adds a 900px-wide box, i.e. a mobile layout bug.
//   design    -> the stored design rationale and replacement guide
const fixture = JSON.parse(readFileSync(new URL('./fixtures/yoga.json', import.meta.url), 'utf8'));

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function between(text, start, end) {
  const from = text.indexOf(start);
  if (from < 0) return '';
  const rest = text.slice(from + start.length);
  const to = rest.indexOf(end);
  return to < 0 ? rest : rest.slice(0, to);
}

function decide(system, user) {
  if (system.includes('design consultant')) {
    return { kind: 'design', payload: { rationale: fixture.rationale, placeholders: fixture.placeholders } };
  }

  if (user.startsWith('Generate a web page')) {
    if (user.includes('BREAK')) return { kind: 'generate', payload: 'I am sorry, I cannot produce that.' };
    if (user.includes('CLEAN')) return { kind: 'generate', payload: fixture.fixed };
    return { kind: 'generate', payload: fixture.raw };
  }

  if (user.startsWith('The following code failed')) {
    return { kind: 'fix', payload: fixture.fixed };
  }

  if (user.startsWith('Here is the current page')) {
    const instruction = (user.match(/Apply this change: (.*)/) || [, ''])[1].trim();
    const html = between(user, 'Current html field:\n', '\n\nCurrent css field:');
    const css = between(user, 'Current css field:\n', '\n\nApply this change:');
    if (instruction.includes('WIDE')) {
      return {
        kind: 'refine',
        payload: {
          html: html.replace('</main>', '<div class="e2e-wide">x</div></main>'),
          css: `${css}\n.e2e-wide{width:900px;height:20px}`,
        },
      };
    }
    return {
      kind: 'refine',
      payload: {
        html: html.replace('Find Your Inner Peace', `Find Your Inner Peace (edited: ${escapeHtml(instruction)})`),
        css,
      },
    };
  }

  return { kind: 'unknown', payload: { html: '<p>unexpected request</p>', css: '' } };
}

export async function createFakeAnthropic({ delayMs = 0 } = {}) {
  const state = { delayMs, calls: [] };

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) {
      res.writeHead(404).end();
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const system = typeof body.system === 'string' ? body.system : JSON.stringify(body.system ?? '');
    const firstUser = (body.messages || []).find((m) => m.role === 'user');
    const user = typeof firstUser?.content === 'string' ? firstUser.content : JSON.stringify(firstUser?.content ?? '');

    const { kind, payload } = decide(system, user);
    state.calls.push(kind);
    if (state.delayMs) await new Promise((resolve) => setTimeout(resolve, state.delayMs));

    // The backend starts the answer with a "{" prefill, so the reply continues AFTER it.
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload).slice(1);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'msg_fake',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1200, output_tokens: 3400 },
      })
    );
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    get calls() {
      return state.calls;
    },
    resetCalls() {
      state.calls.length = 0;
    },
    setDelay(ms) {
      state.delayMs = ms;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
