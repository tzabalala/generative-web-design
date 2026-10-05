# Generative AI-Driven Web Design

A web tool for non-technical users: describe a website in plain language, get a working
HTML/CSS website of **1 to 5 pages** with a live preview, refine it with further instructions
(Claude finds the right page itself), and download it. The code has **already passed automatic
accessibility, responsive-layout and site checks** before the user sees it.

> **What is and is not the contribution.** Turning text into HTML/CSS is an off-the-shelf
> ability of the Claude API. The contribution of this project is the **automated validation and
> feedback loop** that runs *after* generation: axe-core (accessibility) and a responsive
> checker (static CSS check plus a real layout check at three screen sizes) and a site check
> (working links, the same menu on every page, pages that are not copies of each other).
> When a check fails, the problem is sent back to Claude to fix, up to three times, then the
> site is re-checked.

MSc dissertation project, CITY College, University of York Europe Campus.

## Contents

- [Requirements](#requirements)
- [First-time setup](#first-time-setup)
- [Run it](#run-it)
- [Tests](#tests)
- [Running a user study](#running-a-user-study)
- [Benchmark (Haiku vs Sonnet)](#benchmark)
- [Settings (.env)](#settings-env)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Cost](#cost)
- [Troubleshooting](#troubleshooting)

## Requirements

- Node.js 24 or later (the database uses the built-in `node:sqlite`).
- An Anthropic API key with pay-per-token billing from <https://console.anthropic.com>.
  A Claude.ai / Claude Pro login does **not** work for this.

## First-time setup

```bash
cd backend
npm install
npx playwright install chromium
cd ../frontend
npm install
```

Then create `backend/.env` by copying `.env.example` (it sits next to this file) and put your
key in `ANTHROPIC_API_KEY`.

## Run it

Two terminals, both left open.

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

Open <http://localhost:5173>. The backend listens on port 3000. A website takes about
2 to 3 minutes (a one-page site about 1 minute), because it is planned, written page by page,
checked, and fixed if needed. A change to an existing website is usually much faster.

### Testing on a phone (same Wi-Fi)

1. Start the backend as usual, but start the frontend with `npm run dev:lan` (it listens on the
   network, not only on this computer).
2. Find the computer's address: run `ipconfig` and look for "IPv4 Address" (for example `192.168.1.20`).
3. On the phone (same Wi-Fi), open `http://192.168.1.20:5173`. The page finds the backend on the
   same address by itself (`:3000`); nothing to configure.
4. The first time, Windows may ask whether to allow Node.js through the firewall. Allow it on
   private networks.

## Tests

| What | Command | Needs internet / API key? |
| --- | --- | --- |
| Backend unit + integration tests (Jest) | `cd backend && npm test` | No |
| Frontend tests (Vitest) | `cd frontend && npm test` | No |
| End-to-end test in a real browser | `cd backend && npm run e2e` | No |

The end-to-end test starts the whole app on spare ports with a throw-away database and a
**fake Claude** (answers captured from a real run), drives it in headless Chromium, and
checks: live progress steps, the multi-page generation, the automatic fixes, the layout check,
switching pages from the tabs and from a menu link inside the preview, a change to one page,
adding a page, undo, reload-restore, the ZIP and single-file downloads, English/Greek, the study
log and export, and runs axe-core on the tool's own interface. It never touches your real database or API key.

## Running a user study

1. Open the tool with an anonymous participant code in the address:
   `http://localhost:5173/?p=P01` (letters, digits, `-` and `_` only; never a real name).
2. Everything the participant does is logged automatically (time per request, model,
   automatic fix attempts, pass/fail, tokens, errors, undo).
3. After the sessions, export the data:

   ```bash
   cd backend
   npm run export
   ```

   This writes `events.csv`, `sessions.csv` and `summary.json` to `backend/exports/<date-time>/`
   (open the CSVs in Excel; Greek text displays correctly). Options:
   `-- --participant=P01`, `-- --since=2026-10-12`, `-- --db=path\to\app.sqlite`.

The `exports/` and `data/` folders contain participants' prompts and are git-ignored on purpose.

## Benchmark

Measures how much the validation loop improves raw model output, on a fixed list of prompts.

```bash
cd backend
npm run benchmark                              # 10 pages, dev model (Haiku)
npm run benchmark -- --count=35 --yes          # all 35 prompts (7 Greek, the last 5 ask for a whole
                                               # multi-page website); spends real money
npm run benchmark -- --count=30 --yes --model=demo   # the same prompts with Sonnet
npm run benchmark:compare -- benchmark-runs/<haiku>.json benchmark-runs/<sonnet>.json
```

Results are saved after every page to `backend/benchmark-runs/`. The first 10 prompts are the
original sample, but a run is **no longer directly comparable** with the first benchmark
(`backend/benchmark-results.json`): the pipeline now plans a site first, checks every page, and
includes the real layout check and the site check. Do not `import` `scripts/benchmark.js` from
another script outside the test environment: importing it starts a real run.

## Settings (.env)

| Variable | Default | Meaning |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | none | Your API key |
| `MODEL_PROFILE` | `dev` | `dev` uses `CLAUDE_MODEL_DEV`, `demo` uses `CLAUDE_MODEL_DEMO` |
| `CLAUDE_MODEL_DEV` | Haiku 4.5 | Model for everyday work |
| `CLAUDE_MODEL_DEMO` | Sonnet 5 | Model for the final demo |
| `PORT` | `3000` | Backend port |
| `MAX_VALIDATION_RETRIES` | `3` | Automatic fix attempts per page |
| `MAX_ITERATIONS_PER_SESSION` | `15` | Edits allowed per website |
| `PAGE_CONCURRENCY` | `3` | How many pages are written by Claude at the same time (1 to 5). Lower it if you see rate-limit errors |
| `VISUAL_RESPONSIVE_CHECK` | `on` | Real layout check at 375 / 768 / 1280 px |
| `DB_PATH` | `backend/data/app.sqlite` | Use another database file |

## How it works

```
Browser (Vue) --> Express API --> Claude API: 1 plan call, then 1 call per page (1 to 5 pages)
                      |                |
                      |        axe-core + layout check on EVERY page, plus the site check
                      |        (headless Chromium, local, free)
                      |                |  problems? send them back to Claude to fix, up to 3 times
                      v                v
                  SQLite: sessions, history, cache, events (study log)
```

- `POST /api/generate`, `POST /api/refine`, `POST /api/session/:id/undo`,
  `GET /api/session/:id`, `GET /api/progress/:id` (live step of a running request).
- Results are cached (SQLite). The cache key includes the model and `PROMPT_VERSION`
  (`backend/src/promptEngineering.js`). **Bump `PROMPT_VERSION` whenever you change the prompts
  or the validation rules**, otherwise old answers keep being served.
- A website is a shared stylesheet plus 1 to 5 pages. The plan call decides how many pages and
  designs what they share (stylesheet, menu, footer); then every page is written by its own call,
  a few at a time, so no answer ever overflows the output limit. A change or an automatic fix
  returns only what changed: small find/replace edits (`cssEdits`, `htmlEdits`) for the
  stylesheet and for text repeated on all pages (the footer, a phone number), and complete
  pages only for new or restructured ones.
- In the preview, a click on a menu link inside the sandboxed frame (no JavaScript there) asks
  the browser to open `#page=slug` in the top window; the app listens for that and switches page.
- The download is one `.html` for a one-page site and a `.zip` (one html per page and a shared
  `style.css`) for several pages.
- Undo reads the session history, calls nothing, and does not refund the edit counter.
- The rationale and replacement guide come from a second, separate Claude call after the
  checks; if it fails, the page is still delivered.

## Project layout

```
backend/src/            API, validation loop, checkers, database, study log
backend/scripts/        benchmark, benchmark comparison, study export
backend/e2e/            end-to-end test, fake Claude, test harness
backend/tests/          Jest tests
frontend/src/           Vue app (components, English/Greek texts in i18n.js)
frontend/tests/         Vitest tests
```

## Cost

Measured with Haiku on real requests: a one-page site about **$0.06** and 1 minute; a site of
4 to 5 pages about **$0.19 to $0.20** and 2 to 3 minutes (Greek is slightly more expensive than
English); a change to an existing site a few cents. Sonnet costs about twice as much. Repeating an identical request is served from the cache and costs nothing.
Tests and the end-to-end run cost nothing. The benchmark and real use cost real money.

## Troubleshooting

- **"port already in use"**: another copy is still running. Close its terminal, or stop the
  process using port 3000 / 5173.
- **A red error banner after pressing Create**: the backend is not running, the API key is
  missing or invalid, or your API credit ran out. The backend terminal shows the exact reason.
- **Everything looks old after changing a prompt**: bump `PROMPT_VERSION`, or delete
  `backend/data/` to start with an empty database.
- **Greek text looks broken in Excel**: open the CSV by double-clicking it; the files start with
  a UTF-8 marker so Excel reads them correctly.
