import zlib from 'zlib';
import { getLogger } from '../../util/logger';
import type { ToolProviderConfig } from '../../config/tool-config';
import { llmGenerateImage } from '../../llm/provider';

const logger = getLogger('publisher-wechat-mp');

const WX_API = 'https://api.weixin.qq.com';

// Simple in-memory token cache
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(appId: string, appSecret: string): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  const url = `${WX_API}/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
  const resp = await fetch(url);
  const data = await resp.json() as any;
  if (data.errcode) {
    throw new Error(`WeChat token error ${data.errcode}: ${data.errmsg}`);
  }
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
}

// 生成纯色 PNG 作为 fallback (900x383, 微信封面最小要求)
function generateFallbackPng(): Buffer {
  const width = 900;
  const height = 383;
  // 每行: filter byte (0) + 3 bytes RGB per pixel
  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const offset = y * rowSize;
    rawData[offset] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 3;
      rawData[px] = 0x40;     // R
      rawData[px + 1] = 0x40; // G
      rawData[px + 2] = 0x50; // B (深灰蓝)
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // Build PNG file
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function pngChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type, 'ascii');
    const payload = Buffer.concat([typeB, data]);
    const crc = Buffer.alloc(4);
    crc.writeInt32BE(crc32(payload));
    return Buffer.concat([len, payload, crc]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Simple CRC32 for PNG chunks
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) | 0;
}

// 生成封面图并上传到微信素材库
async function generateAndUploadThumb(token: string, title: string): Promise<string> {
  let imageBuffer: Buffer;
  let contentType: string;
  let ext: string;

  try {
    imageBuffer = await llmGenerateImage({
      prompt: `为以下文章生成一张精美的封面图，风格简洁现代，适合微信公众号：${title}`,
      size: '1792x1024',
    });
    contentType = 'image/png';
    ext = 'png';
    logger.info(`AI-generated cover image for: ${title}`);
  } catch (e: any) {
    logger.warn(`Image generation failed, using fallback: ${e.message}`);
    imageBuffer = generateFallbackPng();
    contentType = 'image/png';
    ext = 'png';
  }

  const boundary = '----WxFormBoundary' + Date.now();
  const fileName = `cover.${ext}`;
  const bodyParts = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="media"; filename="${fileName}"\r\n`,
    `Content-Type: ${contentType}\r\n\r\n`,
  ];
  const header = Buffer.from(bodyParts.join(''));
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, imageBuffer, footer]);

  const resp = await fetch(`${WX_API}/cgi-bin/material/add_material?access_token=${token}&type=thumb`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const data = await resp.json() as any;
  if (data.errcode) {
    throw new Error(`Upload thumb failed ${data.errcode}: ${data.errmsg}`);
  }
  logger.info(`Thumb uploaded: ${data.media_id}`);
  return data.media_id;
}

import { markdownToWechatHtml } from './wechat-html-themes';

export async function publishWechatMp(
  item: { kind: string; title?: string; content: string; status: string; createdAt: string },
  config: ToolProviderConfig,
  theme?: string,
  styledHtml?: string,
): Promise<{ ok: boolean; error?: string }> {
  const appId = config.baseUrl;
  const appSecret = config.apiKey;
  if (!appId || !appSecret) {
    return { ok: false, error: 'WeChat AppID (baseUrl) or AppSecret (apiKey) not configured' };
  }

  try {
    const token = await getAccessToken(appId, appSecret);
    const title = item.title || (item.kind === 'tweet' ? '推文' : '文章');
    const thumbMediaId = await generateAndUploadThumb(token, title);

    const htmlContent = styledHtml || markdownToWechatHtml(item.content, theme);

    const articles = [{
      title,
      thumb_media_id: thumbMediaId,
      author: 'OneTeam',
      content: htmlContent,
      content_source_url: '',
      need_open_comment: 0,
      only_fans_can_comment: 0,
    }];

    const resp = await fetch(`${WX_API}/cgi-bin/draft/add?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles }),
    });
    const data = await resp.json() as any;
    if (data.errcode) {
      logger.error(`WeChat draft/add failed: ${data.errcode} ${data.errmsg}`);
      return { ok: false, error: `WeChat error ${data.errcode}: ${data.errmsg}` };
    }

    logger.info(`WeChat draft created: media_id=${data.media_id}`);
    return { ok: true };
  } catch (e: any) {
    logger.error('WeChat publish error', e);
    return { ok: false, error: e.message || String(e) };
  }
}
