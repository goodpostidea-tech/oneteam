import fs from 'fs';
import path from 'path';
import { getLogger } from '../util/logger';
import { CONFIG_DIR } from './paths';

const logger = getLogger('llm-config');

export interface LlmModelConfig {
  id: string;
  name: string;        // 用户自定义展示名
  provider: string;    // 'anthropic' | 'openai' | 'deepseek' | 'custom'
  model: string;       // 实际模型标识
  apiKey: string;
  baseUrl: string;
  isDefault: boolean;
  type?: 'text' | 'image';  // 默认 'text'
}

const CONFIG_PATH = path.join(CONFIG_DIR, 'llm-config.json');

let cached: LlmModelConfig[] | null = null;

function readConfigs(): LlmModelConfig[] {
  if (cached) return cached;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      // 兼容旧的单对象格式，自动迁移为数组
      if (raw && !Array.isArray(raw) && raw.provider) {
        const migrated: LlmModelConfig = {
          id: 'default',
          name: `${raw.provider} - ${raw.model}`,
          provider: raw.provider,
          model: raw.model,
          apiKey: raw.apiKey || '',
          baseUrl: raw.baseUrl || '',
          isDefault: true,
        };
        cached = [migrated];
        writeConfigs(cached);
        return cached;
      }
      const arr = raw as LlmModelConfig[];
      // 迁移：旧配置无 type 字段的自动补 'text'
      let migrated = false;
      for (const c of arr) {
        if (!c.type) { c.type = 'text'; migrated = true; }
      }
      if (migrated) writeConfigs(arr);
      cached = arr;
      return cached;
    }
  } catch (e) {
    logger.error('Failed to read llm-config.json', e);
  }
  cached = [];
  return cached;
}

function writeConfigs(configs: LlmModelConfig[]): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(configs, null, 2), 'utf-8');
  cached = configs;
}

export function getAllLlmConfigs(): LlmModelConfig[] {
  return readConfigs();
}

export function getDefaultLlmConfig(): LlmModelConfig | null {
  const all = readConfigs();
  const textConfigs = all.filter(c => (c.type || 'text') === 'text');
  return textConfigs.find(c => c.isDefault) || textConfigs[0] || null;
}

export function getDefaultImageConfig(): LlmModelConfig | null {
  const all = readConfigs();
  const imageConfigs = all.filter(c => c.type === 'image');
  return imageConfigs.find(c => c.isDefault) || imageConfigs[0] || null;
}

export function getLlmConfigById(id: string): LlmModelConfig | null {
  const all = readConfigs();
  return all.find(c => c.id === id) || null;
}


export function addLlmConfig(input: Omit<LlmModelConfig, 'id'>): LlmModelConfig {
  const configs = readConfigs();
  const id = `model_${Date.now()}`;
  const entry: LlmModelConfig = { id, ...input };
  if (!entry.type) entry.type = 'text';
  const entryType = entry.type;
  // 如果是默认，取消同类型的其他默认
  if (entry.isDefault) {
    configs.filter(c => (c.type || 'text') === entryType).forEach(c => c.isDefault = false);
  }
  // 如果是该类型的第一个，自动设为默认
  if (!configs.some(c => (c.type || 'text') === entryType)) {
    entry.isDefault = true;
  }
  configs.push(entry);
  writeConfigs(configs);
  logger.info(`LLM config added: ${entry.name} (${entry.provider}/${entry.model})`);
  return entry;
}

export function updateLlmConfig(id: string, update: Partial<LlmModelConfig>): LlmModelConfig | null {
  const configs = readConfigs();
  const idx = configs.findIndex(c => c.id === id);
  if (idx === -1) return null;
  // 如果设为默认，取消其他
  if (update.isDefault) {
    const targetType = update.type || configs[idx].type || 'text';
    configs.filter(c => (c.type || 'text') === targetType).forEach(c => c.isDefault = false);
  }
  configs[idx] = { ...configs[idx], ...update, id }; // id 不可变
  writeConfigs(configs);
  logger.info(`LLM config updated: ${configs[idx].name}`);
  return configs[idx];
}

export function deleteLlmConfig(id: string): boolean {
  const configs = readConfigs();
  const idx = configs.findIndex(c => c.id === id);
  if (idx === -1) return false;
  const wasDefault = configs[idx].isDefault;
  const deletedType = configs[idx].type || 'text';
  configs.splice(idx, 1);
  // 如果删除的是默认，自动把同类型的第一个设为默认
  if (wasDefault) {
    const sameType = configs.find(c => (c.type || 'text') === deletedType);
    if (sameType) sameType.isDefault = true;
  }
  writeConfigs(configs);
  logger.info(`LLM config deleted: ${id}`);
  return true;
}

export function isLlmReady(): boolean {
  const cfg = getDefaultLlmConfig();
  return !!(cfg && cfg.apiKey);
}

export function setDefaultLlmConfig(id: string): boolean {
  const configs = readConfigs();
  const target = configs.find(c => c.id === id);
  if (!target) return false;
  const targetType = target.type || 'text';
  // 只影响同类型的配置
  configs.filter(c => (c.type || 'text') === targetType).forEach(c => c.isDefault = c.id === id);
  writeConfigs(configs);
  return true;
}
