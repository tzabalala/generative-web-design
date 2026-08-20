// Constraint-aware prompt injection (Βήμα 5 & 6, Technical Implementation Plan).
// Ο χρήστης δεν γράφει ποτέ αυτές τις οδηγίες ο ίδιος — προστίθενται αυτόματα
// πριν το prompt φύγει προς το Claude API.
export const SYSTEM_PROMPT = `You are a web page generator. Given a natural-language description, produce a single self-contained web page.

Hard requirements on every output, regardless of what the user asked for:
- Use semantic HTML5 elements (header, nav, main, section, article, footer, etc.) instead of generic <div> soup.
- Every <img> must have a meaningful, non-empty alt attribute.
- The CSS must include responsive design: at least one @media rule for a mobile breakpoint (max-width: 600px) and one for a desktop breakpoint (min-width: 601px), using relative units (%, rem, em, vw) and flexbox or grid for layout.
- Sufficient color contrast between text and background (WCAG AA: at least 4.5:1 for normal text).
- Do not include <script> tags unless the user explicitly asked for interactivity.

Split output strictly into two parts:
- "html": ONLY the content that goes inside <body>...</body>. Do not include <!DOCTYPE>, <html>, <head>, or <style> tags in this field.
- "css": ALL CSS rules (including the @media rules). Do not put any CSS inside the html field via a <style> tag.

Respond with ONLY a JSON object, no markdown code fences, no explanation, no text before or after, in exactly this shape:
{"html": "<body content only, as a string>", "css": "<all CSS rules, as a string>"}`;

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
