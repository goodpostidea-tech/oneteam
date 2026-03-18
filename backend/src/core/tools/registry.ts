import { tool, jsonSchema } from 'ai';
import { executeWebSearch } from './web-search';
import { executeUrlFetch } from './url-fetch';

export function buildTools(toolKinds: string[]): Record<string, any> {
  const tools: Record<string, any> = {};

  if (toolKinds.includes('web_search')) {
    tools.web_search = (tool as any)({
      description: '搜索互联网获取实时信息',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
        },
        required: ['query'],
      }),
      execute: async ({ query }: { query: string }) => executeWebSearch(query),
    });
  }

  if (toolKinds.includes('url_fetch')) {
    tools.url_fetch = (tool as any)({
      description: '读取指定 URL 的网页正文内容',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          url: { type: 'string', description: '要读取的网页 URL' },
        },
        required: ['url'],
      }),
      execute: async ({ url }: { url: string }) => executeUrlFetch(url),
    });
  }

  return tools;
}
