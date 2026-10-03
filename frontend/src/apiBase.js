// Where the backend lives.
//
// Default: the SAME machine that served this page, on port 3000. On the laptop that is
// http://localhost:3000. When a phone opens http://192.168.1.20:5173 over the home Wi-Fi, it
// automatically talks to http://192.168.1.20:3000. A hard-coded "localhost" would point at the
// PHONE itself and every request would fail.
//
// VITE_API_BASE_URL overrides this (the end-to-end tests use it to point at a test backend).
export function resolveApiBase(
  env = import.meta.env,
  location = typeof window !== 'undefined' ? window.location : null
) {
  if (env && env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL.replace(/\/+$/, '');
  if (location && location.hostname) return `${location.protocol}//${location.hostname}:3000`;
  return 'http://localhost:3000';
}
