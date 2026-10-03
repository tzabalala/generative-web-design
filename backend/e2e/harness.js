import { spawn } from 'child_process';
import net from 'net';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createFakeAnthropic } from './fakeAnthropic.js';

// Starts the WHOLE app for an end-to-end run, on throw-away ports and a throw-away
// database, with the fake Claude behind it:
//
//   real Vue frontend  ->  real Express backend  ->  real SQLite + real axe-core/Playwright
//                                             \->  FAKE Claude (no cost, no internet)
//
// Nothing touches your real database (backend/data/app.sqlite) or your API key.
const here = dirname(fileURLToPath(import.meta.url));
export const backendDir = resolve(here, '..');
export const frontendDir = resolve(backendDir, '../frontend');

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForHttp(url, { timeoutMs = 60000, label = url, child } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`${label} exited early (code ${child.exitCode})`);
    }
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function launch(name, args, { cwd, env }) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true });
  const log = [];
  const keep = (chunk) => {
    log.push(...String(chunk).split('\n').filter(Boolean));
    if (log.length > 80) log.splice(0, log.length - 80);
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  return { name, child, tail: () => log.slice(-25).join('\n') };
}

export async function startHarness({ delayMs = 0 } = {}) {
  const fake = await createFakeAnthropic({ delayMs });
  const [backendPort, frontendPort] = [await freePort(), await freePort()];
  const workDir = mkdtempSync(join(tmpdir(), 'gaw-e2e-'));
  const dbPath = join(workDir, 'e2e.sqlite');
  const backendUrl = `http://127.0.0.1:${backendPort}`;
  const appUrl = `http://127.0.0.1:${frontendPort}`;

  const backend = launch('backend', ['src/server.js'], {
    cwd: backendDir,
    env: {
      NODE_ENV: 'e2e', // anything except "test", so the server really listens
      PORT: String(backendPort),
      DB_PATH: dbPath,
      ANTHROPIC_API_KEY: 'e2e-fake-key',
      ANTHROPIC_BASE_URL: fake.url,
      MODEL_PROFILE: 'dev',
      MAX_VALIDATION_RETRIES: '3',
      MAX_ITERATIONS_PER_SESSION: '15',
      VISUAL_RESPONSIVE_CHECK: 'on',
    },
  });
  const frontend = launch(
    'frontend',
    [resolve(frontendDir, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'],
    { cwd: frontendDir, env: { VITE_API_BASE_URL: backendUrl } }
  );
  const processes = [backend, frontend];

  async function stop() {
    for (const p of processes) {
      if (p.child.exitCode === null) p.child.kill();
    }
    await fake.close().catch(() => {});
    await new Promise((r) => setTimeout(r, 500)); // let SQLite release its files on Windows
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* a locked temp file is harmless */
    }
  }

  try {
    await waitForHttp(`${backendUrl}/api/health`, { label: 'backend', child: backend.child });
    await waitForHttp(appUrl, { label: 'frontend', child: frontend.child });
  } catch (err) {
    const details = processes.map((p) => `--- ${p.name} log ---\n${p.tail()}`).join('\n');
    await stop();
    throw new Error(`${err.message}\n${details}`);
  }

  return {
    fake,
    appUrl,
    backendUrl,
    dbPath,
    workDir,
    logs: () => processes.map((p) => `--- ${p.name} ---\n${p.tail()}`).join('\n'),
    stop,
  };
}
