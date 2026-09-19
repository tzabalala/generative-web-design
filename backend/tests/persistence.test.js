import { createHash, randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';
import express from 'express';
import request from 'supertest';
import { closeDb } from '../src/db.js';
import { createSession, getSession, addHistoryEntry, undoLastEntry } from '../src/sessionStore.js';
import { generateCacheKey, getCached, setCached } from '../src/cache.js';
import { sessionRouter } from '../src/routes/session.js';

// A real FILE (not :memory:) so survival across a "restart" is actually tested.
const dbFile = join(tmpdir(), `gaw-test-${randomUUID()}.sqlite`);
process.env.DB_PATH = dbFile;

// Simulated restart: closes the connection; the next call reopens the file.
const restartServer = () => closeDb();

afterAll(() => {
  closeDb();
  delete process.env.DB_PATH;
  for (const suffix of ['', '-wal', '-shm']) rmSync(dbFile + suffix, { force: true });
});

const entry = (prompt, extra = {}) => ({
  prompt,
  html: `<h1>${prompt}</h1>`,
  css: 'h1{}',
  validation: { passed: true, attempts: 0, remainingIssues: [] },
  rationale: { summary: 'Concept', colors: [{ hex: '#112233', name: 'Navy', why: 'Trust' }] },
  placeholders: [{ what: 'Name', where: 'Title', searchText: prompt, replaceWith: 'Yours' }],
  usage: { inputTokens: 100, outputTokens: 50 },
  ...extra,
});

describe('persistent sessions', () => {
  it('survive a server restart, including rationale and placeholders', () => {
    const id = createSession();
    addHistoryEntry(id, entry('first'));
    addHistoryEntry(id, entry('second'));

    restartServer();

    const session = getSession(id);
    expect(session.history.map((h) => h.prompt)).toEqual(['first', 'second']);
    expect(session.iterationCount).toBe(2);
    expect(session.history[1].rationale.colors[0].hex).toBe('#112233');
    expect(session.history[1].placeholders[0].what).toBe('Name');
    expect(session.history[1].validation.passed).toBe(true);
  });

  it('accumulate token usage across entries', () => {
    const id = createSession();
    addHistoryEntry(id, entry('a'));
    addHistoryEntry(id, entry('b'));
    expect(getSession(id).totalUsage).toEqual({ inputTokens: 200, outputTokens: 100 });
  });

  it('return undefined for an unknown session', () => {
    expect(getSession('nope')).toBeUndefined();
  });

  it('refuse to add to an unknown session and leave nothing behind', () => {
    expect(() => addHistoryEntry('nope', entry('x'))).toThrow(/Unknown session/);
    expect(getSession('nope')).toBeUndefined();
  });

  it('default to empty rationale/placeholders for entries stored without them', () => {
    const id = createSession();
    addHistoryEntry(id, { prompt: 'p', html: '<p/>', css: '', validation: null });
    const [stored] = getSession(id).history;
    expect(stored.rationale).toBeNull();
    expect(stored.placeholders).toEqual([]);
  });
});

describe('undo', () => {
  it('removes only the latest version, keeps it removed after a restart, and does NOT refund iterations', () => {
    const id = createSession();
    addHistoryEntry(id, entry('v1'));
    addHistoryEntry(id, entry('v2'));

    const previous = undoLastEntry(id);
    expect(previous.prompt).toBe('v1');

    restartServer();
    const session = getSession(id);
    expect(session.history.map((h) => h.prompt)).toEqual(['v1']);
    expect(session.iterationCount).toBe(2); // otherwise the limit could be bypassed with refine/undo
  });

  it('returns null when there is nothing older to go back to', () => {
    const id = createSession();
    addHistoryEntry(id, entry('only'));
    expect(undoLastEntry(id)).toBeNull();
    expect(getSession(id).history).toHaveLength(1);
  });

  it('a new refine after an undo lands in the right position', () => {
    const id = createSession();
    addHistoryEntry(id, entry('v1'));
    addHistoryEntry(id, entry('v2'));
    undoLastEntry(id);
    addHistoryEntry(id, entry('v2b'));
    expect(getSession(id).history.map((h) => h.prompt)).toEqual(['v1', 'v2b']);
  });

  it('the undo endpoint reports the (unchanged) iteration counter for the UI', async () => {
    const id = createSession();
    addHistoryEntry(id, entry('v1'));
    addHistoryEntry(id, entry('v2'));

    const app = express();
    app.use('/api/session', sessionRouter());
    const res = await request(app).post(`/api/session/${id}/undo`);

    expect(res.status).toBe(200);
    expect(res.body.iterationsUsed).toBe(2);
    expect(res.body.html).toContain('v1');
    expect(res.body.rationale.summary).toBe('Concept');
  });
});

describe('persistent cache', () => {
  it('survives a server restart', () => {
    const key = generateCacheKey('a bakery page — persistence');
    setCached(key, { html: '<p>cached</p>', css: '', rationale: null, placeholders: [] });

    restartServer();

    expect(getCached(key).html).toBe('<p>cached</p>');
  });

  it('returns undefined on a miss', () => {
    expect(getCached(generateCacheKey('never stored'))).toBeUndefined();
  });

  it('keys include the prompt version, so old prompts never serve stale answers', () => {
    const unversioned = createHash('sha256').update('generate:hello').digest('hex');
    expect(generateCacheKey('hello')).not.toBe(unversioned);
  });

  it('normalises whitespace so trivially different prompts share an entry', () => {
    expect(generateCacheKey('  a   bakery page ')).toBe(generateCacheKey('a bakery page'));
  });
});
