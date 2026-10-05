// Kept in its own file so the site helpers (site.js) and the Claude client can both use it
// without importing each other.
export class ClaudeOutputError extends Error {
  constructor(message, raw) {
    super(message);
    this.name = 'ClaudeOutputError';
    this.raw = raw;
  }
}

// Claude's answer would make the site longer than the page limit. Not a broken answer but a
// request the tool cannot grant, so the user gets a clear message (the code PAGE_LIMIT,
// translated by the frontend) instead of a technical error.
export class PageLimitError extends ClaudeOutputError {
  constructor(message, raw) {
    super(message, raw);
    this.name = 'PageLimitError';
    this.code = 'PAGE_LIMIT';
  }
}
