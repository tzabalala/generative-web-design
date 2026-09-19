<script setup>
defineProps({
  placeholders: { type: Array, default: () => [] },
});
</script>

<template>
  <details class="guide" open>
    <summary class="guide__title">Οδηγός: πώς αντικαθιστάς τα δοκιμαστικά στοιχεία</summary>

    <p class="guide__intro">
      Για να δείχνει πλήρης, η σελίδα περιέχει <strong>δοκιμαστικό περιεχόμενο</strong> (ονόματα, τιμές,
      τηλέφωνα, φωτογραφίες). Δεν είναι αληθινά στοιχεία: πρέπει να τα αντικαταστήσεις πριν τη
      δημοσιεύσεις.
    </p>

    <h3 class="guide__heading">Δύο τρόποι</h3>
    <ol class="guide__steps">
      <li>
        <strong>Από εδώ, με το chat.</strong> Γράψε π.χ. «Άλλαξε την επωνυμία σε Κινηματογράφος Άστρα
        και το τηλέφωνο σε 210 1234567». Η σελίδα ενημερώνεται και ελέγχεται ξανά αυτόματα.
      </li>
      <li>
        <strong>Στο αρχείο που κατεβάζεις.</strong> Ανοίγεις το .html με Σημειωματάριο (ή VS Code),
        πατάς <kbd>Ctrl</kbd>+<kbd>F</kbd>, επικολλάς το απόσπασμα από τον πίνακα παρακάτω και
        αλλάζεις το κείμενο.
      </li>
    </ol>
    <p class="guide__tip">
      <strong>Για τις φωτογραφίες:</strong> βάλε τις δικές σου εικόνες στον ίδιο φάκελο με το αρχείο
      και άλλαξε το <code>src</code> σε όνομα αρχείου (π.χ. <code>src="foto1.jpg"</code>).
      <strong>Άλλαξε και το <code>alt</code></strong> ώστε να περιγράφει την πραγματική φωτογραφία:
      το χρειάζονται οι χρήστες με screen reader.
    </p>

    <h3 class="guide__heading">Τι να αντικαταστήσεις σε αυτή τη σελίδα</h3>
    <p v-if="!placeholders.length" class="guide__empty">
      Το AI δεν επέστρεψε λίστα για αυτή τη σελίδα. Έλεγξε μόνος/η για ονόματα, τιμές, τηλέφωνα,
      διευθύνσεις και εικόνες.
    </p>
    <ul v-else class="guide__list">
      <li v-for="(p, i) in placeholders" :key="i" class="guide__item">
        <p class="guide__what">{{ p.what }}</p>
        <p v-if="p.where" class="guide__meta"><span>Πού:</span> {{ p.where }}</p>
        <p v-if="p.searchText" class="guide__meta">
          <span>Αναζήτηση (Ctrl+F):</span> <code>{{ p.searchText }}</code>
        </p>
        <p v-if="p.replaceWith" class="guide__meta"><span>Βάλε:</span> {{ p.replaceWith }}</p>
      </li>
    </ul>
  </details>
</template>

<style scoped>
.guide {
  border: 1px solid #f0d090;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  background: #fffaf0;
}
.guide__title {
  cursor: pointer;
  font-weight: 700;
  font-size: 1.05rem;
}
.guide__intro {
  margin: 0.75rem 0 0;
  font-size: 0.92rem;
}
.guide__heading {
  margin: 1rem 0 0.3rem;
  font-size: 0.95rem;
}
.guide__steps {
  margin: 0;
  padding-left: 1.2rem;
  font-size: 0.92rem;
}
.guide__steps li + li {
  margin-top: 0.4rem;
}
.guide__tip {
  margin: 0.75rem 0 0;
  font-size: 0.9rem;
}
.guide__empty {
  font-size: 0.9rem;
  color: #666;
}
.guide__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.guide__item {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 0.55rem 0.75rem;
}
.guide__what {
  margin: 0;
  font-weight: 700;
  font-size: 0.92rem;
}
.guide__meta {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}
.guide__meta span {
  color: #666;
}
code {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.9em;
  background: #f2f2f2;
  padding: 0 0.25rem;
  border-radius: 3px;
}
kbd {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.85em;
  border: 1px solid #ccc;
  border-radius: 3px;
  padding: 0 0.3rem;
  background: #fff;
}
</style>
