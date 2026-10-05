<script setup>
import { computed } from 'vue';

const props = defineProps({
  text: { type: String, default: '' },
});

// Tiny, SAFE inline markup for translated strings: **bold**, `code`, [[Key]] -> <kbd>.
// It is rendered as real elements (never v-html), so translated text cannot inject HTML.
const parts = computed(() =>
  props.text
    .split(/(\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]]+\]\])/)
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith('**')) return { type: 'strong', text: segment.slice(2, -2) };
      if (segment.startsWith('`')) return { type: 'code', text: segment.slice(1, -1) };
      if (segment.startsWith('[[')) return { type: 'kbd', text: segment.slice(2, -2) };
      return { type: 'text', text: segment };
    })
);
</script>

<template>
  <span>
    <template v-for="(part, i) in parts" :key="i">
      <strong v-if="part.type === 'strong'">{{ part.text }}</strong>
      <code v-else-if="part.type === 'code'">{{ part.text }}</code>
      <kbd v-else-if="part.type === 'kbd'">{{ part.text }}</kbd>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>

<style scoped>
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
