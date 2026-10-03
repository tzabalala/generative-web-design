// A random id that tags one generate/refine request, so the page can ask the backend
// "how far along is request X?" while it waits (see backend/src/progress.js).
//
// crypto.randomUUID() is NOT used on purpose: browsers only provide it on secure pages
// (https or localhost). Phone testing over the LAN (http://192.168.x.x:5173) is not secure
// and would crash. getRandomValues() works everywhere; Math.random() is the last resort.
export function newRequestId() {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return 'r' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
