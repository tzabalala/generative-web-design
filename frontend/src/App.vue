<script setup>
import { ref, computed, onMounted } from 'vue';
import { generatePage, refinePage, undoPage, getSession, getProgress } from './api.js';
import { newRequestId } from './requestId.js';
import { getParticipantCode } from './studyContext.js';
import { loadSessionId, saveSessionId, forgetSessionId } from './sessionMemory.js';
import { t, locale, hasMessage } from './i18n.js';
import LanguageToggle from './components/LanguageToggle.vue';
import PromptForm from './components/PromptForm.vue';
import LivePreview from './components/LivePreview.vue';
import RefinementPanel from './components/RefinementPanel.vue';
import AccessibilityReport from './components/AccessibilityReport.vue';
import DesignRationale from './components/DesignRationale.vue';
import PlaceholderGuide from './components/PlaceholderGuide.vue';
import { buildDownloadHtml } from './downloadPage.js';

const sessionId = ref(null);
const html = ref('');
const css = ref('');
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
      res = await generatePage(text, {
        requestId,
        participant: getParticipantCode() ?? undefined,
      });
      sessionId.value = res.sessionId;
      saveSessionId(res.sessionId);
      iterationsUsed.value = 1;
      history.value = [{ prompt: text, validation: res.validation }];
    } else {
      res = await refinePage(sessionId.value, text, { requestId });
      iterationsUsed.value = res.iterationsUsed;
      iterationsLimit.value = res.iterationsLimit;
      history.value = [...history.value, { prompt: text, validation: res.validation }];
    }
    html.value = res.html;
    css.value = res.css;
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
    html.value = res.html;
    css.value = res.css;
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
  html.value = '';
  css.value = '';
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
// Only a 404 (the session no longer exists) makes it forget the id — if the backend is
// just temporarily down we keep the id so it works on the next attempt.
async function restoreSession() {
  const savedId = loadSessionId();
  if (!savedId) return;
  try {
    const saved = await getSession(savedId);
    const last = saved.history[saved.history.length - 1];
    if (!last) throw Object.assign(new Error('empty session'), { status: 404 });

    sessionId.value = savedId;
    html.value = last.html;
    css.value = last.css;
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

onMounted(restoreSession);

function handleDownload() {
  const fullPage = buildDownloadHtml({
    html: html.value,
    css: css.value,
    placeholders: placeholders.value,
    locale: locale.value,
  });
  const blob = new Blob([fullPage], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'page.html';
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="app">
    <header class="app__header">
      <div class="app__header-row">
        <h1>Generative AI-Driven Web Design</h1>
        <LanguageToggle />
      </div>
      <p class="app__subtitle">{{ t('app.subtitle') }}</p>
    </header>

    <!-- role="alert": screen readers announce an error as soon as it appears -->
    <div v-if="error" class="app__error" role="alert">{{ errorText(error) }}</div>
    <p v-if="notice" class="app__notice" role="status">{{ t(notice) }}</p>

    <main class="app__layout">
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
            :disabled="!html"
            @click="handleDownload"
          >
            {{ t('app.download') }}
          </button>
        </div>
        <LivePreview :html="html" :css="css" />
        <DesignRationale :rationale="rationale" />
        <PlaceholderGuide v-if="html" :placeholders="placeholders" />
      </section>

      <section class="app__column app__column--report">
        <AccessibilityReport :validation="validation" />
      </section>
    </main>
  </div>
</template>

<style scoped>
.app {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1.5rem;
}
.app__header h1 {
  font-size: 1.6rem;
  margin: 0 0 0.25rem;
}
.app__header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
}
.app__subtitle {
  color: #555;
  margin: 0 0 1.25rem;
  max-width: 60ch;
}
.app__error {
  background: #fdecec;
  border: 1px solid #e5a3a3;
  color: #a12f2f;
  padding: 0.6rem 0.9rem;
  border-radius: 6px;
  margin-bottom: 1rem;
}
.app__notice {
  margin: 0 0 1rem;
  padding: 0.5rem 0.9rem;
  border-radius: 6px;
  background: #eef6f1;
  border: 1px solid #b9d8c7;
  color: #245239;
  font-size: 0.9rem;
}
.app__limit-warning {
  color: #a15c00;
  font-size: 0.85rem;
}
.app__layout {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(0, 2fr) minmax(220px, 1fr);
  gap: 1.5rem;
  align-items: start;
}
.app__column {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.app__column--controls,
.app__column--report {
  background: #fafafa;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 1rem;
}
.app__column--preview {
  min-height: 500px;
}
.app__preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.app__preview-header h2 {
  font-size: 1.05rem;
  margin: 0;
}
.app__new-page {
  align-self: flex-start;
  padding: 0.4rem 0.9rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
  font-weight: 600;
  cursor: pointer;
}
.app__new-page:disabled {
  color: #aaa;
  cursor: not-allowed;
}
.app__download {
  padding: 0.4rem 0.9rem;
  border: 1px solid #2f6f4f;
  border-radius: 6px;
  background: #fff;
  color: #2f6f4f;
  font-weight: 600;
  cursor: pointer;
}
.app__download:disabled {
  color: #aaa;
  border-color: #ccc;
  cursor: not-allowed;
}

/* Step 18: the tool itself (not only the generated output) must be responsive */
@media (max-width: 900px) {
  .app__layout {
    grid-template-columns: 1fr;
  }
  .app__column--preview {
    min-height: 400px;
    order: -1;
  }
}
</style>
