/**
 * Shared stealth helpers for Playwright browser publishers.
 * Minimal approach: only patch what automation detection actually checks.
 * Over-patching makes things worse — sites detect non-native toString().
 */

/** Chrome launch args that disable automation signals */
export const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-infobars',
  '--no-first-run',
  '--no-default-browser-check',
];

/**
 * Minimal init script — only delete the webdriver flag and Playwright markers.
 * We do NOT override navigator.plugins, mimeTypes, etc. because:
 * - Arrow/function overrides are trivially detected via toString()
 * - Playwright Chromium already has real plugins in non-headless mode
 * - Over-patching is the #1 cause of "不安全插件" warnings
 */
export const STEALTH_INIT_SCRIPT = `
  // 1. Delete webdriver flag via CDP-level approach (undetectable)
  // The --disable-blink-features=AutomationControlled flag already handles
  // navigator.webdriver, but we also clean up Playwright's own markers:
  try { delete window.__playwright; } catch {}
  try { delete window.__pw_manual; } catch {}
  try { delete window.__pwInitScripts; } catch {}

  // 2. Ensure chrome.runtime exists (Playwright Chromium sometimes lacks it)
  if (window.chrome && !window.chrome.runtime) {
    window.chrome.runtime = {};
  }
`;
