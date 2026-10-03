<script setup>
import { t, hasMessage } from '../i18n.js';
import { ref, computed } from 'vue';

const props = defineProps({
  loading: { type: Boolean, default: false },
  mode: { type: String, default: 'generate' }, // 'generate' | 'refine'
  disabled: { type: Boolean, default: false },
  // What the backend is doing right now, e.g. { stage: 'fixing', attempt: 1, max: 3 } (or null).
  stage: { type: Object, default: null },
});
const emit = defineEmits(['submit']);

const text = ref('');

// Text for the current step. An unknown step name (e.g. from a newer backend) shows nothing
// instead of a raw translation key.
const stageText = computed(() => {
  const name = props.stage && props.stage.stage;
  if (!name || !hasMessage('progress.' + name)) return '';
  return t('progress.' + name, { attempt: props.stage.attempt, max: props.stage.max });
});

function onSubmit() {
  const value = text.value.trim();
  if (!value || props.loading || props.disabled) return;
  emit('submit', value);
  text.value = '';
}
</script>

<template>
  <form class="prompt-form" @submit.prevent="onSubmit">
    <label class="prompt-form__label" for="prompt-input">
      {{ mode === 'generate' ? t('form.labelGenerate') : t('form.labelRefine') }}
    </label>
    <textarea
      id="prompt-input"
      v-model="text"
      class="prompt-form__textarea"
      :placeholder="mode === 'generate' ? t('form.placeholderGenerate') : t('form.placeholderRefine')"
      :disabled="loading || disabled"
      rows="3"
      @keydown.enter.meta.prevent="onSubmit"
      @keydown.enter.ctrl.prevent="onSubmit"
    />
    <button class="prompt-form__submit" type="submit" :disabled="loading || disabled || !text.trim()">
      {{ loading ? t('form.busy') : (mode === 'generate' ? t('form.submitGenerate') : t('form.submitRefine')) }}
    </button>
    <!-- role="status": screen readers announce the message without needing focus -->
    <p v-if="loading" class="prompt-form__working" role="status">
      <span class="prompt-form__spinner" aria-hidden="true" />
      <span>
        <strong v-if="stageText" class="prompt-form__stage">{{ stageText }}</strong>
        <span class="prompt-form__hint">{{ t('form.working') }}</span>
      </span>
    </p>
  </form>
</template>

<style scoped>
.prompt-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.prompt-form__label {
  font-weight: 600;
  font-size: 0.95rem;
}
.prompt-form__textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-family: inherit;
  font-size: 1rem;
  resize: vertical;
}
.prompt-form__textarea:disabled {
  background: #f2f2f2;
  cursor: not-allowed;
}
.prompt-form__submit {
  align-self: flex-start;
  padding: 0.6rem 1.4rem;
  border: none;
  border-radius: 6px;
  background: #2f6f4f;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.prompt-form__submit:disabled {
  background: #9aa;
  cursor: not-allowed;
}
.prompt-form__working {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  margin: 0;
  font-size: 0.85rem;
  color: #444;
}
.prompt-form__stage {
  display: block;
  margin-bottom: 0.15rem;
  color: #1f4d36;
}
.prompt-form__hint {
  display: block;
}
.prompt-form__spinner {
  flex: none;
  width: 1rem;
  height: 1rem;
  margin-top: 0.15rem;
  border: 2px solid #cfd8d3;
  border-top-color: #2f6f4f;
  border-radius: 50%;
  animation: prompt-form-spin 0.8s linear infinite;
}
@keyframes prompt-form-spin {
  to {
    transform: rotate(360deg);
  }
}
/* Users who asked their system for reduced motion do not see the spinner rotate */
@media (prefers-reduced-motion: reduce) {
  .prompt-form__stage {
  display: block;
  margin-bottom: 0.15rem;
  color: #1f4d36;
}
.prompt-form__hint {
  display: block;
}
.prompt-form__spinner {
    animation: none;
  }
}
</style>
