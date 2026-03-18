import { getLogger } from '../../util/logger';
import type { ToolProviderConfig } from '../../config/tool-config';
import { publishWebhook } from './webhook';
import { publishWechatMp } from './wechat-mp';
import { publishBrowserWechatMp } from './browser-wechat-mp';

const logger = getLogger('publisher');

export interface PublishResult {
  ok: boolean;
  error?: string;
  statusCode?: number;
}

export async function publish(
  item: { kind: string; title?: string; content: string; status: string; createdAt: string },
  config: ToolProviderConfig,
  theme?: string,
  styledHtml?: string,
): Promise<PublishResult> {
  logger.info(`Publishing via ${config.id} (${config.name}), theme=${theme || 'default'}, styledHtml=${styledHtml ? 'yes' : 'no'}`);

  switch (config.id) {
    case 'webhook':
      return publishWebhook(item, config);
    case 'wechat-mp':
      return publishWechatMp(item, config, theme, styledHtml);
    case 'browser-wechat-mp':
      return publishBrowserWechatMp(item, config, theme, styledHtml);
    default:
      // For custom publisher configs, try webhook as default behavior
      if (config.baseUrl?.startsWith('http')) {
        return publishWebhook(item, config);
      }
      return { ok: false, error: `Unknown publisher: ${config.id}` };
  }
}
