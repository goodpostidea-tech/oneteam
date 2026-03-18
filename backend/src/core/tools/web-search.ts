import { getToolConfigsByKind } from '../config/tool-config';
import { getLogger } from '../util/logger';

const logger = getLogger('web-search');

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SearchResponse {
  results: SearchResult[];
  error?: string;
  fallback?: boolean;
}

async function searchWithTavily(query: string, apiKey: string, baseUrl: string): Promise<SearchResponse> {
  const res = await fetch(`${baseUrl}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 5, include_answer: false, topic: 'general', days: 90 }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`);
  const data = await res.json() as any;
  return {
    results: (data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.content || '',
    })),
  };
}

async function searchWithBing(query: string, apiKey: string, baseUrl: string): Promise<SearchResponse> {
  const url = `${baseUrl}?q=${encodeURIComponent(query)}&count=5`;
  const res = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': apiKey },
  });
  if (!res.ok) throw new Error(`Bing ${res.status}: ${await res.text()}`);
  const data = await res.json() as any;
  return {
    results: (data.webPages?.value || []).map((r: any) => ({
      title: r.name || '',
      url: r.url || '',
      snippet: r.snippet || '',
    })),
  };
}

export async function executeWebSearch(query: string): Promise<SearchResponse> {
  const providers = getToolConfigsByKind('web_search');
  logger.info(`web_search: ${providers.length} enabled providers, query="${query}"`);

  for (const p of providers) {
    if (!p.apiKey) {
      logger.info(`web_search: skipping ${p.name} (no apiKey)`);
      continue;
    }
    try {
      logger.info(`web_search: trying ${p.name} for "${query}"`);
      let result: SearchResponse;
      if (p.id === 'tavily' || p.name.toLowerCase().includes('tavily')) {
        result = await searchWithTavily(query, p.apiKey, p.baseUrl || 'https://api.tavily.com');
      } else if (p.id === 'bing' || p.name.toLowerCase().includes('bing')) {
        result = await searchWithBing(query, p.apiKey, p.baseUrl || 'https://api.bing.microsoft.com/v7.0/search');
      } else {
        result = await searchWithTavily(query, p.apiKey, p.baseUrl);
      }
      logger.info(`web_search: ${p.name} returned ${result.results.length} results`);
      return result;
    } catch (e: any) {
      logger.error(`web_search: ${p.name} failed: ${e.message || e}`);
    }
  }

  logger.warn('web_search: all providers exhausted, returning fallback');
  return { results: [], error: '搜索服务不可用，所有 provider 均无可用 API Key 或调用失败', fallback: true };
}
