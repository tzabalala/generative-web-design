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

// Step 14: the iframe + srcdoc is the sandboxing mechanism — it isolates the
// generated code's CSS/JS from the rest of the tool.
const srcdoc = computed(() => {
  if (!current.value) return '';
  return previewDocument({ pages: props.pages, css: props.css, slug: current.value.slug });
});

// A short label for a tab: the page title before " - Site name", or the slug.
const label = (page) => (page.title ? page.title.split(/\s[-–—|]\s/)[0] : page.slug);
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
      {{ t('preview.empty') }}
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
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.live-preview__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.5rem;
  background: #f4f4f1;
  border-bottom: 1px solid #ddd;
}
.live-preview__tab {
  min-height: 2.25rem;
  padding: 0.3rem 0.85rem;
  border: 1px solid #c9c9c4;
  border-radius: 6px;
  background: #fff;
  color: #333;
  font-weight: 600;
  cursor: pointer;
}
.live-preview__tab.is-active {
  background: #2f6f4f;
  border-color: #2f6f4f;
  color: #fff;
}
/* Tall enough to judge a whole page without scrolling inside a tiny box: about 3/4 of the
   window height, never smaller than 420px or larger than 900px. */
.live-preview__frame {
  display: block;
  width: 100%;
  height: clamp(420px, 72vh, 900px);
  border: none;
}
.live-preview__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: clamp(420px, 72vh, 900px);
  color: #595959; /* 7:1 on white; the earlier #888 was only 3.5:1 (found by the end-to-end axe-core check) */
  padding: 2rem;
  text-align: center;
}
</style>
