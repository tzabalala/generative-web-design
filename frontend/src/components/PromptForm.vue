<script setup>
import { ref } from 'vue';

const props = defineProps({
  loading: { type: Boolean, default: false },
  mode: { type: String, default: 'generate' }, // 'generate' | 'refine'
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['submit']);

const text = ref('');

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
      {{ mode === 'generate'
        ? 'Περίγραψε τη σελίδα που θέλεις'
        : 'Τι θέλεις να αλλάξεις;' }}
    </label>
    <textarea
      id="prompt-input"
      v-model="text"
      class="prompt-form__textarea"
      :placeholder="mode === 'generate'
        ? 'π.χ. μια σελίδα επικοινωνίας για μια μικρή καφετέρια, με φόρμα και ώρες λειτουργίας'
        : 'π.χ. άλλαξε το χρώμα του κουμπιού σε πράσινο'"
      :disabled="loading || disabled"
      rows="3"
      @keydown.enter.meta.prevent="onSubmit"
      @keydown.enter.ctrl.prevent="onSubmit"
    />
    <button class="prompt-form__submit" type="submit" :disabled="loading || disabled || !text.trim()">
      {{ loading ? 'Επεξεργασία…' : (mode === 'generate' ? 'Δημιουργία σελίδας' : 'Εφαρμογή αλλαγής') }}
    </button>
    <!-- role="status": οι screen readers ανακοινώνουν το μήνυμα χωρίς να χρειάζεται focus -->
    <p v-if="loading" class="prompt-form__working" role="status">
      <span class="prompt-form__spinner" aria-hidden="true" />
      Δουλεύω πάνω σε αυτό… μπορεί να πάρει λίγο χρόνο (συνήθως 1-2 λεπτά), γιατί η σελίδα ελέγχεται
      και διορθώνεται αυτόματα.
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
/* Όσοι έχουν ζητήσει λιγότερη κίνηση από το σύστημα δεν βλέπουν περιστροφή */
@media (prefers-reduced-motion: reduce) {
  .prompt-form__spinner {
    animation: none;
  }
}
</style>
