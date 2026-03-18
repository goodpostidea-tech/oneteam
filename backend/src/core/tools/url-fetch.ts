import { getToolConfigsByKind } from '../config/tool-config';
import { getLogger } from '../util/logger';

const logger = getLogger('url-fetch');

interface FetchResponse {
  content: string;
  title?: string;
  error?: string;
  fallback?: boolean;
}

async function fetchWithJina(url: string, apiKey: string, baseUrl: string): Promise<FetchResponse> {
  const endpoint = `${baseUrl || 'https://r.jina.ai'}/${url}`;
  const headers: Record<string, string> = {
    Accept: 'text/plain',
    'X-Return-Format': 'markdown',
    'X-With-Generated-Alt': 'true',
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Jina ${res.status}: ${await res.text()}`);
  const text = await res.text();
  // Extract title from markdown (first "Title: ..." line)
  const titleMatch = text.match(/^Title:\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : url;
  return { content: text.slice(0, 8000), title };
}

async function fetchWithReadability(url: string): Promise<FetchResponse> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OneTeam/1.0)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const html = await res.text();

  const { parseHTML } = await import('linkedom');
  const { Readability } = await import('@mozilla/readability');
  const { document } = parseHTML(html);
  const reader = new Readability(document as any);
  const article = reader.parse();

  if (!article) throw new Error('Readability failed to parse');
  return { content: (article.textContent || '').slice(0, 8000), title: article.title || undefined };
}

export async function executeUrlFetch(url: string): Promise<FetchResponse> {
  const providers = getToolConfigsByKind('url_fetch');

  for (const p of providers) {
    try {
      logger.info(`url_fetch: trying ${p.name} for "${url}"`);
      if (p.id === 'jina' || p.name.toLowerCase().includes('jina')) {
        return await fetchWithJina(url, p.apiKey, p.baseUrl);
      }
      if (p.id === 'readability' || p.name.toLowerCase().includes('readability')) {
        return await fetchWithReadability(url);
      }
      // 自定义 — 默认 Jina 兼容
      return await fetchWithJina(url, p.apiKey, p.baseUrl);
    } catch (e) {
      logger.warn(`url_fetch: ${p.name} failed`, e);
    }
  }

  logger.warn('url_fetch: all providers failed, returning fallback');
  return { content: '', error: '无法获取页面，所有 provider 均失败', fallback: true };
}
