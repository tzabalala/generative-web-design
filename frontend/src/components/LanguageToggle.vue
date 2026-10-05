<script setup>
import { locale, setLocale, t } from '../i18n.js';

// Each option is labelled in its OWN language and carries `lang`, so screen readers
// pronounce it correctly whatever the current UI language is.
const OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'el', label: 'Ελληνικά' },
];
</script>

<template>
  <div class="lang" role="group" :aria-label="t('lang.label')">
    <button
      v-for="option in OPTIONS"
      :key="option.code"
      type="button"
      class="lang__btn"
      :class="{ 'is-active': locale === option.code }"
      :aria-pressed="locale === option.code"
      :lang="option.code"
      @click="setLocale(option.code)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.lang {
  display: inline-flex;
  padding: 0.2rem;
  gap: 0.15rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface);
}
.lang__btn {
  padding: 0.3rem 0.8rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.lang__btn:hover:not(.is-active) {
  background: var(--surface-2);
}
.lang__btn.is-active {
  background: var(--primary);
  color: var(--on-primary);
}
</style>
