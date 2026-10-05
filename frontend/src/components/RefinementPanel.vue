<script setup>
import { computed } from 'vue';
import { t, tn } from '../i18n.js';

const props = defineProps({
  history: { type: Array, default: () => [] },
  iterationsUsed: { type: Number, default: 0 },
  iterationsLimit: { type: Number, default: 15 },
  canUndo: { type: Boolean, default: false },
  undoDisabled: { type: Boolean, default: false },
});
const emit = defineEmits(['undo']);

// Newest first: the latest change is at the very top and the first idea is at the bottom.
// `index` is the position in the real history (0 = the initial request), kept for the label.
const entries = computed(() => props.history.map((entry, index) => ({ entry, index })).reverse());
const latestIndex = computed(() => props.history.length - 1);
</script>

<template>
  <div class="refinement-panel">
    <div class="refinement-panel__header">
      <h2>{{ t('history.title') }}</h2>
      <span class="refinement-panel__counter">
        {{ t('history.counter', { used: iterationsUsed, limit: iterationsLimit }) }}
      </span>
    </div>

    <!-- The undo button sits next to the newest entry, because that is the one it undoes -->
    <button
      class="refinement-panel__undo"
      type="button"
      :disabled="!canUndo || undoDisabled"
      @click="emit('undo')"
    >
      {{ t('history.undo') }}
    </button>

    <ol class="refinement-panel__list">
      <li
        v-for="{ entry, index } in entries"
        :key="index"
        class="refinement-panel__entry"
        :class="{ 'is-latest': index === latestIndex && history.length > 1 }"
      >
        <span class="refinement-panel__badge">
          {{ index === 0 ? t('history.initial') : t('history.step', { n: index }) }}
        </span>
        <span v-if="index === latestIndex && history.length > 1" class="refinement-panel__latest">
          {{ t('history.latest') }}
        </span>
        <p class="refinement-panel__prompt">{{ entry.prompt }}</p>
        <p
          v-if="entry.validation"
          class="refinement-panel__status"
          :class="entry.validation.passed ? 'is-ok' : 'is-warn'"
        >
          {{ entry.validation.passed
            ? t('history.passed')
            : tn('history.issues', entry.validation.remainingIssues.length) }}
        </p>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.refinement-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border-top: 1px solid var(--border);
  padding-top: 1rem;
}
.refinement-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.refinement-panel__header h2 {
  font-size: 1.05rem;
  margin: 0;
  letter-spacing: -0.01em;
}
.refinement-panel__counter {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
}
.refinement-panel__undo {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font-weight: 650;
  font-size: 0.88rem;
}
.refinement-panel__undo:hover:not(:disabled) {
  background: var(--surface-2);
}
.refinement-panel__undo:disabled {
  color: var(--muted);
  opacity: 0.6;
  cursor: not-allowed;
}
.refinement-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  overflow-y: auto;
  max-height: 60vh;
}
.refinement-panel__entry {
  background: var(--surface-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 0.7rem 0.85rem;
}
.refinement-panel__entry.is-latest {
  border-color: var(--primary);
  background: var(--primary-soft);
}
.refinement-panel__badge {
  font-size: 0.7rem;
  font-weight: 750;
  text-transform: uppercase;
  color: var(--primary-text);
  letter-spacing: 0.06em;
}
.refinement-panel__latest {
  margin-left: 0.4rem;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.refinement-panel__prompt {
  margin: 0.3rem 0 0;
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}
.refinement-panel__status {
  margin: 0.4rem 0 0;
  font-size: 0.8rem;
  font-weight: 650;
}
.refinement-panel__status.is-ok {
  color: var(--ok);
}
.refinement-panel__status.is-warn {
  color: var(--warn);
}
</style>
