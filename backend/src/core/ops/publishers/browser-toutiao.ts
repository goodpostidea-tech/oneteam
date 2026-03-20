import { EventEmitter } from 'events';
import path from 'path';
import { getLogger } from '../../util/logger';
import type { ToolProviderConfig } from '../../config/tool-config';
import { STEALTH_ARGS, STEALTH_INIT_SCRIPT } from './browser-stealth';

const logger = getLogger('publisher-browser-toutiao');

export const browserToutiaoEmitter = new EventEmitter();

type BrowserState = 'launching' | 'need_scan' | 'publishing' | 'done' | 'error';

function emit(state: BrowserState, message?: string) {
  browserToutiaoEmitter.emit('status', { state, message });
}

function randomDelay(min = 500, max = 1500): Promise<void> {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

let persistentContext: any = null;

async function getOrCreateContext() {
  let chromium: any;
  try {
    chromium = (await import('playwright')).chromium;
  } catch {
    throw new Error('Playwright 未安装，浏览器发布功能不可用');
  }
  const userDataDir = path.join(process.cwd(), '.playwright-toutiao');

  if (persistentContext) {
    try {
      const testPage = await persistentContext.newPage();
      await testPage.close();
      return persistentContext;
    } catch {
      logger.info('Previous browser context is dead, relaunching...');
      persistentContext = null;
    }
  }

  persistentContext = await (chromium as any).launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    args: STEALTH_ARGS,
    ignoreDefaultArgs: ['--enable-automation'],
  });

  persistentContext.addInitScript(STEALTH_INIT_SCRIPT);

  return persistentContext;
}

async function ensureLoggedIn(context: any): Promise<any> {
  const page = await context.newPage();
  await page.goto('https://mp.toutiao.com/', { waitUntil: 'domcontentloaded' });

  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await randomDelay(1000, 2000);

  const url = page.url();
  // Logged-in users land on the dashboard, login page stays on /auth/page/login
  const isLoggedIn = url.includes('/profile_v4') || url.includes('/homepage') || (!url.includes('/auth/') && !url.includes('/login'));

  if (isLoggedIn) {
    logger.info('Already logged in to Toutiao');
    return page;
  }

  emit('need_scan', '请在浏览器窗口中扫码登录今日头条创作平台');
  logger.info('Waiting for Toutiao QR scan login...');

  try {
    await page.waitForURL(
      (u: URL) => !u.href.includes('/auth/') && !u.href.includes('/login'),
      { timeout: 120_000 },
    );
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    logger.info('Toutiao login successful');
  } catch {
    throw new Error('扫码登录超时（120秒），请重试');
  }

  return page;
}

export async function publishBrowserToutiao(
  item: { kind: string; title?: string; content: string; status: string; createdAt: string },
  _config: ToolProviderConfig,
): Promise<{ ok: boolean; error?: string }> {
  try {
    emit('launching', '正在启动浏览器...');
    const context = await getOrCreateContext();

    const page = await ensureLoggedIn(context);
    await randomDelay();

    emit('publishing', '正在创建草稿...');
    const title = item.title || (item.kind === 'tweet' ? '推文' : '文章');

    // Navigate to the article editor
    logger.info('Navigating to Toutiao editor...');
    await page.goto('https://mp.toutiao.com/profile_v4/graphic/publish', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await randomDelay(2000, 3000);

    const editorUrl = page.url();
    logger.info(`Editor page URL: ${editorUrl}`);

    // Fill in the title
    const titleSelectors = [
      'textarea[placeholder*="标题"]',
      'input[placeholder*="标题"]',
      '.article-title textarea',
      '.article-title input',
      '[data-testid="title"]',
      '.title-input textarea',
      '.title-input input',
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
      logger.warn('Could not find title field with known selectors, attempting generic approach');
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
      logger.error('Failed to find title field on Toutiao editor page');
      throw new Error('找不到标题输入框，头条号后台页面结构可能已变化');
    }

    await randomDelay();

    // Inject content into the rich editor
    // Convert markdown to simple HTML for the rich text editor
    const htmlContent = item.content
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');

    const contentInjected = await page.evaluate((html: string) => {
      // Try contenteditable div (Toutiao uses a modern rich text editor)
      const editables = document.querySelectorAll('[contenteditable="true"]');
      for (const el of editables) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.height > 100 || rect.width > 400) {
          (el as HTMLElement).innerHTML = html;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return 'contenteditable';
        }
      }

      // Try ProseMirror style editors
      const pm = document.querySelector('.ProseMirror') as HTMLElement;
      if (pm) {
        pm.innerHTML = html;
        pm.dispatchEvent(new Event('input', { bubbles: true }));
        return 'prosemirror';
      }

      // Try bytedance editor (bf-editor)
      const bfEditor = document.querySelector('.bf-content') as HTMLElement;
      if (bfEditor) {
        bfEditor.innerHTML = html;
        bfEditor.dispatchEvent(new Event('input', { bubbles: true }));
        return 'bf-editor';
      }

      return null;
    }, htmlContent);

    if (contentInjected) {
      logger.info(`Content injected via: ${contentInjected}`);
    } else {
      logger.warn('Could not inject content into editor, trying clipboard paste');
      const editable = await page.$('[contenteditable="true"]');
      if (editable) {
        await editable.click();
        await page.evaluate((html: string) => {
          document.execCommand('selectAll');
          document.execCommand('insertHTML', false, html);
        }, htmlContent);
        logger.info('Content inserted via execCommand');
      } else {
        throw new Error('找不到正文编辑区域');
      }
    }

    await randomDelay(1000, 2000);

    // Save draft
    let saved = false;

    // Approach 1: Ctrl+S
    try {
      await page.keyboard.press('Control+s');
      await randomDelay(3000, 5000);
      saved = true;
      logger.info('Draft saved via Ctrl+S');
    } catch (e: any) {
      logger.warn(`Ctrl+S failed: ${e.message}`);
    }

    // Approach 2: Click save/draft button
    if (!saved) {
      const saveBtnSelectors = [
        'button:has-text("存草稿")',
        'button:has-text("保存草稿")',
        'button:has-text("保存")',
        '.save-draft',
        '.btn-save',
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
    emit('done', '草稿已保存到头条号');
    logger.info(`Browser publish done: ${title}`);
    return { ok: true };
  } catch (e: any) {
    const msg = e.message || String(e);
    emit('error', msg);
    logger.error('Browser toutiao publish error', e);
    return { ok: false, error: msg };
  }
}
