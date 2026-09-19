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
  border: 1px solid #ccc;
  border-radius: 6px;
  overflow: hidden;
}
.lang__btn {
  padding: 0.3rem 0.75rem;
  border: none;
  background: #fff;
  color: #333;
  font-size: 0.85rem;
  cursor: pointer;
}
.lang__btn + .lang__btn {
  border-left: 1px solid #ccc;
}
.lang__btn.is-active {
  background: #2f6f4f;
  color: #fff;
  font-weight: 600;
}
.lang__btn:focus-visible {
  outline: 2px solid #2f6f4f;
  outline-offset: -2px;
}
</style>
