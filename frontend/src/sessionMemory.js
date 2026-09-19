// Remembers in the browser WHICH session was open, so a reload (or closing/reopening
// the tab) does not lose the work. The data itself stays in the backend database;
// here we keep only the id.
//
// localStorage may be blocked (private browsing, browser policies): in every case the
// app works normally, just without memory.
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
    /* ignored: the session simply will not survive a reload */
  }
}

export function forgetSessionId() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignored */
  }
}
