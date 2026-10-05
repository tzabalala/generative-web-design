<script setup>
import { t } from '../i18n.js';
import RichText from './RichText.vue';
defineProps({
  placeholders: { type: Array, default: () => [] },
});
</script>

<template>
  <details class="guide" open>
    <summary class="guide__title">{{ t('guide.title') }}</summary>

    <p class="guide__intro"><RichText :text="t('guide.intro')" /></p>

    <h3 class="guide__heading">{{ t('guide.waysTitle') }}</h3>
    <ol class="guide__steps">
      <li><RichText :text="t('guide.wayChat')" /></li>
      <li><RichText :text="t('guide.wayFile')" /></li>
    </ol>
    <p class="guide__tip"><RichText :text="t('guide.photos')" /></p>

    <h3 class="guide__heading">{{ t('guide.listTitle') }}</h3>
    <p v-if="!placeholders.length" class="guide__empty">{{ t('guide.empty') }}</p>
    <ul v-else class="guide__list">
      <li v-for="(p, i) in placeholders" :key="i" class="guide__item">
        <p class="guide__what">{{ p.what }}</p>
        <p v-if="p.where" class="guide__meta"><span>{{ t('guide.where') }}</span> {{ p.where }}</p>
        <p v-if="p.searchText" class="guide__meta">
          <span>{{ t('guide.search') }}</span> <code>{{ p.searchText }}</code>
        </p>
        <p v-if="p.replaceWith" class="guide__meta">
          <span>{{ t('guide.replace') }}</span> {{ p.replaceWith }}
        </p>
      </li>
    </ul>
  </details>
</template>

<style scoped>
.guide {
  border: 1px solid var(--border);
  border-left: 4px solid var(--warn);
  border-radius: var(--radius);
  padding: 1rem 1.15rem;
  background: var(--surface);
  box-shadow: var(--shadow);
}
.guide__title {
  cursor: pointer;
  font-weight: 750;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
}
.guide__intro {
  margin: 0.85rem 0 0;
  font-size: 0.94rem;
}
.guide__heading {
  margin: 1.1rem 0 0.35rem;
  font-size: 0.95rem;
}
.guide__steps {
  margin: 0;
  padding-left: 1.2rem;
  font-size: 0.92rem;
}
.guide__steps li + li {
  margin-top: 0.45rem;
}
.guide__tip {
  margin: 0.8rem 0 0;
  padding: 0.6rem 0.8rem;
  border-radius: var(--radius-sm);
  background: var(--warn-bg);
  font-size: 0.9rem;
}
.guide__empty {
  font-size: 0.9rem;
  color: var(--muted);
}
.guide__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.guide__item {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.65rem 0.85rem;
}
.guide__what {
  margin: 0;
  font-weight: 700;
  font-size: 0.92rem;
}
.guide__meta {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}
.guide__meta span {
  color: var(--muted);
}
code {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.9em;
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 0 0.3rem;
  border-radius: 4px;
}
kbd {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.85em;
  border: 1px solid var(--border-strong);
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 0 0.35rem;
  background: var(--surface);
}
</style>
