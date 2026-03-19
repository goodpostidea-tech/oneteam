/**
 * Shared stealth helpers for Playwright browser publishers.
 * Removes common automation fingerprints so sites don't flag the browser.
 */

/** Chrome launch args that disable automation signals */
export const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-infobars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
];

/**
 * Script injected into every page to mask navigator.webdriver
 * and other automation-detectable properties.
 */
export const STEALTH_INIT_SCRIPT = `
  // Hide webdriver flag
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  // Mimic normal Chrome — override navigator.plugins to look non-empty
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
  });

  // Mimic normal Chrome — override navigator.languages
  Object.defineProperty(navigator, 'languages', {
    get: () => ['zh-CN', 'zh', 'en'],
  });

  // Remove Playwright-injected runtime markers
  delete window.__playwright;
  delete window.__pw_manual;

  // Patch chrome.runtime to look like a normal Chrome install
  if (!window.chrome) { window.chrome = {}; }
  if (!window.chrome.runtime) { window.chrome.runtime = {}; }
`;
