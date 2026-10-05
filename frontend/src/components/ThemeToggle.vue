<script setup>
import { computed } from 'vue';
import { t } from '../i18n.js';
import { theme, toggleTheme } from '../theme.js';

const isDark = computed(() => theme.value === 'dark');
</script>

<template>
  <!-- A real toggle button: aria-pressed says whether dark mode is on, the label stays the same -->
  <button class="theme" type="button" :aria-pressed="isDark" @click="toggleTheme">
    <svg v-if="isDark" class="theme__icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
    </svg>
    <svg v-else class="theme__icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
    <span>{{ t('theme.dark') }}</span>
    <span class="theme__switch" :class="{ 'is-on': isDark }" aria-hidden="true"><span class="theme__knob" /></span>
  </button>
</template>

<style scoped>
.theme {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.6rem 0.35rem 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.theme:hover {
  background: var(--surface-2);
}
.theme__icon {
  flex: none;
}
.theme__switch {
  position: relative;
  width: 2.1rem;
  height: 1.2rem;
  border-radius: 999px;
  background: var(--border-strong);
  transition: background 0.2s ease;
}
.theme__switch.is-on {
  background: var(--primary);
}
.theme__knob {
  position: absolute;
  top: 0.15rem;
  left: 0.15rem;
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}
.theme__switch.is-on .theme__knob {
  transform: translateX(0.9rem);
}
</style>
