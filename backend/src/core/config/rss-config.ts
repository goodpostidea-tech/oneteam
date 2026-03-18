import fs from 'fs';
import path from 'path';
import { getLogger } from '../util/logger';
import { CONFIG_DIR } from './paths';

const logger = getLogger('rss-config');

export interface RssFeedConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  lastFetchedAt: string | null;
}

const CONFIG_PATH = path.join(CONFIG_DIR, 'rss-config.json');

let cached: RssFeedConfig[] | null = null;

function readConfigs(): RssFeedConfig[] {
  if (cached) return cached;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      cached = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as RssFeedConfig[];
      return cached;
    }
  } catch (e) {
    logger.error('Failed to read rss-config.json', e);
  }
  cached = [];
  writeConfigs(cached);
  return cached;
}

function writeConfigs(configs: RssFeedConfig[]): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(configs, null, 2), 'utf-8');
  cached = configs;
}

export function getAllRssFeeds(): RssFeedConfig[] {
  return readConfigs();
}

export function addRssFeed(input: { name: string; url: string }): RssFeedConfig {
  const configs = readConfigs();
  const entry: RssFeedConfig = {
    id: `rss_${Date.now()}`,
    name: input.name,
    url: input.url,
    enabled: true,
    lastFetchedAt: null,
  };
  configs.push(entry);
  writeConfigs(configs);
  logger.info(`RSS feed added: ${entry.name}`);
  return entry;
}

export function updateRssFeed(id: string, update: Partial<RssFeedConfig>): RssFeedConfig | null {
  const configs = readConfigs();
  const idx = configs.findIndex(c => c.id === id);
  if (idx === -1) return null;
  configs[idx] = { ...configs[idx], ...update, id };
  writeConfigs(configs);
  logger.info(`RSS feed updated: ${configs[idx].name}`);
  return configs[idx];
}

export function deleteRssFeed(id: string): boolean {
  const configs = readConfigs();
  const idx = configs.findIndex(c => c.id === id);
  if (idx === -1) return false;
  configs.splice(idx, 1);
  writeConfigs(configs);
  logger.info(`RSS feed deleted: ${id}`);
  return true;
}
