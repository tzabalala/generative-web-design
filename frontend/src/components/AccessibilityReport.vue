<script setup>
const props = defineProps({
  validation: { type: Object, default: null },
});

// Βήμα 16: plain-language summary — ο μη τεχνικός χρήστης δεν χρειάζεται να
// ξέρει τι σημαίνει "axe-core" ή "WCAG", μόνο τι ελέγχθηκε και αν πέρασε.
const CHECKS = [
  {
    key: 'accessibility',
    label: 'Προσβασιμότητα (π.χ. εικόνες με περιγραφή, αντίθεση χρωμάτων)',
  },
  {
    key: 'responsive',
    label: 'Λειτουργεί σε κινητό και υπολογιστή (responsive design)',
  },
];

function statusOf(validation, key) {
  if (!validation || !validation[key]) return null;
  return validation[key].passed;
}
</script>

<template>
  <div class="a11y-report">
    <h2>Τι ελέγξαμε</h2>
    <p v-if="!validation" class="a11y-report__empty">
      Δεν υπάρχει ακόμα έλεγχος — δημιούργησε μια σελίδα πρώτα.
    </p>
    <ul v-else class="a11y-report__list">
      <li v-for="check in CHECKS" :key="check.key" class="a11y-report__item">
        <span
          class="a11y-report__icon"
          :class="statusOf(validation, check.key) ? 'is-ok' : 'is-warn'"
        >
          {{ statusOf(validation, check.key) ? '✓' : '⚠' }}
        </span>
        <span>{{ check.label }}</span>
      </li>
    </ul>

    <div v-if="validation && !validation.passed" class="a11y-report__warning">
      <p>
        Η σελίδα δοκιμάστηκε {{ validation.attempts + 1 }}
        {{ validation.attempts === 0 ? 'φορά' : 'φορές' }} αλλά κάποια σημεία δεν διορθώθηκαν πλήρως
        αυτόματα:
      </p>
      <ul>
        <li v-for="(issue, i) in validation.remainingIssues" :key="i">{{ issue }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.a11y-report {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.a11y-report h2 {
  font-size: 1.05rem;
  margin: 0;
}
.a11y-report__empty {
  color: #888;
  font-size: 0.9rem;
}
.a11y-report__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.a11y-report__item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.9rem;
}
.a11y-report__icon {
  font-weight: 700;
}
.a11y-report__icon.is-ok {
  color: #2f6f4f;
}
.a11y-report__icon.is-warn {
  color: #a15c00;
}
.a11y-report__warning {
  margin-top: 0.5rem;
  padding: 0.6rem 0.75rem;
  background: #fff7e6;
  border: 1px solid #f0d090;
  border-radius: 6px;
  font-size: 0.85rem;
}
.a11y-report__warning ul {
  margin: 0.4rem 0 0;
  padding-left: 1.1rem;
}
</style>
