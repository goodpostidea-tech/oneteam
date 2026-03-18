import fs from 'fs';
import path from 'path';
import { getLogger } from '../util/logger';
import { CONFIG_DIR } from './paths';

const logger = getLogger('tool-config');

export interface ToolProviderConfig {
  id: string;
  kind: string;       // 'web_search' | 'url_fetch'
  name: string;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  priority: number;    // 同 kind 内优先级，数字小优先
}

const CONFIG_PATH = path.join(CONFIG_DIR, 'tool-config.json');

const DEFAULT_CONFIGS: ToolProviderConfig[] = [
  { id: 'tavily', kind: 'web_search', name: 'Tavily Search', apiKey: '', baseUrl: 'https://api.tavily.com', enabled: true, priority: 1 },
  { id: 'bing', kind: 'web_search', name: 'Bing Search', apiKey: '', baseUrl: 'https://api.bing.microsoft.com/v7.0/search', enabled: true, priority: 2 },
  { id: 'jina', kind: 'url_fetch', name: 'Jina Reader', apiKey: '', baseUrl: 'https://r.jina.ai', enabled: true, priority: 1 },
  { id: 'readability', kind: 'url_fetch', name: '内置 Readability', apiKey: '', baseUrl: '', enabled: true, priority: 2 },
  { id: 'webhook', kind: 'publisher', name: 'Webhook', apiKey: '', baseUrl: '', enabled: false, priority: 1 },
  { id: 'wechat-mp', kind: 'publisher', name: '微信公众号', apiKey: '', baseUrl: '', enabled: false, priority: 2 },
  { id: 'browser-wechat-mp', kind: 'publisher', name: '微信公众号(浏览器)', apiKey: '', baseUrl: '', enabled: false, priority: 3 },
];

let cached: ToolProviderConfig[] | null = null;

function readConfigs(): ToolProviderConfig[] {
  if (cached) return cached;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as ToolProviderConfig[];
      // 把 DEFAULT_CONFIGS 中新增但文件中缺少的条目自动补入
      const existingIds = new Set(existing.map(c => c.id));
      const missing = DEFAULT_CONFIGS.filter(d => !existingIds.has(d.id));
      if (missing.length > 0) {
        existing.push(...missing);
        writeConfigs(existing);
        logger.info(`Auto-merged ${missing.length} new default config(s): ${missing.map(m => m.id).join(', ')}`);
      }
      cached = existing;
      return cached;
    }
  } catch (e) {
    logger.error('Failed to read tool-config.json', e);
  }
  // 首次运行，写入默认
  cached = [...DEFAULT_CONFIGS];
  writeConfigs(cached);
  return cached;
}

function writeConfigs(configs: ToolProviderConfig[]): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(configs, null, 2), 'utf-8');
  cached = configs;
}

export function getAllToolConfigs(): ToolProviderConfig[] {
  return readConfigs();
}

export function getToolConfigsByKind(kind: string): ToolProviderConfig[] {
  return readConfigs()
    .filter(c => c.kind === kind && c.enabled)
    .sort((a, b) => a.priority - b.priority);
}

export function addToolConfig(input: Omit<ToolProviderConfig, 'id'>): ToolProviderConfig {
  const configs = readConfigs();
  const id = `tool_${Date.now()}`;
  const entry: ToolProviderConfig = { id, ...input };
  configs.push(entry);
  writeConfigs(configs);
  logger.info(`Tool config added: ${entry.name} (${entry.kind})`);
  return entry;
}

export function updateToolConfig(id: string, update: Partial<ToolProviderConfig>): ToolProviderConfig | null {
  const configs = readConfigs();
  const idx = configs.findIndex(c => c.id === id);
  if (idx === -1) return null;
  configs[idx] = { ...configs[idx], ...update, id };
  writeConfigs(configs);
  logger.info(`Tool config updated: ${configs[idx].name}`);
  return configs[idx];
}

export function deleteToolConfig(id: string): boolean {
  const configs = readConfigs();
  const idx = configs.findIndex(c => c.id === id);
  if (idx === -1) return false;
  configs.splice(idx, 1);
  writeConfigs(configs);
  logger.info(`Tool config deleted: ${id}`);
  return true;
}
