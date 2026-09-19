// Constraint-aware prompt injection (Βήμα 5 & 6, Technical Implementation Plan).
// Ο χρήστης δεν γράφει ποτέ αυτές τις οδηγίες ο ίδιος — προστίθενται αυτόματα
// πριν το prompt φύγει προς το Claude API.
// Ανέβασέ το ΟΠΟΤΕ αλλάζεις τα prompts παρακάτω: μπαίνει στο κλειδί του cache, ώστε
// αποθηκευμένες απαντήσεις που φτιάχτηκαν με παλιές οδηγίες να μη σερβίρονται ξανά.
export const PROMPT_VERSION = 'v2-design-guide';

export const SYSTEM_PROMPT = `You are a web page generator. Given a natural-language description, produce a single self-contained web page.

Hard requirements on every output, regardless of what the user asked for:
- Use semantic HTML5 elements (header, nav, main, section, article, footer, etc.) instead of generic <div> soup.
- Every <img> must have a meaningful, non-empty alt attribute.
- The CSS must include responsive design: at least one @media rule for a mobile breakpoint (max-width: 600px) and one for a desktop breakpoint (min-width: 601px), using relative units (%, rem, em, vw) and flexbox or grid for layout.
- Sufficient color contrast between text and background (WCAG AA: at least 4.5:1 for normal text).
- Do not include <script> tags unless the user explicitly asked for interactivity.

Dummy content: it is fine to invent plausible placeholder content (business names, people, prices, addresses, phone numbers, event or product names, testimonials, image URLs) so the page looks complete. Write the page content in the same language as the user's request.

Split output strictly into two parts:
- "html": ONLY the content that goes inside <body>...</body>. Do not include <!DOCTYPE>, <html>, <head>, or <style> tags in this field.
- "css": ALL CSS rules (including the @media rules). Do not put any CSS inside the html field via a <style> tag.

Respond with ONLY a JSON object, no markdown code fences, no explanation, no text before or after, in exactly this shape:
{"html": "<body content only, as a string>", "css": "<all CSS rules, as a string>"}`;

// Δεύτερη, ξεχωριστή κλήση: περιγράφει τον ΤΕΛΙΚΟ (ήδη ελεγμένο) κώδικα. Ξεχωριστή
// από τη δημιουργία ώστε (α) το σκεπτικό να ταιριάζει με ό,τι όντως παραδίδεται,
// (β) το validation loop να μη κουβαλά έξτρα tokens σε κάθε επανάληψη, (γ) μια
// αποτυχία εδώ να μη χαλά τη σελίδα.
export const DESIGN_SYSTEM_PROMPT = `You are a design consultant. You are given a finished web page (html + css) and the request it was built for. Explain it to a NON-TECHNICAL business owner and tell them what dummy content to replace.

Return a JSON object with two fields:

1. "rationale" — the design decisions. Be concrete and specific to THIS page and audience: no generic filler, and no invented statistics or research claims (rely only on widely accepted design principles). Keep each text field to 1-3 sentences. Fields:
   - "summary": the overall concept and the impression the page should make.
   - "audience": who the page is for and what those visitors want to do.
   - "colors": array of {"hex": "#RRGGBB", "name": short colour name, "why": why this colour suits this business/audience (mood, contrast, brand fit)}. Use the colours actually present in the css: background, text and accent(s). At most 6.
   - "typography": the font choices and why (readability, personality).
   - "layout": how the sections are ordered and why (what the visitor sees first, visual hierarchy).
   - "conversion": how the page guides the visitor to the main action (call-to-action placement, trust elements).

2. "placeholders" — the invented dummy content the owner must replace before publishing. At most 12 entries. GROUP repeated items into ONE entry (e.g. all movie titles = one entry, all testimonials = one entry, all gallery images = one entry). Each entry: {"what": what it is, "where": where on the page, "searchText": a short snippet (a few words) copied EXACTLY, character for character, from the html or css so the owner can find it with Ctrl+F — or "" if not applicable, "replaceWith": what real content to put there}. Cover: business/person names, contact details, prices, dates, invented text and image URLs.

Write everything in the same language as the request.

Respond with ONLY the JSON object, no markdown code fences, no text before or after:
{"rationale": {"summary": "", "audience": "", "colors": [{"hex": "#RRGGBB", "name": "", "why": ""}], "typography": "", "layout": "", "conversion": ""}, "placeholders": [{"what": "", "where": "", "searchText": "", "replaceWith": ""}]}`;

const JSON_PREFILL = { role: 'assistant', content: '{' };

export function buildGenerateMessages(userPrompt) {
  return [
    {
      role: 'user',
      content: `Generate a web page for this request: ${userPrompt}`,
    },
    // Prefill: αναγκάζει την απάντηση να ξεκινήσει με "{" ώστε να μην
    // τυλίγεται σε ```markdown code fence.
    JSON_PREFILL,
  ];
}

// Βήμα 7: /refine — στέλνεται πάντα ο τρέχων κώδικας ως context, ώστε η
// αλλαγή να είναι surgical (targeted) αντί για πλήρη επανα-δημιουργία.
export function buildRefineMessages(currentHtml, currentCss, instruction) {
  return [
    {
      role: 'user',
      content: `Here is the current page.

Current html field:
${currentHtml}

Current css field:
${currentCss}

Apply this change: ${instruction}

Keep everything else about the design the same — only change what the instruction asks for. Still obey all the hard requirements from the system prompt (semantic HTML5, alt text, responsive @media rules, contrast, etc).`,
    },
    JSON_PREFILL,
  ];
}

// Βήμα 10: feedback loop — περιγράφεται ρητά ποιοι έλεγχοι απέτυχαν, ζητείται
// διόρθωση διατηρώντας το υπόλοιπο design.
export function buildFixMessages(currentHtml, currentCss, issueSummary) {
  return [
    {
      role: 'user',
      content: `The following code failed these automated checks:
${issueSummary.map((i) => `- ${i}`).join('\n')}

Current html field:
${currentHtml}

Current css field:
${currentCss}

Fix ONLY what is needed to pass these checks. Keep the rest of the design (layout, colors, content, wording) the same.`,
    },
    JSON_PREFILL,
  ];
}

// Η γλώσσα καθορίζεται ντετερμινιστικά από τον κώδικα (όχι από το μοντέλο): το
// μοντέλο τείνει να απαντά στα αγγλικά όταν οι οδηγίες του είναι αγγλικές.
function languageInstruction(request) {
  return /[Ͱ-Ͽ]/.test(request) // ελληνικοί χαρακτήρες
    ? 'Write ALL text values (summary, audience, colour names and reasons, typography, layout, conversion, and the what/where/replaceWith of every placeholder) in Greek (Ελληνικά). Keep "searchText" exactly as it appears in the code.'
    : 'Write all text values in the same language as the request. Keep "searchText" exactly as it appears in the code.';
}

// request: το αρχικό αίτημα του χρήστη (και, σε refine, η τελευταία αλλαγή).
export function buildDesignMessages(html, css, request) {
  return [
    {
      role: 'user',
      content: `Request the page was built for:
${request}

${languageInstruction(request)}

html field:
${html}

css field:
${css}`,
    },
    JSON_PREFILL,
  ];
}
