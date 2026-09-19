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
  border: 1px solid #f0d090;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  background: #fffaf0;
}
.guide__title {
  cursor: pointer;
  font-weight: 700;
  font-size: 1.05rem;
}
.guide__intro {
  margin: 0.75rem 0 0;
  font-size: 0.92rem;
}
.guide__heading {
  margin: 1rem 0 0.3rem;
  font-size: 0.95rem;
}
.guide__steps {
  margin: 0;
  padding-left: 1.2rem;
  font-size: 0.92rem;
}
.guide__steps li + li {
  margin-top: 0.4rem;
}
.guide__tip {
  margin: 0.75rem 0 0;
  font-size: 0.9rem;
}
.guide__empty {
  font-size: 0.9rem;
  color: #666;
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
  background: #fff;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 0.55rem 0.75rem;
}
.guide__what {
  margin: 0;
  font-weight: 700;
  font-size: 0.92rem;
}
.guide__meta {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}
.guide__meta span {
  color: #666;
}
code {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.9em;
  background: #f2f2f2;
  padding: 0 0.25rem;
  border-radius: 3px;
}
kbd {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.85em;
  border: 1px solid #ccc;
  border-radius: 3px;
  padding: 0 0.3rem;
  background: #fff;
}
</style>
