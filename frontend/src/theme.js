import { ref } from 'vue';

// Light / dark mode. The choice is remembered in localStorage; without one, the system setting
// (prefers-color-scheme) decides. The theme is a data attribute on <html>, and every colour in
// the tool comes from the CSS variables in style.css, so switching is instant and complete.
// The preview of the GENERATED website is not affected: it always shows the site as it was made.
const STORAGE_KEY = 'gaw.theme';
export const THEMES = ['light', 'dark'];

function stored() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(value) ? value : null;
  } catch {
    return null; // localStorage may be blocked
  }
}

function fromSystem() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export const theme = ref(stored() ?? fromSystem());

function apply(value) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = value;
}
apply(theme.value);

export function setTheme(value, { remember = true } = {}) {
  if (!THEMES.includes(value)) return;
  theme.value = value;
  apply(value);
  if (!remember) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignored: the choice simply will not survive a reload */
  }
}

export const toggleTheme = () => setTheme(theme.value === 'dark' ? 'light' : 'dark');
