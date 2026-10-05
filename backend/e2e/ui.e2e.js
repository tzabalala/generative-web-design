import { describe, it as nodeIt, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { startHarness, backendDir } from './harness.js';
import { axeViolations, submitPrompt, trackWork, currentSessionId, fetchSession, tabNames, readZip } from './helpers.js';
import { measureLayout } from '../src/validation/visualResponsiveChecker.js';

// End-to-end test of the whole tool in a real browser:
//   real frontend + real backend + real database + real axe-core/Playwright checks,
//   with a FAKE Claude (so it is free and repeatable). Run it with:  npm run e2e
//
// The tests build on each other (generate -> refine -> undo -> reload ...), like a real
// visit, so they run in order and share one browser page.

let harness;
let browser;
let page;
const consoleErrors = [];
const consoleWarnings = [];
const pageErrors = [];

// Prints the server logs when a step fails, so the reason is visible without digging.
const it = (name, fn) =>
  nodeIt(name, { timeout: 180000 }, async (t) => {
    try {
      await fn(t);
    } catch (err) {
      console.error(`\n[e2e] FAILED: ${name}\n${harness ? harness.logs() : ''}\n`);
      throw err;
    }
  });

const srcdoc = () => page.getAttribute('iframe.live-preview__frame', 'srcdoc');
const text = (selector) => page.textContent(selector);
const noViolations = (found, where) =>
  assert.deepEqual(found, [], `axe-core found accessibility problems ${where}:\n${JSON.stringify(found, null, 1)}`);
const frame = () => page.frameLocator('iframe.live-preview__frame');

describe('the tool, end to end', () => {
  before(async () => {
    harness = await startHarness();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
      if (m.type() === 'warning') consoleWarnings.push(m.text());
    });
  });

  after(async () => {
    await browser?.close();
    await harness?.stop();
  });

  it('opens in English with the Create button disabled until you type', async () => {
    await page.goto(`${harness.appUrl}/?p=P01`);
    assert.equal(await page.getAttribute('html', 'lang'), 'en');
    assert.match(await text('h1'), /Generative AI-Driven Web Design/);
    assert.match(await text('label[for="prompt-input"]'), /Describe the website you want/);
    assert.equal(await page.isDisabled('.prompt-form__submit'), true);
    noViolations(await axeViolations(page), 'on the empty start page (English)');
  });

  it('switches to Greek, remembers it after a reload, and the Greek page is accessible too', async () => {
    try {
      await page.click('.lang__btn[lang="el"]');
      assert.equal(await page.getAttribute('html', 'lang'), 'el');
      assert.match(await text('.prompt-form__submit'), /Δημιουργία σελίδας/);
      noViolations(await axeViolations(page), 'on the empty start page (Greek)');

      await page.reload();
      assert.equal(await page.getAttribute('html', 'lang'), 'el');
      assert.match(await text('.prompt-form__submit'), /Δημιουργία σελίδας/);
    } finally {
      // Whatever happened above, later steps expect English.
      await page.click('.lang__btn[lang="en"]');
    }
    assert.equal(await page.getAttribute('html', 'lang'), 'en');
  });

  it('generates a 3-page website: shows the live steps, fixes the shared colour on its own, shows the result', async () => {
    harness.fake.setDelay(2000); // slow enough for the step texts to be visible
    harness.fake.resetCalls();

    await submitPrompt(page, 'a website for a local yoga studio');
    const steps = await trackWork(page);
    await page.waitForSelector('iframe.live-preview__frame');
    harness.fake.setDelay(0);

    const joined = steps.join(' | ');
    assert.match(joined, /Planning your website/, `steps seen: ${joined}`);
    assert.match(joined, /Writing the pages \(\d of 3 ready\)/, `steps seen: ${joined}`);
    assert.match(joined, /Fixing a problem the checks found \(fix 1 of 3\)/, `steps seen: ${joined}`);

    assert.deepEqual(await tabNames(page), ['Home', 'About', 'Contact']);
    assert.match(await srcdoc(), /Find Your Inner Peace/); // the website opens on its home page
    assert.equal(await page.locator('.a11y-report__icon.is-ok').count(), 3); // accessibility, responsive, pages together
    assert.match(await text('.rationale__summary'), /yoga studio/);
    assert.equal(await page.locator('.guide__item').count(), 10);
    assert.equal(await page.locator('.refinement-panel__entry').count(), 1);
    assert.match(await text('.refinement-panel__counter'), /1 \/ 15/);
    assert.match(await text('.app__download'), /ZIP/);

    // What happened behind the scenes: a plan, one call per page, one fix, one design call.
    assert.deepEqual(
      [...harness.fake.calls].sort(),
      ['design', 'fix', 'page', 'page', 'page', 'plan']
    );
    const session = await fetchSession(harness, await currentSessionId(page));
    const entry = session.history[0];
    assert.deepEqual(entry.pages.map((p) => p.slug), ['index', 'about', 'contact']);
    assert.equal(entry.validation.attempts, 1);
    assert.equal(entry.validation.passed, true);
    assert.match(entry.validation.retryHistory[0].issues[0], /color contrast/i);
    assert.match(entry.validation.retryHistory[0].issues[0], /\(page: index\)/); // names the page
    assert.match(entry.validation.retryHistory[0].issues[0], /rule "\.accent"/); // and where the colour comes from
    assert.ok(!entry.css.includes('#d4422f'), 'the shared colour was fixed with a small edit of the shared css');
    assert.equal(entry.validation.site.passed, true);
  });

  it('the pages are different from each other and share one menu', async () => {
    const session = await fetchSession(harness, await currentSessionId(page));
    const pages = session.history[0].pages;
    const menuOf = (html) => html.match(/<nav[\s\S]*?<\/nav>/)[0].replace(/ aria-current="page"/g, '');
    assert.equal(new Set(pages.map((p) => menuOf(p.html))).size, 1, 'one identical menu on every page');
    assert.equal(new Set(pages.map((p) => p.html)).size, 3, 'three different pages');
    assert.match(pages[1].html, /aria-current="page">About/); // each page marks itself in the menu
    assert.match(pages[2].html, /<form>/); // the contact page has what a contact page needs
  });

  it('switches page from the tabs and from a menu link inside the preview', async () => {
    await page.locator('.live-preview__tab', { hasText: 'About' }).click();
    assert.match(await srcdoc(), /About our teachers/);
    assert.equal(await page.locator('.live-preview__tab[aria-current="page"]').textContent(), 'About');

    // A click on a link INSIDE the sandboxed preview (no JavaScript there) changes the page.
    await frame().getByRole('link', { name: 'Contact' }).first().click();
    await page.waitForFunction(() => document.querySelector('.live-preview__tab[aria-current="page"]')?.textContent === 'Contact');
    assert.match(await srcdoc(), /Visit or call us/);
    assert.equal(await page.evaluate(() => window.location.hash), '', 'the address hash is cleared again');
    assert.match(await page.evaluate(() => window.location.search), /p=P01/, 'the participant code is kept');

    // ... and the same link works a second time
    await page.locator('.live-preview__tab', { hasText: 'About' }).click();
    await frame().getByRole('link', { name: 'Contact' }).first().click();
    await page.waitForFunction(() => document.querySelector('.live-preview__tab[aria-current="page"]')?.textContent === 'Contact');

    await page.locator('.live-preview__tab', { hasText: 'About' }).click();
  });

  it('changes only the page being looked at, with a plain instruction (Claude finds the page itself)', async () => {
    harness.fake.resetCalls();
    await submitPrompt(page, 'make the heading calmer');
    await trackWork(page);

    assert.match(await srcdoc(), /About our teachers \(edited: make the heading calmer\)/); // stays on that page
    assert.equal(await page.locator('.refinement-panel__entry').count(), 2);
    assert.match(await text('.refinement-panel__counter'), /2 \/ 15/);
    assert.deepEqual(harness.fake.calls, ['refine', 'design']); // nothing to fix this time

    const session = await fetchSession(harness, await currentSessionId(page));
    const [before, after] = session.history.map((h) => h.pages);
    assert.equal(after[0].html, before[0].html, 'the home page was not touched');
    assert.equal(after[2].html, before[2].html, 'the contact page was not touched');
    assert.notEqual(after[1].html, before[1].html);
  });

  it('catches a refinement that breaks the phone layout of one page, and repairs it automatically', async () => {
    harness.fake.resetCalls();
    await submitPrompt(page, 'make everything WIDE');
    await trackWork(page);

    assert.deepEqual(harness.fake.calls, ['refine', 'fix', 'design']);
    const session = await fetchSession(harness, await currentSessionId(page));
    const last = session.history[session.history.length - 1];
    assert.ok(!last.pages[0].html.includes('e2e-wide'), 'the broken box must be gone after the automatic fix');
    assert.equal(last.validation.attempts, 1);
    assert.equal(last.validation.passed, true);
    const firstIssues = last.validation.retryHistory[0].issues.join('\n');
    assert.match(firstIssues, /\[responsive\] \(page: index\) Horizontal scrolling at 375px \(mobile\)/);
    assert.equal(await page.locator('.refinement-panel__entry').count(), 3);
  });

  it('adds a new page on request: it appears as a tab and in the menu of every page', async () => {
    harness.fake.resetCalls();
    await submitPrompt(page, 'ADDPAGE a gallery with photos');
    await trackWork(page);

    assert.deepEqual(harness.fake.calls, ['refine', 'design']);
    assert.deepEqual(await tabNames(page), ['Home', 'About', 'Contact', 'Gallery']);
    const session = await fetchSession(harness, await currentSessionId(page));
    const last = session.history[session.history.length - 1];
    assert.equal(last.validation.passed, true);
    assert.equal(last.validation.site.passed, true); // the menu is the same on all 4 pages and every link works
    for (const p of last.pages) assert.match(p.html, /href="gallery\.html"/);
    assert.equal(await page.locator('.refinement-panel__entry').count(), 4);
  });

  it('undo goes back instantly, without calling Claude, and does not refund the edit counter', async () => {
    harness.fake.resetCalls();
    const started = Date.now();
    await page.click('.refinement-panel__undo');
    await page.waitForFunction(() => document.querySelectorAll('.refinement-panel__entry').length === 3);

    assert.ok(Date.now() - started < 5000, 'undo should be near-instant');
    assert.deepEqual(harness.fake.calls, []);
    assert.deepEqual(await tabNames(page), ['Home', 'About', 'Contact']); // the gallery page is gone again
    assert.match(await text('.refinement-panel__counter'), /4 \/ 15/);
  });

  it('restores everything after a page reload', async () => {
    await page.reload();
    await page.waitForSelector('.app__notice');
    assert.match(await text('.app__notice'), /Picking up where you left off/);
    assert.deepEqual(await tabNames(page), ['Home', 'About', 'Contact']);
    await page.locator('.live-preview__tab', { hasText: 'About' }).click();
    assert.match(await srcdoc(), /About our teachers \(edited: make the heading calmer\)/);
    assert.equal(await page.locator('.refinement-panel__entry').count(), 3);
    assert.match(await text('.refinement-panel__counter'), /4 \/ 15/);
  });

  it('downloads the website as a ZIP: one file per page, one shared stylesheet, the guide inside', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('.app__download')]);
    assert.equal(download.suggestedFilename(), 'website.zip');
    const file = join(harness.workDir, 'website.zip');
    await download.saveAs(file);
    const files = readZip(readFileSync(file));

    assert.deepEqual(Object.keys(files).sort(), ['about.html', 'contact.html', 'index.html', 'style.css']);
    assert.match(files['style.css'], /--accent:#9b2c1c/);
    assert.ok(files['index.html'].startsWith('<!DOCTYPE html>'));
    assert.match(files['index.html'], /<html lang="en">/);
    assert.match(files['index.html'], /GUIDE: DUMMY CONTENT TO REPLACE/);
    assert.match(files['index.html'], /Search \(Ctrl\+F\): Serenity Yoga Studio/);
    assert.doesNotMatch(files['about.html'], /GUIDE/);
    for (const name of ['index.html', 'about.html', 'contact.html']) {
      assert.match(files[name], /<link rel="stylesheet" href="style\.css">/);
      assert.match(files[name], /href="about\.html"/); // real links, so the files work when opened together
    }
    assert.match(files['about.html'], /<title>About - Serenity Yoga Studio<\/title>/);
    const comment = files['index.html'].match(/<!--([\s\S]*?)-->/)[1];
    assert.ok(!comment.includes('--'), 'the guide comment must not be able to close itself early');
  });

  it('the tool itself passes the accessibility check with a website on screen (English and Greek)', async () => {
    noViolations(await axeViolations(page), 'with a generated website on screen (English)');
    await page.click('.lang__btn[lang="el"]');
    noViolations(await axeViolations(page), 'with a generated website on screen (Greek)');
    assert.deepEqual(await tabNames(page), ['Home', 'About', 'Contact']);
    await page.click('.lang__btn[lang="en"]');
  });

  it('the tool itself fits a phone screen: no sideways scrolling, no tiny buttons', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    const m = await measureLayout(page, { checkTargets: true });
    await page.setViewportSize({ width: 1280, height: 900 });

    assert.equal(m.overflows, false, `page is ${m.scrollWidth}px wide; sticking out: ${JSON.stringify(m.culprits)}`);
    assert.equal(m.smallTargetCount, 0, `tiny tap targets: ${JSON.stringify(m.smallTargets)}`);
  });

  it('"New website" starts fresh; a clean one-page site needs no fix and downloads as one file; a broken Claude answer shows an error and recovers', async () => {
    await page.click('.app__new-page');
    assert.match(await text('label[for="prompt-input"]'), /Describe the website you want/);
    assert.equal(await page.locator('.live-preview__tab').count(), 0);

    harness.fake.resetCalls();
    await submitPrompt(page, 'CLEAN one-page yoga studio landing');
    await trackWork(page);
    assert.deepEqual(harness.fake.calls, ['plan', 'page', 'design']);
    assert.equal(await page.locator('.live-preview__tab').count(), 0, 'a one-page site needs no tabs');
    assert.equal(await page.locator('.a11y-report__icon.is-ok').count(), 3);
    const session = await fetchSession(harness, await currentSessionId(page));
    assert.equal(session.history[0].validation.attempts, 0);
    assert.equal(session.history[0].pages.length, 1);

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('.app__download')]);
    assert.equal(download.suggestedFilename(), 'page.html');
    const file = join(harness.workDir, 'page.html');
    await download.saveAs(file);
    const html = readFileSync(file, 'utf8');
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.match(html, /--accent:#9b2c1c/); // the stylesheet is inside the single file
    assert.match(html, /GUIDE: DUMMY CONTENT TO REPLACE/);

    await page.click('.app__new-page');
    await submitPrompt(page, 'BREAK this one');
    await trackWork(page);
    assert.match(await text('.app__error'), /non-JSON/);
    noViolations(await axeViolations(page), 'while the error message is showing');
    assert.equal(await page.locator('.prompt-form__working').count(), 0);
    assert.equal(await page.locator('iframe.live-preview__frame').count(), 0);
  });

  it('recorded every request in the study log, with timings, models and the participant code', async () => {
    const db = new DatabaseSync(harness.dbPath, { readOnly: true });
    const events = db.prepare('SELECT * FROM events ORDER BY id').all();
    db.close();

    assert.deepEqual(
      events.map((e) => `${e.kind}:${e.status}`),
      ['generate:ok', 'refine:ok', 'refine:ok', 'refine:ok', 'undo:ok', 'generate:ok', 'generate:error']
    );
    for (const e of events) assert.equal(e.participant, 'P01');

    const [first, , wide, , , clean, broken] = events;
    assert.ok(first.duration_ms > 3000, `first site took ${first.duration_ms} ms (4 slow steps expected)`);
    assert.equal(first.attempts, 1);
    assert.ok(first.initial_issues >= 1);
    assert.equal(first.passed, 1);
    assert.equal(first.from_cache, 0);
    assert.ok(first.input_tokens > 0 && first.output_tokens > 0);
    assert.ok(first.model && first.model.length > 3);

    assert.equal(wide.attempts, 1); // the layout check found the problem, one automatic fix
    assert.equal(clean.attempts, 0);
    assert.equal(broken.http_status, 502);
    assert.equal(broken.session_id, null);
  });

  it('exports the study data to Excel-friendly files', async () => {
    const outDir = join(harness.workDir, 'exports');
    const run = spawnSync(process.execPath, ['scripts/exportStudyData.js', `--db=${harness.dbPath}`, `--out=${outDir}`], {
      cwd: backendDir,
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Exported 7 events, 2 sessions/);

    const [stamp] = readdirSync(outDir);
    const eventsCsv = readFileSync(join(outDir, stamp, 'events.csv'), 'utf8');
    assert.equal(eventsCsv.charCodeAt(0), 0xfeff, 'UTF-8 BOM so Excel shows Greek correctly');
    assert.match(eventsCsv, /^﻿id,time,kind,session_id,participant/);
    assert.match(eventsCsv, /yoga/);

    const sessionsCsv = readFileSync(join(outDir, stamp, 'sessions.csv'), 'utf8');
    assert.equal(sessionsCsv.trim().split('\r\n').length, 3); // header + 2 sessions

    const summary = JSON.parse(readFileSync(join(outDir, stamp, 'summary.json'), 'utf8'));
    assert.equal(summary.participants, 1);
    assert.equal(summary.generates_fresh, 2);
    assert.equal(summary.first_try_pass_rate_pct, 50); // one site needed a fix, one did not
    assert.equal(summary.errors, 1);
  });

  it('the browser reported no unexpected errors or Vue warnings', async () => {
    // The 502 is the deliberately broken Claude answer from the earlier step.
    const unexpected = consoleErrors.filter((e) => !/status of 502/.test(e));
    assert.deepEqual(unexpected, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleWarnings.filter((w) => /Vue warn/.test(w)), []);
  });
});
