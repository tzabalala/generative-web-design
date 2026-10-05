import { createRequire } from 'module';
import { inflateRawSync } from 'zlib';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core');

// Runs axe-core on the tool's OWN interface (the same checker the tool applies to the pages
// it generates). `iframes: false` keeps axe out of the generated-page preview: that page is
// somebody else's content and has its own checks; here we judge the tool around it. The
// iframe element itself (its title, its role) is still checked.
export async function axeViolations(page) {
  const loaded = await page.evaluate(() => Boolean(window.axe));
  if (!loaded) await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const results = await axe.run(document, { iframes: false, resultTypes: ['violations'] });
    return results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));
  });
}

export async function submitPrompt(page, text) {
  await page.fill('#prompt-input', text);
  await page.click('.prompt-form__submit');
}

// Waits for the "working" status to appear and then follows it until it disappears,
// remembering every step text that was shown on the way. Returns the list of step texts.
export async function trackWork(page, { timeoutMs = 120000 } = {}) {
  await page.waitForSelector('.prompt-form__working', { state: 'attached', timeout: 15000 });
  const seen = [];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await page.locator('.prompt-form__working').count()) === 0) return seen;
    const text = await page
      .locator('.prompt-form__stage')
      .first()
      .textContent({ timeout: 100 })
      .catch(() => null);
    if (text && !seen.includes(text.trim())) seen.push(text.trim());
    await page.waitForTimeout(120);
  }
  throw new Error('The request did not finish in time');
}

export const currentSessionId = (page) => page.evaluate(() => localStorage.getItem('gaw.sessionId'));

export async function fetchSession(harness, sessionId) {
  const res = await fetch(`${harness.backendUrl}/api/session/${sessionId}`);
  return res.json();
}

// The names of the tabs above the preview, in order.
export const tabNames = (page) => page.locator('.live-preview__tab').allTextContents();

// A zip reader written independently of the app's zip writer: it walks the central
// directory like an unzip tool and checks every checksum. Returns { 'name': 'text' }.
export function readZip(buffer) {
  const eocd = buffer.length - 22;
  if (buffer.readUInt32LE(eocd) !== 0x06054b50) throw new Error('not a zip file (no end-of-directory record)');
  const count = buffer.readUInt16LE(eocd + 10);
  let pos = buffer.readUInt32LE(eocd + 16);

  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };

  const files = {};
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) throw new Error('bad central directory entry');
    const method = buffer.readUInt16LE(pos + 10);
    const crc = buffer.readUInt32LE(pos + 16);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLen);

    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    let data = buffer.subarray(start, start + compressedSize);
    if (method === 8) data = inflateRawSync(data);
    if (crc32(data) !== crc) throw new Error(`checksum mismatch for ${name}`);
    files[name] = data.toString('utf8');
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
