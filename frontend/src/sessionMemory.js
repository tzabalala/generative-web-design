// Θυμάται στον browser ΠΟΙΟ session ήταν ανοιχτό, ώστε ένα reload (ή κλείσιμο/άνοιγμα
// του tab) να μη χάνει τη δουλειά. Τα ίδια τα δεδομένα μένουν στη βάση του backend·
// εδώ κρατάμε μόνο το id.
//
// Το localStorage μπορεί να είναι μπλοκαρισμένο (ιδιωτική περιήγηση, πολιτικές
// browser): σε κάθε περίπτωση η εφαρμογή δουλεύει κανονικά, απλώς χωρίς μνήμη.
const KEY = 'gaw.sessionId';

export function loadSessionId() {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveSessionId(id) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* αγνοείται: απλώς δεν θα επιβιώσει το reload */
  }
}

export function forgetSessionId() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* αγνοείται */
  }
}
