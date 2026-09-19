<script setup>
import { t, tn } from '../i18n.js';
defineProps({
  history: { type: Array, default: () => [] },
  iterationsUsed: { type: Number, default: 0 },
  iterationsLimit: { type: Number, default: 15 },
  canUndo: { type: Boolean, default: false },
  undoDisabled: { type: Boolean, default: false },
});
const emit = defineEmits(['undo']);
</script>

<template>
  <div class="refinement-panel">
    <div class="refinement-panel__header">
      <h2>{{ t('history.title') }}</h2>
      <span class="refinement-panel__counter">
        {{ t('history.counter', { used: iterationsUsed, limit: iterationsLimit }) }}
      </span>
    </div>

    <ol class="refinement-panel__list">
      <li v-for="(entry, i) in history" :key="i" class="refinement-panel__entry">
        <span class="refinement-panel__badge">
          {{ i === 0 ? t('history.initial') : t('history.step', { n: i }) }}
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

    <button
      class="refinement-panel__undo"
      type="button"
      :disabled="!canUndo || undoDisabled"
      @click="emit('undo')"
    >
      {{ t('history.undo') }}
    </button>
  </div>
</template>

<style scoped>
.refinement-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
}
.refinement-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.refinement-panel__header h2 {
  font-size: 1.05rem;
  margin: 0;
}
.refinement-panel__counter {
  font-size: 0.8rem;
  color: #666;
}
.refinement-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  overflow-y: auto;
  flex: 1;
}
.refinement-panel__entry {
  background: #f7f7f7;
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
}
.refinement-panel__badge {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #2f6f4f;
  letter-spacing: 0.03em;
}
.refinement-panel__prompt {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
}
.refinement-panel__status {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
}
.refinement-panel__status.is-ok {
  color: #2f6f4f;
}
.refinement-panel__status.is-warn {
  color: #a15c00;
}
.refinement-panel__undo {
  padding: 0.5rem 1rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-weight: 600;
}
.refinement-panel__undo:disabled {
  color: #aaa;
  cursor: not-allowed;
}
</style>
