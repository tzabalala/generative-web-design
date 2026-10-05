<script setup>
import { t } from '../i18n.js';
import { computed } from 'vue';
import { previewDocument } from '../sitePreview.js';

const props = defineProps({
  // The website: the shared stylesheet and its pages [{ slug, title, html, css }].
  pages: { type: Array, default: () => [] },
  css: { type: String, default: '' },
  // Which page is shown (defaults to the first, the home page).
  activeSlug: { type: String, default: '' },
});
const emit = defineEmits(['select']);

const current = computed(() => props.pages.find((p) => p.slug === props.activeSlug) ?? props.pages[0]);

// Step 14: the iframe + srcdoc is the sandboxing mechanism. It isolates the
// generated code's CSS/JS from the rest of the tool.
const srcdoc = computed(() => {
  if (!current.value) return '';
  return previewDocument({ pages: props.pages, css: props.css, slug: current.value.slug });
});

// A short label for a tab: the page title before " - Site name", or the slug.
const label = (page) => (page.title ? page.title.split(/\s[-\u2013\u2014|]\s/)[0] : page.slug);
</script>

<template>
  <div class="live-preview">
    <!-- Only a website of several pages needs tabs. aria-current marks the page being shown. -->
    <div v-if="pages.length > 1" class="live-preview__tabs" role="group" :aria-label="t('preview.pages')">
      <button
        v-for="page in pages"
        :key="page.slug"
        type="button"
        class="live-preview__tab"
        :class="{ 'is-active': page.slug === current.slug }"
        :aria-current="page.slug === current.slug ? 'page' : undefined"
        @click="emit('select', page.slug)"
      >
        {{ label(page) }}
      </button>
    </div>
    <div v-if="!srcdoc" class="live-preview__empty">
      <span class="live-preview__empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
        </svg>
      </span>
      <p class="live-preview__empty-title">{{ t('preview.emptyTitle') }}</p>
      <p class="live-preview__empty-text">{{ t('preview.empty') }}</p>
    </div>
    <iframe
      v-else
      class="live-preview__frame"
      :srcdoc="srcdoc"
      sandbox="allow-same-origin allow-top-navigation-by-user-activation"
      :title="t('preview.frameTitle')"
    />
  </div>
</template>

<style scoped>
.live-preview {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--surface);
  box-shadow: var(--shadow);
}
.live-preview__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.6rem;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
}
.live-preview__tab {
  min-height: 2.3rem;
  padding: 0.3rem 1rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font-weight: 650;
  font-size: 0.9rem;
  cursor: pointer;
}
.live-preview__tab:hover:not(.is-active) {
  border-color: var(--primary);
}
.live-preview__tab.is-active {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
}
/* Tall enough to judge a whole page without scrolling inside a tiny box: about 3/4 of the
   window height, never smaller than 420px or larger than 900px. The frame is always white:
   the generated website is shown exactly as it was made, whatever the tool's theme is. */
.live-preview__frame {
  display: block;
  width: 100%;
  height: clamp(420px, 72vh, 900px);
  border: none;
  background: #fff;
}
.live-preview__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  height: clamp(420px, 72vh, 900px);
  padding: 2rem;
  text-align: center;
  background: var(--surface);
  color: var(--muted);
}
.live-preview__empty-icon {
  display: grid;
  place-items: center;
  width: 4rem;
  height: 4rem;
  margin-bottom: 0.5rem;
  border-radius: 20px;
  background: var(--primary-soft);
  color: var(--primary-text);
}
.live-preview__empty-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 750;
  letter-spacing: -0.01em;
  color: var(--text);
}
.live-preview__empty-text {
  margin: 0;
  max-width: 38ch;
}
@media (max-width: 900px) {
  .live-preview__empty {
    height: auto;
    min-height: 220px;
  }
}
</style>
