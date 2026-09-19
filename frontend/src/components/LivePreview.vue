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
  height: 100%;
  min-height: 300px;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.live-preview__frame {
  width: 100%;
  height: 100%;
  min-height: 300px;
  border: none;
}
.live-preview__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  color: #888;
  padding: 2rem;
  text-align: center;
}
</style>
