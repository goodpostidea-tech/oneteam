import React, { useState, useEffect, useCallback } from 'react';
import { AgentAvatar } from './AgentAvatar';
import { api } from '../api';
import { cn } from '../lib/utils';
import type { Agent, AgentConfigDetail, LlmModelConfig } from '../types';
import { Save, RotateCcw, ChevronDown, ChevronRight, Eye, Code2 } from 'lucide-react';

const TEMPLATE_VARS = [
  { key: '{{name}}', desc: '名称' },
  { key: '{{role}}', desc: '角色' },
  { key: '{{style}}', desc: '风格' },
  { key: '{{catchphrase}}', desc: '口头禅' },
  { key: '{{perspective}}', desc: '性格特点' },
  { key: '{{memories}}', desc: '记忆内容' },
  { key: '{{voice}}', desc: '经验沉淀' },
];

const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-bg-hover border-none text-sm text-t1 placeholder:text-t4 outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)]';

interface Props {
  onChanged?: () => void;
}

export const SettingsAgentsTab: React.FC<Props> = ({ onChanged }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentConfigDetail | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [advancedMode, setAdvancedMode] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [models, setModels] = useState<LlmModelConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    const data = await api.getAgentConfigs();
    setAgents(data);
    if (!selectedId && data.length > 0) setSelectedId(data[0].id);
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  useEffect(() => {
    api.getLlmConfigs().then(setModels).catch(() => {});
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const d = await api.getAgentConfigDetail(id);
    setDetail(d);
    setForm({
      name: d.overrides.name ?? '',
      role: d.overrides.role ?? '',
      style: d.overrides.style ?? '',
      catchphrase: d.overrides.catchphrase ?? '',
      perspective: d.overrides.perspective ?? '',
      customSystemPrompt: d.overrides.customSystemPrompt ?? '',
    });
    setSelectedModelId(d.overrides.modelId ?? null);
    setAdvancedMode(!!d.overrides.customSystemPrompt);
    setDirty(false);
  }, []);

  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId, loadDetail]);

  const handleChange = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const payload: Record<string, string | null> = {};
      for (const key of ['name', 'role', 'style', 'catchphrase', 'perspective', 'customSystemPrompt']) {
        payload[key] = form[key] || null;
      }
      if (!advancedMode) payload.customSystemPrompt = null;
      payload.modelId = selectedModelId;
      const d = await api.updateAgentConfig(selectedId, payload);
      setDetail(d);
      setDirty(false);
      await loadAgents();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const d = await api.resetAgentConfig(selectedId);
      setDetail(d);
      setForm({ name: '', role: '', style: '', catchphrase: '', perspective: '', customSystemPrompt: '' });
      setSelectedModelId(null);
      setAdvancedMode(false);
      setDirty(false);
      await loadAgents();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  };

  const buildPreview = (): string => {
    if (!detail) return '';
    const m = detail.merged;
    const name = form.name || m.name;
    const role = form.role || m.role;
    const style = form.style || m.style;
    const catchphrase = form.catchphrase || m.catchphrase;
    const perspective = form.perspective || m.perspective;

    if (advancedMode && form.customSystemPrompt) {
      return form.customSystemPrompt
        .replace(/\{\{name\}\}/g, name)
        .replace(/\{\{role\}\}/g, role)
        .replace(/\{\{style\}\}/g, style)
        .replace(/\{\{catchphrase\}\}/g, catchphrase)
        .replace(/\{\{perspective\}\}/g, perspective)
        .replace(/\{\{memories\}\}/g, '（运行时注入）')
        .replace(/\{\{voice\}\}/g, '（运行时注入）');
    }

    return [
      `你是 ${name}，角色：${role}。`,
      `风格：${style}`,
      `口头禅（仅偶尔使用）："${catchphrase}"`,
      `性格特点：${perspective}`,
      '请始终以该角色身份回复，保持人设一致。',
    ].join('\n');
  };

  const FIELDS: { key: string; label: string }[] = [
    { key: 'name', label: '名称' },
    { key: 'role', label: '角色' },
    { key: 'style', label: '风格' },
    { key: 'catchphrase', label: '口头禅' },
    { key: 'perspective', label: '性格特点' },
  ];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: agent list */}
      <div className="w-[200px] flex-shrink-0 border-r border-border-2 overflow-y-auto p-3">
        {agents.map(a => {
          const isActive = a.id === selectedId;
          return (
            <div
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className={cn(
                'flex items-center gap-2 px-2.5 py-2 mb-1 rounded-lg cursor-pointer transition-colors duration-100',
                isActive ? 'bg-bg-hover' : 'bg-transparent hover:bg-bg-hover/60',
              )}
            >
              <AgentAvatar id={a.id} name={a.name} size={30} online={false} active={isActive} />
              <div className="flex-1 min-w-0">
                <div className={cn('text-sm truncate', isActive ? 'font-semibold text-t1' : 'font-medium text-t1')}>{a.name}</div>
                <div className="text-2xs text-t4 truncate">{a.role}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right: edit form */}
      <div className="flex-1 overflow-y-auto p-6">
        {!detail ? (
          <div className="text-t3 text-sm text-center pt-16">请选择一个智能体</div>
        ) : (
          <div className="max-w-xl">
            <div className="flex items-center gap-3 mb-6">
              <AgentAvatar id={detail.merged.id} name={detail.merged.name} size={44} online={false} active />
              <div>
                <div className="text-xl font-bold text-t1">{detail.merged.name}</div>
                <div className="text-sm text-t3">{detail.merged.role}</div>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-semibold text-t2 mb-2">使用模型</label>
              <select
                className={cn(inputCls, 'cursor-pointer')}
                style={{ appearance: 'auto' }}
                value={selectedModelId ?? ''}
                onChange={e => { setSelectedModelId(e.target.value || null); setDirty(true); }}
              >
                <option value="">使用默认模型</option>
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.name}{m.isDefault ? ' (默认)' : ''}</option>
                ))}
              </select>
            </div>

            {!advancedMode && FIELDS.map(f => (
              <div key={f.key} className="mb-5">
                <label className="block text-sm font-semibold text-t2 mb-2">{f.label}</label>
                <input
                  className={inputCls}
                  value={form[f.key] ?? ''}
                  placeholder={(detail.defaults as any)[f.key]}
                  onChange={e => handleChange(f.key, e.target.value)}
                />
              </div>
            ))}

            {/* Advanced toggle */}
            <div
              className="flex items-center gap-2 mb-4 cursor-pointer select-none"
              onClick={() => { setAdvancedMode(!advancedMode); setDirty(true); }}
            >
              <Code2 size={14} className={advancedMode ? 'text-t1' : 'text-t3'} />
              <span className={cn('text-sm font-medium', advancedMode ? 'text-t1' : 'text-t3')}>
                高级模式：自定义 System Prompt
              </span>
              <div className={cn('w-9 h-5 rounded-full relative transition-colors duration-200', advancedMode ? 'bg-t1' : 'bg-bg-inset')}>
                <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-xs transition-transform duration-200', advancedMode ? 'translate-x-[18px]' : 'translate-x-0.5')} />
              </div>
            </div>

            {advancedMode && (
              <div className="mb-5">
                <div className="text-2xs text-t4 font-mono bg-bg-hover rounded-xl p-3 mb-3 leading-relaxed">
                  可用变量：{TEMPLATE_VARS.map(v => (
                    <span key={v.key} className="inline-block mr-2">
                      <code className="text-t1">{v.key}</code>
                      <span className="text-t4">({v.desc})</span>
                    </span>
                  ))}
                </div>
                <textarea
                  className={cn(inputCls, 'font-mono text-xs leading-relaxed resize-y')}
                  style={{ minHeight: 200 }}
                  value={form.customSystemPrompt ?? ''}
                  placeholder="输入自定义 system prompt…"
                  onChange={e => handleChange('customSystemPrompt', e.target.value)}
                />
              </div>
            )}

            <div className="flex gap-2 mb-5">
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className={cn(
                  'flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold border-none cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed',
                  dirty ? 'bg-t1 text-white hover:opacity-85' : 'bg-bg-inset text-t4',
                )}
              >
                <Save size={14} /> {saving ? '保存中…' : '保存'}
              </button>
              <button
                onClick={handleReset}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-bg-hover text-sm font-medium text-t2 border-none cursor-pointer hover:bg-bg-inset transition-colors disabled:opacity-50"
              >
                <RotateCcw size={13} /> 重置
              </button>
            </div>

            <div
              className="flex items-center gap-1.5 cursor-pointer select-none mb-2"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? <ChevronDown size={14} className="text-t3" /> : <ChevronRight size={14} className="text-t3" />}
              <Eye size={13} className="text-t3" />
              <span className="text-xs text-t3">预览 Prompt</span>
            </div>
            {showPreview && (
              <div className="p-4 bg-bg-hover rounded-xl text-xs font-mono text-t2 leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                {buildPreview()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
