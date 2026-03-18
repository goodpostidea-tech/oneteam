import { getLogger } from '../../util/logger';
import type { ToolProviderConfig } from '../../config/tool-config';

const logger = getLogger('publisher-webhook');

export async function publishWebhook(
  item: { kind: string; title?: string; content: string; status: string; createdAt: string },
  config: ToolProviderConfig,
): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  const url = config.baseUrl;
  if (!url) return { ok: false, error: 'Webhook URL (baseUrl) is not configured' };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: item.kind,
        title: item.title || undefined,
        content: item.content,
        status: item.status,
        createdAt: item.createdAt,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      logger.error(`Webhook POST failed: ${resp.status} ${text}`);
      return { ok: false, statusCode: resp.status, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
    }
    logger.info(`Webhook published to ${url}, status=${resp.status}`);
    return { ok: true, statusCode: resp.status };
  } catch (e: any) {
    logger.error('Webhook publish error', e);
    return { ok: false, error: e.message || String(e) };
  }
}
