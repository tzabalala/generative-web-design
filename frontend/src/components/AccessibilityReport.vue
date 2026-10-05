<script setup>
import { computed } from 'vue';
import { t, tn } from '../i18n.js';

const props = defineProps({
  validation: { type: Object, default: null },
});

// Step 16: plain-language summary. The non-technical user does not need to know
// what "axe-core" or "WCAG" mean, only what was checked and whether it passed.
// `label` is a translation key.
const CHECKS = [
  { key: 'accessibility', label: 'report.accessibility' },
  { key: 'responsive', label: 'report.responsive' },
  // only for a website of several pages (older results and one-page sites have no such check)
  { key: 'site', label: 'report.site' },
];

const visibleChecks = computed(() => CHECKS.filter((c) => c.key !== 'site' || props.validation?.site));

function statusOf(validation, key) {
  if (!validation || !validation[key]) return null;
  return validation[key].passed;
}
</script>

<template>
  <div class="a11y-report">
    <h2>{{ t('report.title') }}</h2>
    <p v-if="!validation" class="a11y-report__empty">{{ t('report.empty') }}</p>
    <ul v-else class="a11y-report__list">
      <li v-for="check in visibleChecks" :key="check.key" class="a11y-report__item">
        <span
          class="a11y-report__icon"
          :class="statusOf(validation, check.key) ? 'is-ok' : 'is-warn'"
        >
          {{ statusOf(validation, check.key) ? '✓' : '⚠' }}
        </span>
        <span>{{ t(check.label) }}</span>
      </li>
    </ul>

    <div v-if="validation && !validation.passed" class="a11y-report__warning">
      <p>{{ tn('report.warning', validation.attempts + 1) }}</p>
      <ul>
        <li v-for="(issue, i) in validation.remainingIssues" :key="i">{{ issue }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.a11y-report {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.a11y-report h2 {
  font-size: 1.05rem;
  margin: 0;
  letter-spacing: -0.01em;
}
.a11y-report__empty {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.a11y-report__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.a11y-report__item {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  font-size: 0.9rem;
}
.a11y-report__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  font-size: 0.8rem;
  font-weight: 800;
}
.a11y-report__icon.is-ok {
  color: var(--ok);
  background: var(--ok-bg);
}
.a11y-report__icon.is-warn {
  color: var(--warn);
  background: var(--warn-bg);
}
.a11y-report__warning {
  padding: 0.75rem 0.9rem;
  background: var(--warn-bg);
  border: 1px solid var(--warn);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  color: var(--text);
}
.a11y-report__warning p {
  margin: 0;
  font-weight: 650;
}
.a11y-report__warning ul {
  margin: 0.4rem 0 0;
  padding-left: 1.1rem;
  overflow-wrap: anywhere;
}
</style>
