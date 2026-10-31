<script setup>
import { t } from '../i18n.js';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { previewDocument } from '../sitePreview.js';

// The preview can be shown at the three widths the automatic layout check measures (375, 768
// and 1280 px; see visualResponsiveChecker.js in the backend), so what the check judged can be
// seen. The frame really is that wide, so the page's media queries respond as on that device.
// A frame wider than the space available is scaled down to fit, and a note says so. "Fit" is
// the original behaviour (the frame fills the panel) and stays the default.
const SIZES = [
  { key: 'fit', width: null },
  { key: 'phone', width: 375 },
  { key: 'tablet', width: 768 },
  { key: 'desktop', width: 1280 },
];
const FRAME_HEIGHT = 'clamp(420px, 72vh, 900px)';

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

const size = ref('fit');
const chosen = computed(() => SIZES.find((s) => s.key === size.value));

// The width available for the frame: measured as soon as the preview appears and whenever a
// size is chosen (so it never depends on an observer having fired), and kept up to date while
// the window is resized. A ResizeObserver only reports when the browser paints, which a hidden
// window does not do.
const stage = ref(null);
const stageWidth = ref(0);
const measure = () => {
  const width = stage.value?.clientWidth;
  if (width) stageWidth.value = width; // 0 means "not laid out" (e.g. a test environment): keep the last value
};
const observer =
  typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(([entry]) => {
        stageWidth.value = entry.contentRect.width;
      });
watch(stage, (el, old) => {
  if (old) observer?.unobserve(old);
  if (el) observer?.observe(el);
  measure();
});
watch(size, measure);
onBeforeUnmount(() => observer?.disconnect());

const scale = computed(() => {
  const width = chosen.value.width;
  if (!width || !stageWidth.value) return 1;
  return Math.min(1, stageWidth.value / width);
});

// The frame keeps the device width; when it is scaled down it is made taller by the same
// factor, so that it still fills the same visible height.
const frameStyle = computed(() => {
  const width = chosen.value.width;
  if (!width) return {};
  const s = scale.value;
  return s < 1
    ? { width: `${width}px`, height: `calc(${FRAME_HEIGHT} / ${s})`, transform: `scale(${s})`, transformOrigin: 'top left' }
    : { width: `${width}px` };
});
const scaledNote = computed(() =>
  scale.value < 1 ? t('preview.scaled', { width: chosen.value.width, percent: Math.round(scale.value * 100) }) : ''
);
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
    <template v-else>
      <div class="live-preview__sizes" role="group" :aria-label="t('preview.sizes')">
        <button
          v-for="option in SIZES"
          :key="option.key"
          type="button"
          class="live-preview__size"
          :class="{ 'is-active': size === option.key }"
          :aria-pressed="size === option.key"
          @click="size = option.key"
        >
          {{ t(`preview.size.${option.key}`) }} <span v-if="option.width" class="live-preview__px">{{ option.width }}</span>
        </button>
        <span v-if="scaledNote" class="live-preview__note">{{ scaledNote }}</span>
      </div>
      <div ref="stage" class="live-preview__stage" :class="{ 'is-device': chosen.width }">
        <iframe
          class="live-preview__frame"
          :style="frameStyle"
          :srcdoc="srcdoc"
          sandbox="allow-same-origin allow-top-navigation-by-user-activation"
          :title="t('preview.frameTitle')"
        />
      </div>
    </template>
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
.live-preview__sizes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.6rem;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
}
.live-preview__size {
  min-height: 2rem;
  padding: 0.2rem 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.live-preview__size:hover:not(.is-active) {
  border-color: var(--primary);
}
.live-preview__size.is-active {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
}
.live-preview__px {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.live-preview__note {
  font-size: 0.85rem;
  color: var(--muted);
}
/* The frame at a device width sits in the middle of a neutral area; the area keeps the usual
   preview height and hides whatever the scaled frame does not need. */
.live-preview__stage {
  overflow: hidden;
}
.live-preview__stage.is-device {
  height: clamp(420px, 72vh, 900px);
  background: var(--surface-2);
}
.live-preview__stage.is-device .live-preview__frame {
  margin: 0 auto;
  box-shadow: var(--shadow);
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
