<script setup>
import { t } from '../i18n.js';
defineProps({
  rationale: { type: Object, default: null },
});
</script>

<template>
  <details v-if="rationale" class="rationale" open>
    <summary class="rationale__title">{{ t('rationale.title') }}</summary>

    <p v-if="rationale.summary" class="rationale__summary">{{ rationale.summary }}</p>

    <dl class="rationale__list">
      <template v-if="rationale.audience">
        <dt>{{ t('rationale.audience') }}</dt>
        <dd>{{ rationale.audience }}</dd>
      </template>

      <template v-if="rationale.colors.length">
        <dt>{{ t('rationale.colors') }}</dt>
        <dd>
          <ul class="rationale__colors">
            <li v-for="(c, i) in rationale.colors" :key="i" class="rationale__color">
              <span
                v-if="c.hex"
                class="rationale__swatch"
                :style="{ backgroundColor: c.hex }"
                aria-hidden="true"
              />
              <span>
                <strong>{{ c.name }}</strong>
                <span v-if="c.hex" class="rationale__hex"> {{ c.hex }}</span>
                <span v-if="c.why">: {{ c.why }}</span>
              </span>
            </li>
          </ul>
        </dd>
      </template>

      <template v-if="rationale.typography">
        <dt>{{ t('rationale.typography') }}</dt>
        <dd>{{ rationale.typography }}</dd>
      </template>

      <template v-if="rationale.layout">
        <dt>{{ t('rationale.layout') }}</dt>
        <dd>{{ rationale.layout }}</dd>
      </template>

      <template v-if="rationale.conversion">
        <dt>{{ t('rationale.conversion') }}</dt>
        <dd>{{ rationale.conversion }}</dd>
      </template>
    </dl>

    <p class="rationale__note">{{ t('rationale.note') }}</p>
  </details>
</template>

<style scoped>
.rationale {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.15rem;
  background: var(--surface);
  box-shadow: var(--shadow);
}
.rationale__title {
  cursor: pointer;
  font-weight: 750;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
}
.rationale__summary {
  margin: 0.85rem 0 0;
  font-size: 1rem;
}
.rationale__list {
  margin: 0.75rem 0 0;
}
.rationale__list dt {
  margin-top: 0.85rem;
  font-weight: 750;
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--primary-text);
}
.rationale__list dd {
  margin: 0.25rem 0 0;
  font-size: 0.94rem;
}
.rationale__colors {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.rationale__color {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
}
.rationale__swatch {
  flex: none;
  width: 1.3rem;
  height: 1.3rem;
  margin-top: 0.1rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
}
.rationale__hex {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.85em;
  color: var(--muted);
}
.rationale__note {
  margin: 1rem 0 0;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
  font-size: 0.8rem;
  color: var(--muted);
}
</style>
