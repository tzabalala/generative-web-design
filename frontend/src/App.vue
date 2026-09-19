<script setup>
import { ref, computed, onMounted } from 'vue';
import { generatePage, refinePage, undoPage, getSession } from './api.js';
import { loadSessionId, saveSessionId, forgetSessionId } from './sessionMemory.js';
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

const mode = computed(() => (sessionId.value ? 'refine' : 'generate'));
const limitReached = computed(() => iterationsUsed.value >= iterationsLimit.value);

async function handleSubmit(text) {
  loading.value = true;
  error.value = null;
  notice.value = null;
  try {
    let res;
    if (!sessionId.value) {
      res = await generatePage(text);
      sessionId.value = res.sessionId;
      saveSessionId(res.sessionId);
      iterationsUsed.value = 1;
      history.value = [{ prompt: text, validation: res.validation }];
    } else {
      res = await refinePage(sessionId.value, text);
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
    error.value = err.message;
  } finally {
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
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

// Ξεκινά από το μηδέν: ξεχνά το τρέχον session ώστε το επόμενο κείμενο να πάει
// στο /generate (νέα σελίδα) και όχι στο /refine (αλλαγή της ίδιας σελίδας).
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

// Επαναφορά μετά από reload: ζητά το session από το backend (που το έχει στη βάση).
// Μόνο ένα 404 (το session δεν υπάρχει πια) το «ξεχνά» — αν απλώς το backend είναι
// προσωρινά εκτός, κρατάμε το id για να δουλέψει στην επόμενη προσπάθεια.
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
    notice.value = 'Συνεχίζεις από εκεί που είχες μείνει.';
  } catch (err) {
    if (err.status === 404) {
      forgetSessionId();
      notice.value = 'Η προηγούμενη σελίδα δεν βρέθηκε πια. Ξεκίνα μια νέα.';
    } else {
      notice.value = 'Δεν μπόρεσα να φορτώσω την προηγούμενη σελίδα (ο server δεν απαντά).';
    }
  }
}

onMounted(restoreSession);

function handleDownload() {
  const fullPage = buildDownloadHtml({
    html: html.value,
    css: css.value,
    placeholders: placeholders.value,
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
      <h1>Generative AI-Driven Web Design</h1>
      <p class="app__subtitle">
        Περιέγραψε μια σελίδα σε φυσική γλώσσα — ο κώδικας ελέγχεται αυτόματα για
        προσβασιμότητα και responsive design πριν φτάσει σε σένα.
      </p>
    </header>

    <div v-if="error" class="app__error">{{ error }}</div>
    <p v-if="notice" class="app__notice" role="status">{{ notice }}</p>

    <main class="app__layout">
      <section class="app__column app__column--controls">
        <PromptForm
          :loading="loading"
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
          + Νέα σελίδα (ξεκίνα από την αρχή)
        </button>
        <p v-if="limitReached" class="app__limit-warning">
          Έχεις φτάσει το μέγιστο αριθμό επεξεργασιών ({{ iterationsLimit }}) για αυτή τη σελίδα.
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
          <h2>Προεπισκόπηση</h2>
          <button
            class="app__download"
            type="button"
            :disabled="!html"
            @click="handleDownload"
          >
            ⬇ Λήψη HTML
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

/* Βήμα 18: το ίδιο το εργαλείο (όχι μόνο το generated output) πρέπει να είναι responsive */
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
