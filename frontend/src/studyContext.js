// User-study support: the researcher opens the tool as  http://localhost:5173/?p=P03
// so every request of that session is stored with the anonymous participant code "P03"
// (the study export then groups results per participant).
//
// Only a short code of letters, digits, "-" and "_" is accepted. A real name typed by
// mistake is ignored, never sent. The backend applies the same rule again.
const PARTICIPANT_RE = /^[A-Za-z0-9_-]{1,24}$/;

export function getParticipantCode(search = typeof window !== 'undefined' ? window.location.search : '') {
  const value = new URLSearchParams(search).get('p');
  return value && PARTICIPANT_RE.test(value) ? value : null;
}
