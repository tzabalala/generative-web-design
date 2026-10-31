import { ref } from 'vue';

// Minimal UI translation layer (English default + Greek). No external dependency.
//
// - `t(key, params)`  translate with {placeholders}
// - `tn(key, n)`      picks `${key}.one` / `${key}.other` by count (params: {n})
// - the chosen language is remembered in localStorage and mirrored to <html lang>
// - a missing key falls back to English, then to the key itself
//
// The language of the GENERATED page is a separate matter: it follows the language of the
// user's request (the backend decides that), regardless of the UI language.
//
// Tiny safe markup understood by <RichText>: **bold**, `code`, [[Key]] (rendered as <kbd>).

const STORAGE_KEY = 'gaw.locale';
export const SUPPORTED_LOCALES = ['en', 'el'];
const DEFAULT_LOCALE = 'en';

export const messages = {
  en: {
    'lang.label': 'Language',

    // Marketing copy, the "how it works" strip and the example ideas
    'app.tagline': 'Your website, built by AI and quality-checked automatically.',
    'how.title': 'How it works',
    'how.1.title': 'Describe your idea',
    'how.1.text': 'Write a few sentences in plain words. No technical knowledge needed.',
    'how.2.title': 'We build and quality-check it',
    'how.2.text': 'AI designs every page, then automatic tests find and fix problems for you.',
    'how.3.title': 'Refine and download',
    'how.3.text': 'Ask for changes in plain words, then download your finished website.',
    'examples.title': 'Not sure where to start? Try one of these ideas',
    'examples.1': 'A website for a family restaurant with a menu, our story and a booking form',
    'examples.2': 'A portfolio for a freelance photographer with a gallery and a contact page',
    'examples.3': 'A website for a yoga studio with a class schedule, the teachers and prices',
    'examples.4': 'A one-page wedding invitation with the venue and an RSVP form',
    'theme.dark': 'Dark mode',
    'history.latest': 'Latest',
    'preview.emptyTitle': 'Your website will appear here',

    'app.subtitle':
      'Turn an idea into a ready-to-publish website of up to 5 pages in minutes. Every page is automatically checked for accessibility and mobile screens before it reaches you.',
    'app.newPage': '+ New website (start over)',
    'app.limitReached': 'You have reached the maximum number of edits ({limit}) for this website.',
    'app.preview': 'Preview',
    'app.download': '⬇ Download HTML',
    'app.downloadSite': '⬇ Download website (ZIP)',

    'notice.resumed': 'Picking up where you left off.',
    'notice.notFound': 'The previous website was not found any more. Start a new one.',
    'notice.unreachable': 'Could not load the previous website (the server is not responding).',

    'error.ITERATION_LIMIT': 'You have reached the maximum number of edits ({limit}) for this website.',
    'error.NOTHING_TO_UNDO': 'There is no earlier version to undo to.',
    'error.PAGE_LIMIT': 'A website can have at most 5 pages and this one is full, so that change was not applied. Ask for the content to go on one of the existing pages instead.',

    'form.labelGenerate': 'Describe the website you want',
    'form.labelRefine': 'What do you want to change?',
    'form.placeholderGenerate':
      'e.g. a website for a small café, with a menu, an about page and a contact form with opening hours',
    'form.placeholderRefine': 'e.g. make the button green, or add a gallery page',
    'form.busy': 'Working…',
    'form.submitGenerate': 'Build my website',
    'form.submitRefine': 'Update my website',
    'form.working':
      'Working on it… this can take a while (usually 2–4 minutes for several pages) because every page is checked and fixed automatically.',

    // Live steps shown while a request runs (the backend reports which step it is on)
    'progress.planning': 'Planning your website: which pages it needs and how they look together…',
    'progress.writing': 'Writing the pages ({done} of {total} ready)…',
    'progress.generating': 'Applying your change…',
    'progress.checking': 'Checking accessibility and how the page looks on phone, tablet and desktop…',
    'progress.fixing': 'Fixing a problem the checks found (fix {attempt} of {max})…',
    'progress.designing': 'Writing the design notes and the replacement guide…',
    'progress.cached': 'Found a saved result, loading it…',

    'history.title': 'Version history',
    'history.counter': '{used} / {limit} edits',
    'history.initial': 'Your first idea',
    'history.step': 'Step {n}',
    'history.passed': '✓ Passed all checks',
    'history.issues.one': '⚠ 1 issue remains',
    'history.issues.other': '⚠ {n} issues remain',
    'history.undo': '↺ Undo (back to the previous version)',

    'report.title': 'Automatic quality check',
    'report.empty': 'Nothing checked yet. Build a website first.',
    'report.accessibility': 'Accessibility (e.g. images with descriptions, colour contrast)',
    'report.responsive': 'Works on phone and desktop (responsive design)',
    'report.site': 'The pages work together (working links, the same menu everywhere, different content on each page)',
    'report.warning.one':
      'The website was tried {n} time, but some issues could not be fixed automatically:',
    'report.warning.other':
      'The website was tried {n} times, but some issues could not be fixed automatically:',

    'preview.empty': 'The preview will appear here as soon as your website is ready.',
    'preview.frameTitle': 'Preview of the generated page',
    'preview.pages': 'Pages of the website',
    'preview.sizes': 'Preview size',
    'preview.size.fit': 'Fit',
    'preview.size.phone': 'Phone',
    'preview.size.tablet': 'Tablet',
    'preview.size.desktop': 'Desktop',
    'preview.scaled': 'Shown {width} px wide, scaled to {percent}% to fit.',

    'rationale.title': 'Why this design works',
    'rationale.audience': 'Who it is for',
    'rationale.colors': 'Colours',
    'rationale.typography': 'Typography',
    'rationale.layout': 'Layout',
    'rationale.conversion': 'How it guides the visitor to act',
    'rationale.note':
      'The rationale is generated by the AI from general design principles. It is a suggestion, not a performance measurement.',

    'guide.title': 'Make it yours: replace the sample content',
    'guide.intro':
      'To look complete, the website contains **dummy content** (names, prices, phone numbers, photos). It is not real: you must replace it before you publish.',
    'guide.waysTitle': 'Two ways',
    'guide.wayChat':
      '**From here, with the chat.** Type e.g. "Change the business name to Astra Cinema and the phone number to 210 1234567". The page updates and is re-checked automatically.',
    'guide.wayFile':
      '**In the downloaded file.** Open the .html in Notepad (or VS Code), press [[Ctrl]]+[[F]], paste the snippet from the list below and change the text. A website with several pages is downloaded as a ZIP: unzip it first and search in each page.',
    'guide.photos':
      '**For photos:** put your own images in the same folder as the file and change `src` to a file name (e.g. `src="photo1.jpg"`). **Also update** `alt` so it describes the real photo, because screen reader users depend on it.',
    'guide.listTitle': 'What to replace on this website',
    'guide.empty':
      'The AI did not return a list for this page. Check for names, prices, phone numbers, addresses and images yourself.',
    'guide.where': 'Where:',
    'guide.search': 'Search (Ctrl+F):',
    'guide.replace': 'Replace with:',

    // Comment embedded at the top of the downloaded .html file
    'download.guideIntro':
      'GUIDE: DUMMY CONTENT TO REPLACE\nThis website contains dummy content. Replace it before you publish.\nOpen the file in an editor (Notepad / VS Code), press Ctrl+F and search for the snippet. If the website has several pages, search in every .html file.\nFor images: put your photo in the same folder, then change the src AND the alt (the description for screen readers).\nWhen you are done you can delete this comment.',
    'download.where': 'Where',
    'download.search': 'Search (Ctrl+F)',
    'download.replace': 'Replace with',
    'download.fallbackTitle': 'My page',
  },

  el: {
    'lang.label': 'Γλώσσα',

    // Marketing copy, the "how it works" strip and the example ideas
    'app.tagline': 'Ο ιστότοπός σου, φτιαγμένος από AI και ελεγμένος αυτόματα.',
    'how.title': 'Πώς λειτουργεί',
    'how.1.title': 'Περίγραψε την ιδέα σου',
    'how.1.text': 'Γράψε λίγες προτάσεις με απλά λόγια. Δεν χρειάζονται τεχνικές γνώσεις.',
    'how.2.title': 'Τον φτιάχνουμε και τον ελέγχουμε',
    'how.2.text': 'Το AI σχεδιάζει κάθε σελίδα και μετά αυτόματοι έλεγχοι βρίσκουν και διορθώνουν προβλήματα για σένα.',
    'how.3.title': 'Βελτίωσε και κατέβασε',
    'how.3.text': 'Ζήτα αλλαγές με απλά λόγια και μετά κατέβασε τον έτοιμο ιστότοπό σου.',
    'examples.title': 'Δεν ξέρεις από πού να ξεκινήσεις; Δοκίμασε μία από αυτές τις ιδέες',
    'examples.1': 'Ένας ιστότοπος για ένα οικογενειακό εστιατόριο με μενού, την ιστορία μας και φόρμα κρατήσεων',
    'examples.2': 'Ένα portfolio για έναν ελεύθερο φωτογράφο με γκαλερί και σελίδα επικοινωνίας',
    'examples.3': 'Ένας ιστότοπος για ένα στούντιο γιόγκα με πρόγραμμα, καθηγητές και τιμές',
    'examples.4': 'Μια πρόσκληση γάμου σε μία σελίδα με τον χώρο και φόρμα επιβεβαίωσης συμμετοχής',
    'theme.dark': 'Σκούρο θέμα',
    'history.latest': 'Τελευταίο',
    'preview.emptyTitle': 'Ο ιστότοπός σου θα εμφανιστεί εδώ',

    'app.subtitle':
      'Μετάτρεψε μια ιδέα σε έτοιμο προς δημοσίευση ιστότοπο έως 5 σελίδων μέσα σε λίγα λεπτά. Κάθε σελίδα ελέγχεται αυτόματα για προσβασιμότητα και κινητά πριν φτάσει σε σένα.',
    'app.newPage': '+ Νέος ιστότοπος (ξεκίνα από την αρχή)',
    'app.limitReached': 'Έχεις φτάσει το μέγιστο αριθμό επεξεργασιών ({limit}) για αυτόν τον ιστότοπο.',
    'app.preview': 'Προεπισκόπηση',
    'app.download': '⬇ Λήψη HTML',
    'app.downloadSite': '⬇ Λήψη ιστότοπου (ZIP)',

    'notice.resumed': 'Συνεχίζεις από εκεί που είχες μείνει.',
    'notice.notFound': 'Ο προηγούμενος ιστότοπος δεν βρέθηκε πια. Ξεκίνα έναν νέο.',
    'notice.unreachable': 'Δεν μπόρεσα να φορτώσω τον προηγούμενο ιστότοπο (ο server δεν απαντά).',

    'error.ITERATION_LIMIT': 'Έχεις φτάσει το μέγιστο αριθμό επεξεργασιών ({limit}) για αυτόν τον ιστότοπο.',
    'error.NOTHING_TO_UNDO': 'Δεν υπάρχει παλαιότερη έκδοση για undo.',
    'error.PAGE_LIMIT': 'Ένας ιστότοπος έχει το πολύ 5 σελίδες και αυτός είναι γεμάτος, οπότε η αλλαγή δεν εφαρμόστηκε. Ζήτα το περιεχόμενο να μπει σε μία από τις υπάρχουσες σελίδες.',

    'form.labelGenerate': 'Περίγραψε τον ιστότοπο που θέλεις',
    'form.labelRefine': 'Τι θέλεις να αλλάξεις;',
    'form.placeholderGenerate':
      'π.χ. ένας ιστότοπος για μια μικρή καφετέρια, με μενού, μια σελίδα «Σχετικά» και φόρμα επικοινωνίας με ώρες λειτουργίας',
    'form.placeholderRefine': 'π.χ. άλλαξε το χρώμα του κουμπιού σε πράσινο ή πρόσθεσε σελίδα γκαλερί',
    'form.busy': 'Επεξεργασία…',
    'form.submitGenerate': 'Φτιάξε τον ιστότοπό μου',
    'form.submitRefine': 'Ενημέρωσε τον ιστότοπό μου',
    'form.working':
      'Δουλεύω πάνω σε αυτό… μπορεί να πάρει λίγο χρόνο (συνήθως 2-4 λεπτά για πολλές σελίδες), γιατί κάθε σελίδα ελέγχεται και διορθώνεται αυτόματα.',

    'progress.planning': 'Σχεδιάζω τον ιστότοπό σου: ποιες σελίδες χρειάζεται και πώς δένουν μεταξύ τους…',
    'progress.writing': 'Γράφω τις σελίδες ({done} από {total} έτοιμες)…',
    'progress.generating': 'Εφαρμόζω την αλλαγή σου…',
    'progress.checking': 'Ελέγχω την προσβασιμότητα και την εμφάνιση σε κινητό, tablet και υπολογιστή…',
    'progress.fixing': 'Διορθώνω ένα πρόβλημα που βρήκαν οι έλεγχοι (διόρθωση {attempt} από {max})…',
    'progress.designing': 'Γράφω τις σημειώσεις σχεδιασμού και τον οδηγό αντικατάστασης…',
    'progress.cached': 'Βρήκα αποθηκευμένο αποτέλεσμα, το φορτώνω…',

    'history.title': 'Ιστορικό εκδόσεων',
    'history.counter': '{used} / {limit} επεξεργασίες',
    'history.initial': 'Η πρώτη σου ιδέα',
    'history.step': 'Βήμα {n}',
    'history.passed': '✓ Πέρασε όλους τους ελέγχους',
    'history.issues.one': '⚠ 1 πρόβλημα παραμένει',
    'history.issues.other': '⚠ {n} προβλήματα παραμένουν',
    'history.undo': '↺ Undo (πίσω στην προηγούμενη έκδοση)',

    'report.title': 'Αυτόματος έλεγχος ποιότητας',
    'report.empty': 'Δεν υπάρχει ακόμα έλεγχος. Φτιάξε πρώτα έναν ιστότοπο.',
    'report.accessibility': 'Προσβασιμότητα (π.χ. εικόνες με περιγραφή, αντίθεση χρωμάτων)',
    'report.responsive': 'Λειτουργεί σε κινητό και υπολογιστή (responsive design)',
    'report.site': 'Οι σελίδες δουλεύουν μαζί (σύνδεσμοι που δουλεύουν, ίδιο μενού παντού, διαφορετικό περιεχόμενο σε κάθε σελίδα)',
    'report.warning.one':
      'Ο ιστότοπος δοκιμάστηκε {n} φορά, αλλά κάποια σημεία δεν διορθώθηκαν πλήρως αυτόματα:',
    'report.warning.other':
      'Ο ιστότοπος δοκιμάστηκε {n} φορές, αλλά κάποια σημεία δεν διορθώθηκαν πλήρως αυτόματα:',

    'preview.empty': 'Η προεπισκόπηση θα εμφανιστεί εδώ μόλις είναι έτοιμος ο ιστότοπός σου.',
    'preview.frameTitle': 'Προεπισκόπηση παραγόμενης σελίδας',
    'preview.pages': 'Σελίδες του ιστότοπου',
    'preview.sizes': 'Μέγεθος προεπισκόπησης',
    'preview.size.fit': 'Προσαρμογή',
    'preview.size.phone': 'Κινητό',
    'preview.size.tablet': 'Tablet',
    'preview.size.desktop': 'Υπολογιστής',
    'preview.scaled': 'Πλάτος {width} px, σε σμίκρυνση {percent}% για να χωράει.',

    'rationale.title': 'Γιατί δουλεύει αυτός ο σχεδιασμός',
    'rationale.audience': 'Σε ποιον απευθύνεται',
    'rationale.colors': 'Χρώματα',
    'rationale.typography': 'Γραμματοσειρά',
    'rationale.layout': 'Διάταξη',
    'rationale.conversion': 'Πώς οδηγεί τον επισκέπτη στη δράση',
    'rationale.note':
      'Το σκεπτικό παράγεται από το AI βάσει γενικών αρχών σχεδιασμού. Είναι πρόταση, όχι μέτρηση απόδοσης.',

    'guide.title': 'Κάν’ τον δικό σου: αντικατάστησε το δοκιμαστικό περιεχόμενο',
    'guide.intro':
      'Για να δείχνει πλήρης, ο ιστότοπος περιέχει **δοκιμαστικό περιεχόμενο** (ονόματα, τιμές, τηλέφωνα, φωτογραφίες). Δεν είναι αληθινά στοιχεία: πρέπει να τα αντικαταστήσεις πριν τη δημοσιεύσεις.',
    'guide.waysTitle': 'Δύο τρόποι',
    'guide.wayChat':
      '**Από εδώ, με το chat.** Γράψε π.χ. «Άλλαξε την επωνυμία σε Κινηματογράφος Άστρα και το τηλέφωνο σε 210 1234567». Η σελίδα ενημερώνεται και ελέγχεται ξανά αυτόματα.',
    'guide.wayFile':
      '**Στο αρχείο που κατεβάζεις.** Ανοίγεις το .html με Σημειωματάριο (ή VS Code), πατάς [[Ctrl]]+[[F]], επικολλάς το απόσπασμα από τη λίστα παρακάτω και αλλάζεις το κείμενο. Ιστότοπος με πολλές σελίδες κατεβαίνει ως ZIP: άνοιξέ το πρώτα και ψάξε σε κάθε σελίδα.',
    'guide.photos':
      '**Για τις φωτογραφίες:** βάλε τις δικές σου εικόνες στον ίδιο φάκελο με το αρχείο και άλλαξε το `src` σε όνομα αρχείου (π.χ. `src="foto1.jpg"`). **Άλλαξε και το** `alt` ώστε να περιγράφει την πραγματική φωτογραφία: το χρειάζονται οι χρήστες με screen reader.',
    'guide.listTitle': 'Τι να αντικαταστήσεις σε αυτόν τον ιστότοπο',
    'guide.empty':
      'Το AI δεν επέστρεψε λίστα για αυτή τη σελίδα. Έλεγξε μόνος/η για ονόματα, τιμές, τηλέφωνα, διευθύνσεις και εικόνες.',
    'guide.where': 'Πού:',
    'guide.search': 'Αναζήτηση (Ctrl+F):',
    'guide.replace': 'Βάλε:',

    'download.guideIntro':
      'ΟΔΗΓΟΣ: ΔΟΚΙΜΑΣΤΙΚΑ ΣΤΟΙΧΕΙΑ ΠΡΟΣ ΑΝΤΙΚΑΤΑΣΤΑΣΗ\nΑυτός ο ιστότοπος περιέχει δοκιμαστικό περιεχόμενο. Αντικατάστησέ το πριν τον δημοσιεύσεις.\nΆνοιξε το αρχείο σε editor (Σημειωματάριο / VS Code), πάτα Ctrl+F και βάλε το απόσπασμα. Αν ο ιστότοπος έχει πολλές σελίδες, ψάξε σε κάθε αρχείο .html.\nΓια εικόνες: βάλε τη φωτογραφία στον ίδιο φάκελο, άλλαξε το src και ΤΟ alt (περιγραφή για screen readers).\nΌταν τελειώσεις, μπορείς να σβήσεις αυτό το σχόλιο.',
    'download.where': 'Πού',
    'download.search': 'Αναζήτηση (Ctrl+F)',
    'download.replace': 'Βάλε',
    'download.fallbackTitle': 'Η σελίδα μου',
  },
};

function readStoredLocale() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED_LOCALES.includes(stored)) return stored;
  } catch {
    /* localStorage may be blocked: fall back to the default */
  }
  return DEFAULT_LOCALE;
}

export const locale = ref(readStoredLocale());

function applyDocumentLang(value) {
  if (typeof document !== 'undefined') document.documentElement.lang = value;
}
applyDocumentLang(locale.value);

export function setLocale(value) {
  if (!SUPPORTED_LOCALES.includes(value)) return;
  locale.value = value;
  applyDocumentLang(value);
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignored: the choice simply will not survive a reload */
  }
}

function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
}

// Translate for an explicit locale (used outside components, e.g. the downloaded file).
export function translate(lang, key, params) {
  const text = messages[lang]?.[key] ?? messages[DEFAULT_LOCALE][key] ?? key;
  return interpolate(text, params);
}

// Translate for the current UI locale. Reading `locale.value` makes templates re-render on change.
export function t(key, params) {
  return translate(locale.value, key, params);
}

// Plural-aware: `${key}.one` when n === 1, otherwise `${key}.other`. {n} is always available.
export function tn(key, n, params) {
  return t(`${key}.${n === 1 ? 'one' : 'other'}`, { n, ...params });
}

export function hasMessage(key) {
  return Boolean(messages[DEFAULT_LOCALE][key]);
}
