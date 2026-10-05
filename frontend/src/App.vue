<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { generatePage, refinePage, undoPage, getSession, getProgress } from './api.js';
import { newRequestId } from './requestId.js';
import { getParticipantCode } from './studyContext.js';
import { loadSessionId, saveSessionId, forgetSessionId } from './sessionMemory.js';
import { t, locale, hasMessage } from './i18n.js';
import LanguageToggle from './components/LanguageToggle.vue';
import ThemeToggle from './components/ThemeToggle.vue';
import PromptForm from './components/PromptForm.vue';
import LivePreview from './components/LivePreview.vue';
import RefinementPanel from './components/RefinementPanel.vue';
import AccessibilityReport from './components/AccessibilityReport.vue';
import DesignRationale from './components/DesignRationale.vue';
import PlaceholderGuide from './components/PlaceholderGuide.vue';
import { buildDownload } from './downloadPage.js';
import { slugFromHash } from './sitePreview.js';

const sessionId = ref(null);
// The website being shown: a shared stylesheet and 1 to 5 pages [{ slug, title, html, css }].
const css = ref('');
const pages = ref([]);
const activeSlug = ref(''); // the page shown in the preview (and the hint sent with a change)
const validation = ref(null);
const rationale = ref(null);
const placeholders = ref([]);
const history = ref([]);
const iterationsUsed = ref(0);
const iterationsLimit = ref(15);
const loading = ref(false);
const error = ref(null);
const notice = ref(null);
const stage = ref(null); // live step of a running request, e.g. { stage: 'fixing', attempt: 1, max: 3 }

const PROGRESS_POLL_MS = 800;

// While a generate/refine request runs (1-2 minutes), ask the backend every moment which
// step it is on. Best effort: a failed poll is ignored, the request itself is what matters.
// Returns a function that stops the polling.
function startProgress(requestId) {
  stage.value = null;
  let stopped = false;
  let inFlight = false;
  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const progress = await getProgress(requestId);
      if (!stopped && progress && progress.stage) stage.value = progress;
    } catch {
      /* ignored */
    } finally {
      inFlight = false;
    }
  };
  const timer = setInterval(tick, PROGRESS_POLL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
    stage.value = null;
  };
}

// A known error code from the backend is translated; anything else shows its own message.
function errorText(err) {
  const key = err.code ? `error.${err.code}` : null;
  return key && hasMessage(key) ? t(key, { limit: iterationsLimit.value }) : err.message;
}

const hasSite = computed(() => pages.value.length > 0);

// Shows a site returned by the backend. The page being viewed stays selected if it still
// exists; otherwise the home page (the first) is shown.
function showSite(res) {
  css.value = res.css ?? '';
  pages.value = res.pages ?? [];
  if (!pages.value.some((p) => p.slug === activeSlug.value)) activeSlug.value = pages.value[0]?.slug ?? '';
}

const mode = computed(() => (sessionId.value ? 'refine' : 'generate'));
const limitReached = computed(() => iterationsUsed.value >= iterationsLimit.value);

async function handleSubmit(text) {
  loading.value = true;
  error.value = null;
  notice.value = null;
  const requestId = newRequestId();
  const stopProgress = startProgress(requestId);
  try {
    let res;
    if (!sessionId.value) {
      activeSlug.value = ''; // a new website opens on its home page
      res = await generatePage(text, {
        requestId,
        participant: getParticipantCode() ?? undefined,
      });
      sessionId.value = res.sessionId;
      saveSessionId(res.sessionId);
      iterationsUsed.value = 1;
      history.value = [{ prompt: text, validation: res.validation }];
    } else {
      res = await refinePage(sessionId.value, text, { requestId, currentPage: activeSlug.value });
      iterationsUsed.value = res.iterationsUsed;
      iterationsLimit.value = res.iterationsLimit;
      history.value = [...history.value, { prompt: text, validation: res.validation }];
    }
    showSite(res);
    validation.value = res.validation;
    rationale.value = res.rationale ?? null;
    placeholders.value = res.placeholders ?? [];
  } catch (err) {
    error.value = err;
  } finally {
    stopProgress();
    loading.value = false;
  }
}

async function handleUndo() {
  if (!sessionId.value || history.value.length <= 1) return;
  loading.value = true;
  error.value = null;
  try {
    const res = await undoPage(sessionId.value);
    showSite(res);
    validation.value = res.validation;
    rationale.value = res.rationale ?? null;
    placeholders.value = res.placeholders ?? [];
    history.value = history.value.slice(0, -1);
    if (typeof res.iterationsUsed === 'number') iterationsUsed.value = res.iterationsUsed;
    if (typeof res.iterationsLimit === 'number') iterationsLimit.value = res.iterationsLimit;
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

// Starts from scratch: forgets the current session so the next text goes to
// /generate (a new page) and not to /refine (a change to the same page).
function handleNewPage() {
  sessionId.value = null;
  pages.value = [];
  css.value = '';
  activeSlug.value = '';
  validation.value = null;
  rationale.value = null;
  placeholders.value = [];
  history.value = [];
  iterationsUsed.value = 0;
  error.value = null;
  notice.value = null;
  forgetSessionId();
}

// Restore after a reload: asks the backend (which stores it in the database) for the session.
// Only a 404 (the session no longer exists) makes it forget the id (if the backend is
// just temporarily down we keep the id so it works on the next attempt).
async function restoreSession() {
  const savedId = loadSessionId();
  if (!savedId) return;
  try {
    const saved = await getSession(savedId);
    const last = saved.history[saved.history.length - 1];
    if (!last) throw Object.assign(new Error('empty session'), { status: 404 });

    sessionId.value = savedId;
    showSite(last);
    validation.value = last.validation;
    rationale.value = last.rationale ?? null;
    placeholders.value = last.placeholders ?? [];
    history.value = saved.history.map((e) => ({ prompt: e.prompt, validation: e.validation }));
    iterationsUsed.value = saved.iterationsUsed;
    iterationsLimit.value = saved.iterationsLimit;
    notice.value = 'notice.resumed';
  } catch (err) {
    if (err.status === 404) {
      forgetSessionId();
      notice.value = 'notice.notFound';
    } else {
      notice.value = 'notice.unreachable';
    }
  }
}

// A click on a menu link inside the preview asks the browser to go to "#page=about" (see
// sitePreview.js). That is not a real navigation: switch to the page, then clear the hash so
// the same link works again next time.
function onHashChange() {
  const slug = slugFromHash(window.location.hash, pages.value.map((p) => p.slug));
  if (slug) activeSlug.value = slug;
  if (window.location.hash.startsWith('#page=')) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

onMounted(() => {
  window.addEventListener('hashchange', onHashChange);
  restoreSession();
});
onBeforeUnmount(() => window.removeEventListener('hashchange', onHashChange));

function handleDownload() {
  const { filename, type, data } = buildDownload({
    pages: pages.value,
    css: css.value,
    placeholders: placeholders.value,
    locale: locale.value,
  });
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="app">
    <header class="app__header">
      <div class="app__header-row">
        <div class="app__brand">
          <span class="app__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
              <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
            </svg>
          </span>
          <div>
            <h1>Generative AI-Driven Web Design</h1>
            <p class="app__tagline">{{ t('app.tagline') }}</p>
          </div>
        </div>
        <div class="app__tools">
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </div>
      <p class="app__subtitle">{{ t('app.subtitle') }}</p>
    </header>

    <!-- role="alert": screen readers announce an error as soon as it appears -->
    <div v-if="error" class="app__error" role="alert">{{ errorText(error) }}</div>
    <p v-if="notice" class="app__notice" role="status">{{ t(notice) }}</p>

    <section v-if="!sessionId" class="how" :aria-label="t('how.title')">
      <h2 class="how__title">{{ t('how.title') }}</h2>
      <ol class="how__steps">
        <li v-for="n in 3" :key="n" class="how__step">
          <span class="how__num" aria-hidden="true">{{ n }}</span>
          <div>
            <p class="how__step-title">{{ t(`how.${n}.title`) }}</p>
            <p class="how__step-text">{{ t(`how.${n}.text`) }}</p>
          </div>
        </li>
      </ol>
    </section>

    <main class="app__layout" :class="{ 'app__layout--has-site': hasSite }">
      <section class="app__column app__column--controls">
        <PromptForm
          :loading="loading"
          :stage="stage"
          :mode="mode"
          :disabled="limitReached"
          @submit="handleSubmit"
        />
        <button
          v-if="sessionId"
          class="app__new-page"
          type="button"
          :disabled="loading"
          @click="handleNewPage"
        >
          {{ t('app.newPage') }}
        </button>
        <p v-if="limitReached" class="app__limit-warning">
          {{ t('app.limitReached', { limit: iterationsLimit }) }}
        </p>

        <RefinementPanel
          v-if="history.length"
          :history="history"
          :iterations-used="iterationsUsed"
          :iterations-limit="iterationsLimit"
          :can-undo="history.length > 1"
          :undo-disabled="loading"
          @undo="handleUndo"
        />
      </section>

      <section class="app__column app__column--preview">
        <div class="app__preview-header">
          <h2>{{ t('app.preview') }}</h2>
          <button
            class="app__download"
            type="button"
            :disabled="!hasSite"
            @click="handleDownload"
          >
            {{ pages.length > 1 ? t('app.downloadSite') : t('app.download') }}
          </button>
        </div>
        <LivePreview :pages="pages" :css="css" :active-slug="activeSlug" @select="activeSlug = $event" />
        <DesignRationale :rationale="rationale" />
        <PlaceholderGuide v-if="hasSite" :placeholders="placeholders" />
      </section>

      <section class="app__column app__column--report">
        <AccessibilityReport :validation="validation" />
      </section>
    </main>
  </div>
</template>

<style scoped>
.app {
  max-width: 1440px;
  margin: 0 auto;
  padding: 1.25rem 1.5rem 3rem;
}

/* ---- header ---- */
.app__header {
  margin-bottom: 1.25rem;
}
.app__header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
}
.app__brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}
.app__logo {
  flex: none;
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(135deg, #4f46e5, #9333ea);
  box-shadow: 0 6px 18px rgba(79, 70, 229, 0.35);
}
.app__header h1 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 750;
  letter-spacing: -0.02em;
}
.app__tagline {
  margin: 0.1rem 0 0;
  font-size: 0.9rem;
  color: var(--muted);
}
.app__tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.app__subtitle {
  margin: 1.25rem 0 0;
  max-width: 62ch;
  font-size: 1.2rem;
  line-height: 1.45;
  font-weight: 550;
  letter-spacing: -0.01em;
}

/* ---- how it works ---- */
.how {
  margin-bottom: 1.5rem;
}
.how__title {
  margin: 0 0 0.6rem;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.how__steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.9rem;
}
.how__step {
  display: flex;
  gap: 0.8rem;
  align-items: flex-start;
  padding: 0.95rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.how__num {
  flex: none;
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary-text);
  font-weight: 750;
  font-size: 0.9rem;
}
.how__step-title {
  margin: 0;
  font-weight: 700;
}
.how__step-text {
  margin: 0.15rem 0 0;
  font-size: 0.9rem;
  color: var(--muted);
}

/* ---- messages ---- */
.app__error {
  background: var(--danger-bg);
  border: 1px solid var(--danger);
  color: var(--danger);
  padding: 0.7rem 1rem;
  border-radius: var(--radius-sm);
  margin-bottom: 1rem;
  font-weight: 550;
}
.app__notice {
  margin: 0 0 1rem;
  padding: 0.6rem 1rem;
  border-radius: var(--radius-sm);
  background: var(--ok-bg);
  border: 1px solid var(--ok);
  color: var(--ok);
  font-size: 0.92rem;
  font-weight: 550;
}
.app__limit-warning {
  margin: 0;
  color: var(--warn);
  font-size: 0.85rem;
}

/* ---- layout ---- */
.app__layout {
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr) minmax(230px, 290px);
  gap: 1.25rem;
  align-items: start;
}
.app__column {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}
.app__column--controls,
.app__column--report {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 1.15rem;
}
.app__column--preview {
  min-height: 500px;
}
.app__preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}
.app__preview-header h2 {
  font-size: 1.1rem;
  margin: 0;
  letter-spacing: -0.01em;
}
.app__new-page {
  align-self: flex-start;
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font-weight: 650;
  font-size: 0.9rem;
  cursor: pointer;
}
.app__new-page:hover:not(:disabled) {
  background: var(--surface-2);
}
.app__new-page:disabled {
  color: var(--muted);
  opacity: 0.6;
  cursor: not-allowed;
}
.app__download {
  padding: 0.5rem 1.1rem;
  border: 1px solid var(--primary);
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary-text);
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
}
.app__download:hover:not(:disabled) {
  background: var(--primary);
  color: var(--on-primary);
}
.app__download:disabled {
  color: var(--muted);
  border-color: var(--border);
  background: transparent;
  cursor: not-allowed;
}

/* Step 18: the tool itself (not only the generated output) must be responsive */
@media (max-width: 1100px) {
  .app__layout {
    grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  }
  .app__column--report {
    grid-column: 1 / -1;
  }
}
@media (max-width: 900px) {
  .app {
    padding: 1rem 1rem 2.5rem;
  }
  .app__layout {
    grid-template-columns: 1fr;
  }
  .app__column--preview {
    min-height: 0;
  }
  /* On a phone the form comes first until there is a website; then the website comes first */
  .app__layout--has-site .app__column--preview {
    order: -1;
  }
  .how__steps {
    grid-template-columns: 1fr;
  }
  .app__subtitle {
    font-size: 1.05rem;
  }
}
</style>
