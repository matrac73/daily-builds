// Theme preference: an explicit user choice is persisted, otherwise the OS preference wins.

export const THEME_STORAGE_KEY = 'github-profiles:theme';
const THEMES = new Set(['light', 'dark']);

export function loadTheme(storage, prefersDark = false) {
  let stored = null;
  try {
    stored = storage?.getItem(THEME_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (privacy mode, sandboxed iframes): fall back to the OS preference.
  }
  if (THEMES.has(stored)) return stored;
  return prefersDark ? 'dark' : 'light';
}

export function saveTheme(storage, theme) {
  if (!THEMES.has(theme)) throw new RangeError(`Unknown theme: ${theme}`);
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Persisting is best-effort; the theme still applies for the current visit.
  }
}

export function toggleTheme(theme) {
  return theme === 'dark' ? 'light' : 'dark';
}
