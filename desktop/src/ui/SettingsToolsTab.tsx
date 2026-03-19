import React, { useState, useEffect, useCallback } from 'react';
import type { ToolProviderConfig } from '../types';
import { api } from '../api';
import { cn } from '../lib/utils';

const KIND_LABELS: Record<string, string> = {
  web_search: '搜索引擎',
  url_fetch: '网页抓取',
  publisher: '发布渠道',
};

const FIELD_PLACEHOLDERS: Record<string, { apiKey?: string; baseUrl?: string }> = {
  'wechat-mp': { apiKey: 'AppSecret', baseUrl: 'AppID' },
  'webhook': { apiKey: 'Authorization Token (可选)', baseUrl: 'Webhook URL (https://...)' },
  'browser-wechat-mp': {},
  'browser-toutiao': {},
};

const ToolCard: React.FC<{
  config: ToolProviderConfig;
  onUpdate: (id: string, data: Partial<ToolProviderConfig>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}> = ({ config, onUpdate }) => {
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [enabled, setEnabled] = useState(config.enabled);
  const [saving, setSaving] = useState(false);
  const ph = FIELD_PLACEHOLDERS[config.id];
  const isPublisher = config.kind === 'publisher';

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: Partial<ToolProviderConfig> = { apiKey };
      if (isPublisher) data.baseUrl = baseUrl;
      await onUpdate(config.id, data);
    } finally { setSaving(false); }
  };

  const handleToggle = async () => {
    const next = !enabled;
    setEnabled(next);
    await onUpdate(config.id, { enabled: next });
  };

  return (
    <div className="card p-5 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-md font-semibold text-t1">{config.name}</span>
          <span className="text-2xs font-mono px-1.5 py-0.5 rounded-md bg-bg-inset text-t4">优先级 {config.priority}</span>
        </div>
        <button
          onClick={handleToggle}
          className={cn(
            'px-3 py-1 rounded-lg text-xs font-semibold border-none cursor-pointer transition-colors',
            enabled ? 'bg-t1 text-white' : 'bg-bg-inset text-t4',
          )}
        >
          {enabled ? '已启用' : '已禁用'}
        </button>
      </div>

      {config.id === 'browser-wechat-mp' ? (
        <p className="text-sm text-t3 leading-relaxed">
          首次发布时会打开浏览器，请扫码登录微信公众号后台。登录状态会自动保持。
        </p>
      ) : config.id === 'browser-toutiao' ? (
        <p className="text-sm text-t3 leading-relaxed">
          首次发布时会打开浏览器，请扫码登录今日头条创作平台。登录状态会自动保持。
        </p>
      ) : config.id !== 'readability' && (
        <div className="space-y-2">
          {isPublisher && (
            <input
              type="text"
              placeholder={ph?.baseUrl || 'Base URL'}
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg-hover border-none text-sm font-mono text-t1 placeholder:text-t4 outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)]"
            />
          )}
          <div className="flex gap-2 items-center">
            <input
              type="password"
              placeholder={ph?.apiKey || 'API Key'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-bg-hover border-none text-sm font-mono text-t1 placeholder:text-t4 outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)]"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3.5 py-2 rounded-lg bg-bg-inset text-sm font-medium text-t2 border-none cursor-pointer hover:bg-t1 hover:text-white transition-colors disabled:opacity-50"
            >
              {saving ? '…' : '保存'}
            </button>
          </div>
        </div>
      )}

      {config.hasKey && (
        <div className="text-xs text-success font-medium mt-2">Key 已配置</div>
      )}
    </div>
  );
};

export const SettingsToolsTab: React.FC = () => {
  const [configs, setConfigs] = useState<ToolProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setConfigs(await api.getToolConfigs()); }
    catch (e) { console.error('Failed to load tool configs', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpdate = async (id: string, data: Partial<ToolProviderConfig>) => {
    await api.updateToolConfig(id, data);
    await load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteToolConfig(id);
    await load();
  };

  if (loading) return <div className="py-10 text-t3 text-sm">加载中…</div>;

  const grouped = configs.reduce<Record<string, ToolProviderConfig[]>>((acc, c) => {
    (acc[c.kind] = acc[c.kind] || []).push(c);
    return acc;
  }, {});

  return (
    <div className="max-w-2xl animate-fade-up">
      <h2 className="text-2xl font-bold text-t1 tracking-tight mb-1">工具配置</h2>
      <p className="text-sm text-t3 mb-6">
        配置 Agent 可用的外部工具。填写 API Key 并启用后，Agent 在执行任务时会自动调用这些工具。
      </p>

      {Object.entries(grouped).map(([kind, items]) => (
        <div key={kind} className="mb-6">
          <div className="text-xs font-semibold text-t3 tracking-wide mb-3">
            {KIND_LABELS[kind] || kind}
          </div>
          {items.map(c => (
            <ToolCard key={c.id} config={c} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))}
        </div>
      ))}
    </div>
  );
};
