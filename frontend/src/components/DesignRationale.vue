<script setup>
defineProps({
  rationale: { type: Object, default: null },
});
</script>

<template>
  <details v-if="rationale" class="rationale" open>
    <summary class="rationale__title">Γιατί αυτές οι επιλογές (σκεπτικό σχεδιασμού)</summary>

    <p v-if="rationale.summary" class="rationale__summary">{{ rationale.summary }}</p>

    <dl class="rationale__list">
      <template v-if="rationale.audience">
        <dt>Σε ποιον απευθύνεται</dt>
        <dd>{{ rationale.audience }}</dd>
      </template>

      <template v-if="rationale.colors.length">
        <dt>Χρώματα</dt>
        <dd>
          <ul class="rationale__colors">
            <li v-for="(c, i) in rationale.colors" :key="i" class="rationale__color">
              <span
                v-if="c.hex"
                class="rationale__swatch"
                :style="{ backgroundColor: c.hex }"
                aria-hidden="true"
              />
              <span>
                <strong>{{ c.name }}</strong>
                <span v-if="c.hex" class="rationale__hex"> {{ c.hex }}</span>
                <span v-if="c.why"> — {{ c.why }}</span>
              </span>
            </li>
          </ul>
        </dd>
      </template>

      <template v-if="rationale.typography">
        <dt>Γραμματοσειρά</dt>
        <dd>{{ rationale.typography }}</dd>
      </template>

      <template v-if="rationale.layout">
        <dt>Διάταξη</dt>
        <dd>{{ rationale.layout }}</dd>
      </template>

      <template v-if="rationale.conversion">
        <dt>Πώς οδηγεί τον επισκέπτη στη δράση</dt>
        <dd>{{ rationale.conversion }}</dd>
      </template>
    </dl>

    <p class="rationale__note">
      Το σκεπτικό παράγεται από το AI βάσει γενικών αρχών σχεδιασμού. Είναι πρόταση, όχι μέτρηση
      απόδοσης.
    </p>
  </details>
</template>

<style scoped>
.rationale {
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  background: #fafafa;
}
.rationale__title {
  cursor: pointer;
  font-weight: 700;
  font-size: 1.05rem;
}
.rationale__summary {
  margin: 0.75rem 0 0;
}
.rationale__list {
  margin: 0.75rem 0 0;
}
.rationale__list dt {
  margin-top: 0.75rem;
  font-weight: 700;
  font-size: 0.9rem;
  color: #2f6f4f;
}
.rationale__list dd {
  margin: 0.2rem 0 0;
  font-size: 0.92rem;
}
.rationale__colors {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.rationale__color {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
}
.rationale__swatch {
  flex: none;
  width: 1.1rem;
  height: 1.1rem;
  margin-top: 0.15rem;
  border: 1px solid #0003;
  border-radius: 4px;
}
.rationale__hex {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.85em;
  color: #555;
}
.rationale__note {
  margin: 0.9rem 0 0;
  font-size: 0.8rem;
  color: #666;
}
</style>
