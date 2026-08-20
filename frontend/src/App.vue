<script setup>
import { ref, computed } from 'vue';
import { generatePage, refinePage, undoPage } from './api.js';
import PromptForm from './components/PromptForm.vue';
import LivePreview from './components/LivePreview.vue';
import RefinementPanel from './components/RefinementPanel.vue';
import AccessibilityReport from './components/AccessibilityReport.vue';

const sessionId = ref(null);
const html = ref('');
const css = ref('');
const validation = ref(null);
const history = ref([]);
const iterationsUsed = ref(0);
const iterationsLimit = ref(15);
const loading = ref(false);
const error = ref(null);

const mode = computed(() => (sessionId.value ? 'refine' : 'generate'));
const limitReached = computed(() => iterationsUsed.value >= iterationsLimit.value);

async function handleSubmit(text) {
  loading.value = true;
  error.value = null;
  try {
    let res;
    if (!sessionId.value) {
      res = await generatePage(text);
      sessionId.value = res.sessionId;
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
    history.value = history.value.slice(0, -1);
    iterationsUsed.value = Math.max(0, iterationsUsed.value - 1);
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function handleDownload() {
  const fullPage = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Η σελίδα μου</title>
<style>${css.value}</style>
</head>
<body>${html.value}</body>
</html>`;
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

    <main class="app__layout">
      <section class="app__column app__column--controls">
        <PromptForm
          :loading="loading"
          :mode="mode"
          :disabled="limitReached"
          @submit="handleSubmit"
        />
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
