import React, { useState, useEffect, useCallback } from 'react';
import type { RssFeedConfig } from '../types';
import { api } from '../api';
import { cn } from '../lib/utils';
import { Plus, Trash2, RefreshCw } from 'lucide-react';

const FeedCard: React.FC<{
  feed: RssFeedConfig;
  onUpdate: (id: string, data: Partial<RssFeedConfig>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}> = ({ feed, onUpdate, onDelete }) => {
  const [name, setName] = useState(feed.name);
  const [url, setUrl] = useState(feed.url);
  const [enabled, setEnabled] = useState(feed.enabled);
  const [saving, setSaving] = useState(false);
  const dirty = name !== feed.name || url !== feed.url;

  const handleSave = async () => {
    setSaving(true);
    try { await onUpdate(feed.id, { name, url }); }
    finally { setSaving(false); }
  };

  const handleToggle = async () => {
    const next = !enabled;
    setEnabled(next);
    await onUpdate(feed.id, { enabled: next });
  };

  const relTime = (dateStr: string | null) => {
    if (!dateStr) return '从未';
    const diffMin = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH}小时前`;
    return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="card p-5 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-md font-semibold text-t1">{feed.name}</span>
          <span className="text-2xs font-mono px-1.5 py-0.5 rounded-md bg-bg-inset text-t4">上次: {relTime(feed.lastFetchedAt)}</span>
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
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="w-10 text-xs text-t3 text-right flex-shrink-0">名称</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-bg-hover border-none text-sm text-t1 outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)]" />
        </div>
        <div className="flex items-center gap-2">
          <label className="w-10 text-xs text-t3 text-right flex-shrink-0">URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/feed"
            className="flex-1 px-3 py-2 rounded-lg bg-bg-hover border-none text-sm font-mono text-t1 placeholder:text-t4 outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)]" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        {dirty && (
          <button onClick={handleSave} disabled={saving}
            className="px-3.5 py-1.5 rounded-lg bg-t1 text-white text-xs font-semibold border-none cursor-pointer hover:opacity-85 disabled:opacity-50 transition-opacity"
          >{saving ? '保存中…' : '保存'}</button>
        )}
        <button onClick={() => onDelete(feed.id)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-danger font-medium border-none cursor-pointer bg-transparent hover:bg-danger-bg transition-colors"
        >
          <Trash2 size={12} /> 删除
        </button>
      </div>
    </div>
  );
};

export const SettingsRssTab: React.FC = () => {
  const [feeds, setFeeds] = useState<RssFeedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const loadFeeds = useCallback(async () => {
    try { setFeeds(await api.getRssFeeds()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadFeeds(); }, [loadFeeds]);

  const handleAdd = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    setAdding(true);
    try {
      await api.addRssFeed({ name: newName.trim(), url: newUrl.trim() });
      setNewName(''); setNewUrl(''); setShowAdd(false);
      await loadFeeds();
    } finally { setAdding(false); }
  };

  const handleUpdate = async (id: string, data: Partial<RssFeedConfig>) => {
    await api.updateRssFeed(id, data);
    await loadFeeds();
  };

  const handleDelete = async (id: string) => {
    await api.deleteRssFeed(id);
    await loadFeeds();
  };

  if (loading) return <div className="py-10 text-t3 text-sm">加载中…</div>;

  return (
    <div className="max-w-2xl animate-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-t1 tracking-tight mb-1">RSS 订阅源</h2>
          <p className="text-sm text-t3">配置 RSS 源后，新文章将自动进入素材箱</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-bg-hover text-sm font-medium text-t2 border-none cursor-pointer hover:bg-bg-inset transition-colors"
        >
          <Plus size={14} /> 添加源
        </button>
      </div>

      {showAdd && (
        <div className="card p-5 mb-4 ring-2 ring-[var(--color-primary-muted)]">
          <div className="space-y-2 mb-3">
            <div className="flex items-center gap-2">
              <label className="w-10 text-xs text-t3 text-right flex-shrink-0">名称</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="例如: Hacker News"
                className="flex-1 px-3 py-2 rounded-lg bg-bg-hover border-none text-sm text-t1 placeholder:text-t4 outline-none" />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-10 text-xs text-t3 text-right flex-shrink-0">URL</label>
              <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://hnrss.org/frontpage"
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                className="flex-1 px-3 py-2 rounded-lg bg-bg-hover border-none text-sm font-mono text-t1 placeholder:text-t4 outline-none" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)}
              className="px-4 py-1.5 rounded-lg bg-bg-hover text-sm font-medium text-t2 border-none cursor-pointer hover:bg-bg-inset transition-colors"
            >取消</button>
            <button onClick={handleAdd} disabled={adding || !newName.trim() || !newUrl.trim()}
              className="px-4 py-1.5 rounded-lg bg-t1 text-white text-sm font-semibold border-none cursor-pointer hover:opacity-85 disabled:opacity-50 transition-opacity"
            >{adding ? '添加中…' : '添加'}</button>
          </div>
        </div>
      )}

      {feeds.length === 0 && !showAdd && (
        <div className="flex flex-col items-center justify-center py-16 text-t4 text-sm gap-3">
          <RefreshCw size={28} strokeWidth={1.5} />
          暂无订阅源，点击「添加源」开始配置
        </div>
      )}

      {feeds.map(feed => (
        <FeedCard key={feed.id} feed={feed} onUpdate={handleUpdate} onDelete={handleDelete} />
      ))}
    </div>
  );
};
