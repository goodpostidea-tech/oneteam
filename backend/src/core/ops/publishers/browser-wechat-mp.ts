import { EventEmitter } from 'events';
import path from 'path';
import { getLogger } from '../../util/logger';
import type { ToolProviderConfig } from '../../config/tool-config';
import { markdownToWechatHtml } from './wechat-html-themes';

const logger = getLogger('publisher-browser-wechat-mp');

export const browserWechatEmitter = new EventEmitter();

type BrowserState = 'launching' | 'need_scan' | 'publishing' | 'done' | 'error';

function emit(state: BrowserState, message?: string) {
  browserWechatEmitter.emit('status', { state, message });
}

function randomDelay(min = 500, max = 1500): Promise<void> {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

// Persistent browser context — reused across publishes
let persistentContext: any = null;

async function getOrCreateContext() {
  const { chromium } = await import('playwright');
  const userDataDir = path.join(process.cwd(), '.playwright-wechat');

  if (persistentContext) {
    try {
      // Actually test if the browser is alive by creating and closing a page
      const testPage = await persistentContext.newPage();
      await testPage.close();
      return persistentContext;
    } catch {
      logger.info('Previous browser context is dead, relaunching...');
      persistentContext = null;
    }
  }

  persistentContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
  });

  return persistentContext;
}

/**
 * Navigate to mp.weixin.qq.com, detect login state, wait for scan if needed.
 * Returns a page that is on the logged-in dashboard.
 */
async function ensureLoggedIn(context: any): Promise<any> {
  const page = await context.newPage();
  await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded' });

  // Wait for either dashboard or login page to fully settle
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await randomDelay(1000, 2000);

  const url = page.url();
  const isLoggedIn = url.includes('/cgi-bin/home') || url.includes('/cgi-bin/frame');

  if (isLoggedIn) {
    logger.info('Already logged in');
    return page;
  }

  // Need scan
  emit('need_scan', '请在浏览器窗口中扫码登录微信公众号');
  logger.info('Waiting for QR scan login...');

  try {
    await page.waitForURL(
      (u: URL) => u.href.includes('/cgi-bin/home') || u.href.includes('/cgi-bin/frame'),
      { timeout: 120_000 },
    );
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    logger.info('Login successful');
  } catch {
    throw new Error('扫码登录超时（120秒），请重试');
  }

  return page;
}

/**
 * Extract the token from current dashboard URL.
 * WeChat MP dashboard URLs contain &token=XXXXXXX
 */
function extractToken(url: string): string {
  const m = url.match(/token=(\d+)/);
  return m ? m[1] : '';
}

export async function publishBrowserWechatMp(
  item: { kind: string; title?: string; content: string; status: string; createdAt: string },
  _config: ToolProviderConfig,
  theme?: string,
  styledHtml?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    emit('launching', '正在启动浏览器...');
    const context = await getOrCreateContext();

    const page = await ensureLoggedIn(context);
    await randomDelay();

    emit('publishing', '正在创建草稿...');
    const title = item.title || (item.kind === 'tweet' ? '推文' : '文章');
    const htmlContent = styledHtml || markdownToWechatHtml(item.content, theme);

    // Extract token from dashboard URL for constructing editor URL
    const token = extractToken(page.url());
    if (!token) {
      throw new Error('无法从公众号后台获取 token，请重新登录');
    }

    // Navigate to the draft list page, then click "新建图文"
    const draftListUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&token=${token}&lang=zh_CN`;
    logger.info(`Navigating to editor: ${draftListUrl}`);
    await page.goto(draftListUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await randomDelay(2000, 3000);

    // Debug: log current URL to understand where we landed
    const editorUrl = page.url();
    logger.info(`Editor page URL: ${editorUrl}`);

    // Strategy: Try multiple known selectors for the title field
    // The WeChat editor has evolved over time, try several approaches
    const titleSelectors = [
      '#title',                                          // classic
      'textarea[placeholder*="标题"]',                    // placeholder-based
      'input[placeholder*="标题"]',                       // input variant
      '.title-input textarea',                           // wrapped textarea
      '.editor_title textarea',                          // another wrapper
      '[data-testid="title"]',                           // testing attr
      '.weui-desktop-editor__title textarea',            // weui desktop
      '.weui-desktop-editor__title input',
    ];

    let titleFilled = false;
    for (const sel of titleSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          await randomDelay(200, 500);
          await el.fill(title);
          titleFilled = true;
          logger.info(`Title filled using selector: ${sel}`);
          break;
        }
      } catch {
        // try next
      }
    }

    if (!titleFilled) {
      // Last resort: screenshot for debugging and try to find any prominent input
      logger.warn('Could not find title field with known selectors, attempting generic approach');
      // Find the first visible large textarea or input on the page
      titleFilled = await page.evaluate((t: string) => {
        const inputs = Array.from(document.querySelectorAll('textarea, input[type="text"]'));
        for (const el of inputs) {
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width > 200 && rect.height > 0) {
            (el as HTMLInputElement).value = t;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          }
        }
        return false;
      }, title);
      if (titleFilled) {
        logger.info('Title filled via generic input search');
      }
    }

    if (!titleFilled) {
      logger.error('Failed to find title field on editor page');
      throw new Error('找不到标题输入框，微信后台页面结构可能已变化');
    }

    await randomDelay();

    // Inject content into the rich editor
    const contentInjected = await page.evaluate((html: string) => {
      // Try iframe-based editor (UEditor)
      const iframe = document.getElementById('ueditor_0') as HTMLIFrameElement;
      if (iframe?.contentDocument?.body) {
        iframe.contentDocument.body.innerHTML = html;
        return 'iframe';
      }

      // Try contenteditable div (modern editor)
      const editables = document.querySelectorAll('[contenteditable="true"]');
      for (const el of editables) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        // Pick the large content area, not a small inline editable
        if (rect.height > 100 || rect.width > 400) {
          (el as HTMLElement).innerHTML = html;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return 'contenteditable';
        }
      }

      // Try ProseMirror / CodeMirror style editors
      const pm = document.querySelector('.ProseMirror') as HTMLElement;
      if (pm) {
        pm.innerHTML = html;
        pm.dispatchEvent(new Event('input', { bubbles: true }));
        return 'prosemirror';
      }

      return null;
    }, htmlContent);

    if (contentInjected) {
      logger.info(`Content injected via: ${contentInjected}`);
    } else {
      logger.warn('Could not inject content into editor, trying clipboard paste');
      // Fallback: focus editor area and paste via clipboard
      const editable = await page.$('[contenteditable="true"]');
      if (editable) {
        await editable.click();
        await page.evaluate((html: string) => {
          // Set clipboard data and trigger paste
          document.execCommand('selectAll');
          document.execCommand('insertHTML', false, html);
        }, htmlContent);
        logger.info('Content inserted via execCommand');
      } else {
        throw new Error('找不到正文编辑区域');
      }
    }

    await randomDelay(1000, 2000);

    // Save the draft — try multiple approaches
    let saved = false;

    // Approach 1: Ctrl+S keyboard shortcut (most reliable)
    try {
      await page.keyboard.press('Control+s');
      await randomDelay(3000, 5000);
      saved = true;
      logger.info('Draft saved via Ctrl+S');
    } catch (e: any) {
      logger.warn(`Ctrl+S failed: ${e.message}`);
    }

    // Approach 2: Click a save/submit button if Ctrl+S didn't seem to work
    if (!saved) {
      const saveBtnSelectors = [
        'button:has-text("保存")',
        'button:has-text("存草稿")',
        '#js_submit',
        '.js_editor_save_draft',
        '.editor_bottom .btn_send',
      ];
      for (const sel of saveBtnSelectors) {
        try {
          const btn = await page.$(sel);
          if (btn) {
            await btn.click();
            await randomDelay(3000, 5000);
            saved = true;
            logger.info(`Draft saved via button: ${sel}`);
            break;
          }
        } catch {
          // try next
        }
      }
    }

    if (!saved) {
      logger.warn('Could not confirm draft was saved');
    }

    await page.close();
    emit('done', '草稿已保存到公众号');
    logger.info(`Browser publish done: ${title}`);
    return { ok: true };
  } catch (e: any) {
    const msg = e.message || String(e);
    emit('error', msg);
    logger.error('Browser wechat publish error', e);
    return { ok: false, error: msg };
  }
}
