<script setup>
import { t } from '../i18n.js';
import { computed } from 'vue';

const props = defineProps({
  html: { type: String, default: '' },
  css: { type: String, default: '' },
});

// Step 14: the iframe + srcdoc is the sandboxing mechanism — it isolates the
// generated code's CSS/JS from the rest of the tool.
const srcdoc = computed(() => {
  if (!props.html && !props.css) return '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${props.css}</style>
</head>
<body>${props.html}</body>
</html>`;
});
</script>

<template>
  <div class="live-preview">
    <div v-if="!srcdoc" class="live-preview__empty">
      {{ t('preview.empty') }}
    </div>
    <iframe
      v-else
      class="live-preview__frame"
      :srcdoc="srcdoc"
      sandbox="allow-same-origin"
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
