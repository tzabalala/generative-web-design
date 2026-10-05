<script setup>
import { t, hasMessage } from '../i18n.js';
import { ref, computed, watch } from 'vue';

const props = defineProps({
  loading: { type: Boolean, default: false },
  mode: { type: String, default: 'generate' }, // 'generate' | 'refine'
  disabled: { type: Boolean, default: false },
  // What the backend is doing right now, e.g. { stage: 'fixing', attempt: 1, max: 3 } (or null).
  stage: { type: Object, default: null },
  // The large version used on the start screen
  hero: { type: Boolean, default: false },
  // { text, id }: puts an idea back into the box (after a failed first attempt)
  prefill: { type: Object, default: null },
});
const emit = defineEmits(['submit']);

const text = ref('');
const EXAMPLES = [1, 2, 3, 4];

watch(
  () => props.prefill,
  (value) => {
    if (value && typeof value.text === 'string') text.value = value.text;
  },
  { immediate: true }
);

// Text for the current step. An unknown step name (e.g. from a newer backend) shows nothing
// instead of a raw translation key.
const stageText = computed(() => {
  const name = props.stage && props.stage.stage;
  if (!name || !hasMessage('progress.' + name)) return '';
  return t('progress.' + name, {
    attempt: props.stage.attempt,
    max: props.stage.max,
    done: props.stage.done,
    total: props.stage.total,
  });
});

// A ready-made idea fills the box, so a first-time user never faces an empty page.
function useExample(n) {
  text.value = t(`examples.${n}`);
}

function onSubmit() {
  const value = text.value.trim();
  if (!value || props.loading || props.disabled) return;
  emit('submit', value);
  text.value = '';
}
</script>

<template>
  <form class="prompt-form" :class="{ 'prompt-form--hero': hero }" @submit.prevent="onSubmit">
    <label class="prompt-form__label" for="prompt-input">
      {{ mode === 'generate' ? t('form.labelGenerate') : t('form.labelRefine') }}
    </label>
    <textarea
      id="prompt-input"
      v-model="text"
      class="prompt-form__textarea"
      :placeholder="mode === 'generate' ? t('form.placeholderGenerate') : t('form.placeholderRefine')"
      :disabled="loading || disabled"
      :rows="hero ? 5 : 4"
      @keydown.enter.meta.prevent="onSubmit"
      @keydown.enter.ctrl.prevent="onSubmit"
    />
    <button class="prompt-form__submit" type="submit" :disabled="loading || disabled || !text.trim()">
      {{ loading ? t('form.busy') : (mode === 'generate' ? t('form.submitGenerate') : t('form.submitRefine')) }}
    </button>

    <div v-if="mode === 'generate' && !loading" class="prompt-form__examples">
      <p class="prompt-form__examples-title">{{ t('examples.title') }}</p>
      <ul class="prompt-form__chips">
        <li v-for="n in EXAMPLES" :key="n">
          <button class="prompt-form__chip" type="button" :disabled="disabled" @click="useExample(n)">
            {{ t(`examples.${n}`) }}
          </button>
        </li>
      </ul>
    </div>

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
  gap: 0.7rem;
}
.prompt-form__label {
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: -0.01em;
}
.prompt-form__textarea {
  width: 100%;
  padding: 0.85rem 0.95rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.5;
  resize: vertical;
}
.prompt-form__textarea::placeholder {
  color: var(--muted);
}
.prompt-form__textarea:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 1px;
  border-color: var(--primary);
}
.prompt-form__textarea:disabled {
  background: var(--surface-2);
  cursor: not-allowed;
}
.prompt-form__submit {
  width: 100%;
  padding: 0.8rem 1.4rem;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #4f46e5, #9333ea);
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(79, 70, 229, 0.3);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.prompt-form__submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 26px rgba(79, 70, 229, 0.38);
}
.prompt-form__submit:disabled {
  background: var(--surface-2);
  color: var(--muted);
  box-shadow: none;
  cursor: not-allowed;
}

.prompt-form--hero .prompt-form__label {
  font-size: 1.25rem;
}
.prompt-form--hero .prompt-form__textarea {
  padding: 1.1rem 1.2rem;
  font-size: 1.1rem;
  border-radius: 14px;
}
.prompt-form--hero .prompt-form__submit {
  padding: 1rem 1.4rem;
  font-size: 1.1rem;
}
.prompt-form--hero .prompt-form__chips {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@media (max-width: 640px) {
  .prompt-form--hero .prompt-form__chips {
    grid-template-columns: 1fr;
  }
}
.prompt-form__examples-title {
  margin: 0.4rem 0 0.4rem;
  font-size: 0.85rem;
  font-weight: 650;
  color: var(--muted);
}
.prompt-form__chips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.prompt-form__chip {
  width: 100%;
  text-align: left;
  padding: 0.55rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-size: 0.88rem;
  line-height: 1.4;
  cursor: pointer;
}
.prompt-form__chip:hover:not(:disabled) {
  border-color: var(--primary);
  background: var(--primary-soft);
}
.prompt-form__chip:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.prompt-form__working {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  margin: 0;
  padding: 0.8rem 0.9rem;
  border-radius: var(--radius-sm);
  background: var(--primary-soft);
  font-size: 0.85rem;
  color: var(--muted);
}
.prompt-form__stage {
  display: block;
  margin-bottom: 0.2rem;
  font-size: 0.95rem;
  color: var(--primary-text);
}
.prompt-form__hint {
  display: block;
}
.prompt-form__spinner {
  flex: none;
  width: 1.1rem;
  height: 1.1rem;
  margin-top: 0.15rem;
  border: 2px solid var(--border-strong);
  border-top-color: var(--primary);
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
  .prompt-form__spinner {
    animation: none;
  }
}
</style>
