import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import { T, agentHue, STAGES, THEME_LIST, type ThemeId } from './styles';
import { cn } from '../lib/utils';
import { AgentAvatar } from './AgentAvatar';
import { Modal, fieldLabel, fieldInput, fieldSelect, btnPrimary, btnSecondary } from './Modal';
import { ModelConfigModal } from './SettingsModal';
import { SettingsPolicyTab } from './SettingsPolicyTab';
import { SettingsTriggersTab } from './SettingsTriggersTab';
import { SettingsAgentsTab } from './SettingsAgentsTab';
import { SettingsToolsTab } from './SettingsToolsTab';
import { SettingsRssTab } from './SettingsRssTab';
import { SettingsAboutTab } from './SettingsAboutTab';
import { api } from '../api';
import type { NavKey, Agent, Mission, Step, Relationship, RoundtableSession, Proposal, Memory, LlmModelConfig, SettingsTab, HeartbeatStatus, OutboxItem, PublisherInfo, MaterialItem, EventItem, StageAgent } from '../types';
import {
  Brain, Link2, Clock, CheckCircle2, XCircle, Play, Loader2,
  AlertTriangle, Zap, Users, Inbox, GitBranch, FileText, Hash,
  ArrowRight, Info, Check, X, Ban, Trash2, Plus, Cpu, Star, Pencil, Shield, ChevronRight,
  Copy, Download, Archive, Send, Twitter, BookOpen, Upload, ImageIcon, Eye, Lightbulb,
  Activity, Bot,
} from 'lucide-react';
import { MilkdownEditor } from './MilkdownEditor';
import { renderMarkdown, renderThemedHtml } from '../lib/markdown';
import { THEMES } from '../lib/themes';
import { makeWeChatCompatible } from '../lib/wechatCompat';

interface Props {
  nav: NavKey;
  agents: Agent[]; activeAgentId: string; relationships: Relationship[]; memories: Memory[];
  missions: Mission[]; steps: Step[]; selectedMissionId: number | null;
  selectedProposalId: number | null;
  roundtables: RoundtableSession[]; activeRoundtableId: number | null;
  proposals: Proposal[];
  dailyStats: { date: string; missions: number; steps: number }[];
  agentStats: { agentId: string; total: number; running: number; succeeded: number; failed: number }[];
  heartbeat: HeartbeatStatus | null;
  error: string | null;
  onApproveProposal: (id: number) => void;
  onRejectProposal: (id: number) => void;
  onCancelMission: (id: number) => void;
  onRetryStep: (id: number) => void;
  onRerunMission: (title: string, description?: string) => void;
  onCreateMemory: (content: string, kind: string) => void;
  onDeleteMemory: (id: number) => void;
  onRenameAgent: (id: string, name: string) => void;
  // Settings
  settingsTab?: SettingsTab;
  llmConfigs: LlmModelConfig[];
  onAddLlmConfig: (data: any) => Promise<void>;
  onUpdateLlmConfig: (id: string, data: any) => Promise<void>;
  onDeleteLlmConfig: (id: string) => Promise<void>;
  onSetDefaultLlmConfig: (id: string) => Promise<void>;
  onAgentsChanged?: () => void;
  themeId?: ThemeId;
  onSetTheme?: (id: ThemeId) => void;
  // Materials
  materials?: MaterialItem[];
  selectedMaterialId?: number | null;
  onUpdateMaterial?: (id: number, data: any) => Promise<void>;
  onDeleteMaterial?: (id: number) => Promise<void>;
  onCreateProposalFromMaterial?: (title: string, description: string) => void;
  // Outbox
  outboxItems?: OutboxItem[];
  selectedOutboxId?: number | null;
  selectedOutboxKind?: string | null;
  onUpdateOutboxItem?: (kind: string, id: number, data: any) => Promise<void>;
  onDeleteOutboxItem?: (kind: string, id: number) => Promise<void>;
  onPublishOutboxItem?: (kind: string, id: number, publisherId: string, theme?: string, styledHtml?: string) => Promise<void>;
  publishers?: PublisherInfo[];
  onSelectMission?: (id: number | null) => void;
  // Signal Feed
  events?: EventItem[];
  // Stage
  stageData?: StageAgent[];
}

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; className?: string }> = ({ children, style, className }) => (
  <div
    className={cn('card p-6', className)}
    style={style}
  >
    {children}
  </div>
);

const SectionLabel: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="section-label">
    {icon}{text}
  </div>
);

const Empty: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="flex-1 flex flex-col items-center justify-center gap-4 text-t3 text-md p-12">
    <div className="text-t4">{icon}</div>
    <span className="text-t3">{text}</span>
  </div>
);

const StepIcon: React.FC<{ status: string }> = ({ status }) => {
  if (status === 'completed' || status === 'succeeded')
    return <CheckCircle2 size={16} strokeWidth={2} style={{ color: 'var(--color-success)' }} />;
  if (status === 'running')
    return <Loader2 size={16} strokeWidth={2} className="animate-spin" style={{ color: 'var(--color-info)' }} />;
  if (status === 'failed')
    return <XCircle size={16} strokeWidth={2} style={{ color: 'var(--color-danger)' }} />;
  if (status === 'cancelled')
    return <Ban size={16} strokeWidth={1.8} className="text-t5" />;
  return <Clock size={16} strokeWidth={1.8} className="text-t4" />;
};

// ─── Action button helper ───
const ActionBtn: React.FC<{
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick: () => void;
  variant?: 'fill' | 'outline';
  disabled?: boolean;
}> = ({ icon, label, color, onClick, disabled }) => {
  const hoverBg = `${color}14`;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.backgroundColor = hoverBg; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors duration-100',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      )}
      style={{
        borderColor: `${color}40`,
        backgroundColor: 'transparent',
        color,
        outline: 'none',
      }}
    >
      {icon}{label}
    </button>
  );
};

// ─── Theme View ───
const ThemeView: React.FC<{ themeId?: ThemeId; onSetTheme?: (id: ThemeId) => void }> = ({ themeId = 'mono', onSetTheme }) => (
  <div className="max-w-2xl mx-auto py-10 animate-fade-up">
    <h2 className="text-4xl font-bold text-t1 mb-2 tracking-tight">外观</h2>
    <p className="text-md text-t3 mb-8">选择界面配色方案，设置即时生效。</p>
    <div className="grid grid-cols-2 gap-4">
      {THEME_LIST.map(theme => {
        const isActive = themeId === theme.id;
        return (
          <button
            key={theme.id}
            onClick={() => onSetTheme?.(theme.id)}
            className={cn(
              'card p-6 text-left cursor-pointer transition-all duration-150',
              isActive
                ? 'ring-2 ring-t1'
                : 'hover:ring-1 hover:ring-border-3',
            )}
          >
            <div className="flex items-center gap-2.5 mb-4">
              {theme.swatches.map((c, i) => (
                <div
                  key={i}
                  className="rounded-lg flex-shrink-0"
                  style={{ width: i === 0 ? 36 : 24, height: i === 0 ? 36 : 24, backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-t1">{theme.name}</span>
              {isActive && (
                <span className="text-2xs font-semibold text-success bg-success-bg px-2 py-0.5 rounded-md">当前</span>
              )}
            </div>
            <p className="text-sm text-t3 mt-1">{theme.label}</p>
          </button>
        );
      })}
    </div>
  </div>
);

// ─── Add Memory Modal ───
const AddMemoryModal: React.FC<{ onSubmit: (content: string, kind: string) => void; onClose: () => void }> = ({ onSubmit, onClose }) => {
  const [content, setContent] = useState('');
  const [kind, setKind] = useState('insight');
  const [confidence, setConfidence] = useState(0.7);
  const [tagsStr, setTagsStr] = useState('');
  const kindOptions: { value: string; label: string }[] = [
    { value: 'insight', label: '洞察 insight' },
    { value: 'pattern', label: '规律 pattern' },
    { value: 'strategy', label: '策略 strategy' },
    { value: 'preference', label: '偏好 preference' },
    { value: 'lesson', label: '教训 lesson' },
  ];
  return (
    <Modal title="写入记忆" onClose={onClose} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: T.s16 }}>
        <div>
          <label style={fieldLabel}>类型</label>
          <select value={kind} onChange={e => setKind(e.target.value)} style={fieldSelect}>
            {kindOptions.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label style={fieldLabel}>内容 *</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={4} placeholder="记忆内容..." style={{ ...fieldInput, resize: 'vertical' as const, fontFamily: T.sans }}
            onFocus={e => e.currentTarget.style.borderColor = T.pri} onBlur={e => e.currentTarget.style.borderColor = T.b2} />
        </div>
        <div>
          <label style={fieldLabel}>置信度: {confidence.toFixed(2)}</label>
          <input type="range" min={0.5} max={1} step={0.05} value={confidence} onChange={e => setConfidence(+e.target.value)}
            style={{ width: '100%', accentColor: T.pri }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: T.fs11, color: T.t4, fontFamily: T.mono }}>
            <span>0.50</span><span>1.00</span>
          </div>
        </div>
        <div>
          <label style={fieldLabel}>标签（逗号分隔，可选）</label>
          <input value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="例：策略, 内容, 周报"
            style={fieldInput} onFocus={e => e.currentTarget.style.borderColor = T.pri} onBlur={e => e.currentTarget.style.borderColor = T.b2} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: T.s10 }}>
          <button onClick={onClose} style={btnSecondary}>取消</button>
          <button onClick={() => { if (content.trim()) { onSubmit(content.trim(), kind); onClose(); } }} disabled={!content.trim()} style={{ ...btnPrimary, opacity: content.trim() ? 1 : 0.5 }}>保存</button>
        </div>
      </div>
    </Modal>
  );
};

// ─── Agent detail view ───
const KIND_LABELS: Record<string, string> = {
  insight: '洞察', pattern: '规律', strategy: '策略', preference: '偏好', lesson: '教训',
};
const KIND_TINTS: Record<string, { bg: string; fg: string }> = {
  insight:    { bg: '#F3F0FF', fg: '#6E56CF' },
  pattern:    { bg: '#EDF2FF', fg: '#3B82F6' },
  strategy:   { bg: '#ECFDF5', fg: '#059669' },
  preference: { bg: '#FFF7ED', fg: '#D97706' },
  lesson:     { bg: '#FFF1F2', fg: '#E11D48' },
};
const ALL_KINDS = ['insight', 'pattern', 'strategy', 'preference', 'lesson'] as const;

const AgentView: React.FC<{ agents: Agent[]; activeId: string; rels: Relationship[]; memories: Memory[]; onCreateMemory: (c: string, k: string) => void; onDeleteMemory: (id: number) => void; onRenameAgent: (id: string, name: string) => void }> = ({ agents, activeId, rels, memories, onCreateMemory, onDeleteMemory, onRenameAgent }) => {
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const filteredMemories = kindFilter ? memories.filter(m => m.kind === kindFilter) : memories;
  const kindCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of memories) c[m.kind] = (c[m.kind] || 0) + 1;
    return c;
  }, [memories]);
  const agent = agents.find(a => a.id === activeId);
  if (!agent) return <Empty icon={<Inbox size={32} strokeWidth={1.5} />} text="选择一个智能体" />;
  const agentRels = rels.filter(r => r.agentA === activeId || r.agentB === activeId);

  return (
    <div className="flex flex-col gap-5 animate-fade-up max-w-3xl">
      {/* ─── Profile header ─── */}
      <div className="flex items-start gap-5">
        <AgentAvatar id={agent.id} name={agent.name} size={72} online active />
        <div className="flex-1 min-w-0 pt-1">
          <div className="flex items-center gap-2 mb-1">
            {editing ? (
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && editName.trim()) { onRenameAgent(agent.id, editName.trim()); setEditing(false); }
                  if (e.key === 'Escape') setEditing(false);
                }}
                onBlur={() => { if (editName.trim()) onRenameAgent(agent.id, editName.trim()); setEditing(false); }}
                className="text-3xl font-bold text-t1 bg-bg-hover border-none rounded-lg px-2 py-0.5 outline-none w-full max-w-[260px] focus:ring-2 focus:ring-[var(--color-primary-muted)]"
              />
            ) : (
              <>
                <h2 className="text-3xl font-bold text-t1 tracking-tight">{agent.name}</h2>
                  <button
                    onClick={() => { setEditName(agent.name); setEditing(true); }}
                    className="p-1 bg-transparent border-none cursor-pointer text-t3 hover:text-t1 transition-colors"
                    title="重命名"
                  >
                    <Pencil size={14} strokeWidth={1.8} />
                  </button>
              </>
            )}
          </div>
          <div className="text-md text-t3 mb-2">{agent.role}</div>
          {agent.style && (
            <p className="text-sm text-t3 leading-relaxed">{agent.style}</p>
          )}
          <div className="flex items-center gap-4 mt-3 text-sm text-t3">
            <span className="font-mono"><span className="font-semibold text-t1">{memories.length}</span> 记忆</span>
            <span className="text-t5">·</span>
            <span className="font-mono"><span className="font-semibold text-t1">{agentRels.length}</span> 关系</span>
          </div>
        </div>
      </div>

      {/* ─── Relationships ─── */}
      {agentRels.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-t1 mb-4">关系网络</h3>
          <div className="space-y-0.5">
            {agentRels
              .slice()
              .sort((a, b) => ((typeof b.score === 'number' ? b.score : 0) - (typeof a.score === 'number' ? a.score : 0)))
              .map(r => {
                const otherId = r.agentA === activeId ? r.agentB : r.agentA;
                const other = agents.find(a => a.id === otherId);
                const score = typeof r.score === 'number' ? r.score : 0;
                const scoreColor = score >= 0.7 ? 'text-t1' : score >= 0.4 ? 'text-t3' : 'text-t4';
                return (
                  <div key={r.id} className="flex items-center gap-3 py-2.5 px-1">
                    <AgentAvatar id={otherId} name={other?.name || otherId} size={28} />
                    <span className="flex-1 text-sm text-t2 truncate min-w-0">{other?.name || otherId}</span>
                    <span className={cn('text-xl font-bold font-mono flex-shrink-0 w-12 text-right tabular-nums', scoreColor)}>
                      {score.toFixed(2)}
                    </span>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* ─── Memories ─── */}
      <Card className="flex-1 flex flex-col min-h-0 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-t1">记忆</h3>
          <button
            onClick={() => setShowAddMemory(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-hover text-t3 text-sm font-medium border-none cursor-pointer hover:bg-bg-inset transition-colors"
          >
            <Plus size={14} strokeWidth={2} /> 写入
          </button>
        </div>

        {/* Kind filter tabs */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          <button
            onClick={() => setKindFilter(null)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium border-none cursor-pointer transition-colors duration-100',
              !kindFilter ? 'bg-bg-inset text-t1 font-semibold' : 'bg-transparent text-t3 hover:bg-bg-hover',
            )}
          >
            全部 {memories.length}
          </button>
          {ALL_KINDS.map(k => {
            const cnt = kindCounts[k] || 0;
            if (cnt === 0) return null;
            const tint = KIND_TINTS[k];
            const isActive = kindFilter === k;
            return (
              <button
                key={k}
                onClick={() => setKindFilter(isActive ? null : k)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border-none cursor-pointer transition-colors duration-100"
                style={{
                  backgroundColor: isActive ? tint.bg : 'transparent',
                  color: isActive ? tint.fg : 'var(--color-t4)',
                }}
              >
                {KIND_LABELS[k]} {cnt}
              </button>
            );
          })}
        </div>

        {/* Memory list */}
        <div className="flex-1 overflow-y-auto space-y-2.5">
          {filteredMemories.map((m) => {
            const tint = KIND_TINTS[m.kind] || { bg: '#F5F5F5', fg: '#888' };
            return (
              <div key={m.id} className="p-4 rounded-xl bg-bg-hover group">
                <div className="flex items-center gap-2 mb-2.5">
                  <span
                    className="px-2 py-[3px] rounded-md text-[10px] font-semibold leading-none"
                    style={{ backgroundColor: tint.bg, color: tint.fg }}
                  >
                    {KIND_LABELS[m.kind] || m.kind}
                  </span>
                  <span className="text-2xs text-t4 font-mono ml-auto">{m.confidence.toFixed(2)}</span>
                  <button
                    onClick={() => onDeleteMemory(m.id)}
                    className="w-6 h-6 rounded-md bg-transparent border-none cursor-pointer text-transparent group-hover:text-t4 hover:!text-danger flex items-center justify-center transition-colors flex-shrink-0"
                  >
                    <Trash2 size={12} strokeWidth={1.8} />
                  </button>
                </div>
                <div className="text-sm text-t2 leading-relaxed">{m.content}</div>
                {m.tags && m.tags.length > 0 && (
                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    {m.tags.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-md bg-bg-inset text-2xs text-t3">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {filteredMemories.length === 0 && (
            <div className="text-t4 text-sm text-center py-12">
              {kindFilter ? '该类别暂无记忆' : '暂无记忆'}
            </div>
          )}
        </div>
      </Card>

      {showAddMemory && <AddMemoryModal onSubmit={onCreateMemory} onClose={() => setShowAddMemory(false)} />}
    </div>
  );
};

// ─── Step result renderer ───
// Field key → Chinese label
const FIELD_LABELS: Record<string, string> = {
  title: '标题', content: '正文', article: '文章', text: '内容',
  summary: '摘要', analysis: '分析', output: '输出', tweet: '推文',
  sources: '参考来源', keywords: '关键词', tags: '标签', outline: '大纲',
  recommendation: '建议', conclusion: '结论', findings: '发现',
};

// Markdown CSS — injected once at module load
const MD_CSS = `
.md-content{font-family:${T.sans};font-size:13px;color:${T.t1};line-height:1.8;word-break:break-word}
.md-content h1,.md-content h2,.md-content h3{font-weight:600;color:${T.t1};margin:12px 0 6px;line-height:1.4}
.md-content h1{font-size:16px}.md-content h2{font-size:14px}.md-content h3{font-size:13px}
.md-content p{margin:0 0 8px}
.md-content strong{font-weight:600;color:${T.t1}}
.md-content em{font-style:italic}
.md-content ul,.md-content ol{margin:4px 0 8px 20px;padding:0}
.md-content li{margin:2px 0}
.md-content blockquote{margin:8px 0;padding:6px 12px;border-left:3px solid ${T.b2};color:${T.t2};background:${T.bg0};border-radius:0 ${T.r4}px ${T.r4}px 0}
.md-content code{font-family:${T.mono};font-size:12px;padding:1px 5px;background:${T.bg0};border-radius:3px;color:${T.t2}}
.md-content pre{background:${T.bg0};padding:10px;border-radius:${T.r6}px;overflow-x:auto;margin:6px 0}
.md-content pre code{padding:0;background:none}
.md-content hr{border:none;border-top:1px solid ${T.b1};margin:10px 0}
.md-content a{color:${T.pri};text-decoration:none}
.md-content img{max-width:100%;border-radius:${T.r6}px}
`;
// Inject once into <head>
if (typeof document !== 'undefined') {
  const s = document.createElement('style');
  s.textContent = MD_CSS;
  document.head.appendChild(s);
}

const MarkdownBlock: React.FC<{ text: string }> = React.memo(({ text }) => {
  const html = useMemo(() => {
    try { return marked.parse(text, { async: false }) as string; }
    catch { return text; }
  }, [text]);
  return <div className="md-content" dangerouslySetInnerHTML={{ __html: html }} />;
});

const TOOL_NAME_LABELS: Record<string, string> = {
  web_search: '网页搜索',
  url_fetch: '网页抓取',
};

const ToolCallsDisplay: React.FC<{ toolCalls: any[] }> = ({ toolCalls }) => {
  const [expandedIdx, setExpandedIdx] = React.useState<number | null>(null);
  if (!toolCalls?.length) return null;
  return (
    <div style={{ marginTop: T.s12 }}>
      <div style={{ fontSize: T.fs11, fontWeight: T.w6, color: T.t3, fontFamily: T.sans, marginBottom: T.s8, display: 'flex', alignItems: 'center', gap: T.s4 }}>
        <Link2 size={12} strokeWidth={2} />
        工具调用记录（{toolCalls.length}）
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: T.s6 }}>
        {toolCalls.map((tc, i) => {
          const isSearch = tc.toolName === 'web_search';
          const isFetch = tc.toolName === 'url_fetch';
          const isExpanded = expandedIdx === i;
          const label = TOOL_NAME_LABELS[tc.toolName] || tc.toolName;

          // 提取搜索结果中的 URL 列表
          const searchResults: { title: string; url: string; snippet: string }[] =
            isSearch && tc.result?.results ? tc.result.results : [];
          const fetchUrl = isFetch ? (tc.input?.url || '') : '';
          const fetchTitle = isFetch ? (tc.result?.title || fetchUrl) : '';

          return (
            <div key={i} style={{
              border: `1px solid ${T.b1}`, borderRadius: T.r6,
              backgroundColor: T.bg0, overflow: 'hidden',
            }}>
              <div
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
                style={{
                  padding: `${T.s8}px ${T.s10}px`, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: T.s8,
                  transition: 'background-color 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.bg2; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <span style={{
                  fontSize: T.fs11, fontWeight: T.w6, fontFamily: T.mono,
                  padding: '1px 6px', borderRadius: T.r4,
                  backgroundColor: isSearch ? '#DBEAFE' : '#D1FAE5',
                  color: isSearch ? '#1D4ED8' : '#065F46',
                }}>{label}</span>
                <span style={{ flex: 1, fontSize: T.fs12, color: T.t2, fontFamily: T.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {isSearch ? `"${tc.input?.query || ''}"` : ''}
                  {isFetch ? fetchTitle : ''}
                  {isSearch && searchResults.length > 0 ? ` → ${searchResults.length} 条结果` : ''}
                  {tc.result?.fallback ? ' (降级)' : ''}
                </span>
                <ChevronRight size={14} strokeWidth={2} color={T.t4} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
              </div>

              {isExpanded && (
                <div style={{ padding: `0 ${T.s10}px ${T.s10}px`, borderTop: `1px solid ${T.b1}` }}>
                  {isSearch && searchResults.map((sr, j) => (
                    <div key={j} style={{ padding: `${T.s6}px 0`, borderBottom: j < searchResults.length - 1 ? `1px solid ${T.b1}` : 'none' }}>
                      <a
                        href={sr.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: T.fs13, fontWeight: T.w6, color: T.pri, fontFamily: T.sans, textDecoration: 'none', lineHeight: 1.4 }}
                        onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
                        onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                      >{sr.title || sr.url}</a>
                      <div style={{ fontSize: T.fs11, color: T.t3, fontFamily: T.mono, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sr.url}</div>
                      {sr.snippet && (
                        <div style={{ fontSize: T.fs12, color: T.t2, fontFamily: T.sans, marginTop: 3, lineHeight: 1.5 }}>{sr.snippet.slice(0, 200)}{sr.snippet.length > 200 ? '...' : ''}</div>
                      )}
                    </div>
                  ))}
                  {isFetch && (
                    <div style={{ paddingTop: T.s6 }}>
                      <a href={fetchUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: T.fs13, color: T.pri, fontFamily: T.sans, textDecoration: 'none' }}
                        onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
                        onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                      >{fetchUrl}</a>
                      {tc.result?.content && (
                        <div style={{ fontSize: T.fs12, color: T.t2, fontFamily: T.sans, marginTop: T.s6, lineHeight: 1.5, maxHeight: 200, overflow: 'auto', padding: T.s8, backgroundColor: T.bg1, borderRadius: T.r4 }}>
                          {tc.result.content.slice(0, 500)}{tc.result.content.length > 500 ? '...' : ''}
                        </div>
                      )}
                    </div>
                  )}
                  {!isSearch && !isFetch && (
                    <pre style={{ fontSize: T.fs11, color: T.t2, fontFamily: T.mono, lineHeight: 1.4, margin: 0, paddingTop: T.s6, overflow: 'auto', maxHeight: 200 }}>
                      {JSON.stringify(tc.result, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StepResultDisplay: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
  const toolCalls = result._toolCalls as any[] | undefined;
  const entries = Object.entries(result).filter(([k, v]) => v != null && v !== '' && k !== '_toolCalls');
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: T.s12 }}>
        {entries.map(([key, val]) => (
          <div key={key}>
            <div style={{ fontSize: T.fs11, fontWeight: T.w6, color: T.t3, fontFamily: T.sans, marginBottom: T.s4 }}>
              {FIELD_LABELS[key.toLowerCase()] || key}
            </div>
            {typeof val === 'string' ? (
              <MarkdownBlock text={val} />
            ) : Array.isArray(val) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: T.s4 }}>
                {val.map((item, i) => (
                  <div key={i} style={{ fontSize: T.fs13, color: T.t2, fontFamily: T.sans, lineHeight: 1.6, padding: `${T.s4}px ${T.s10}px`, backgroundColor: T.bg0, borderRadius: T.r6 }}>
                    {typeof item === 'string' ? item : JSON.stringify(item, null, 2)}
                  </div>
                ))}
              </div>
            ) : val && typeof val === 'object' ? (
              <pre style={{ fontSize: T.fs12, color: T.t2, fontFamily: T.mono, lineHeight: 1.5, padding: T.s10, backgroundColor: T.bg0, borderRadius: T.r6, overflow: 'auto', margin: 0 }}>{JSON.stringify(val, null, 2)}</pre>
            ) : (
              <div style={{ fontSize: T.fs13, color: T.t2, fontFamily: T.sans }}>{String(val)}</div>
            )}
          </div>
        ))}
      </div>
      {toolCalls && toolCalls.length > 0 && <ToolCallsDisplay toolCalls={toolCalls} />}
    </>
  );
};

// ─── Pipeline view ───
// ─── Step kind → human-readable labels ───
const STEP_ACTION_LABELS: Record<string, string> = {
  analyze: '分析数据', crawl: '扫描资料', write_article: '撰写文章',
  draft_social: '生成社交内容', roundtable: '团队会议',
};

const KIND_TO_AGENT: Record<string, string> = {
  analyze: 'sage', crawl: 'scout', write_article: 'quill',
  draft_social: 'xalt', roundtable: 'minion',
};

/** draft_social 的 agent 由 step.payload.platform 决定子智能体 */
function resolveStepAgentId(step: Step): string {
  if (step.kind === 'draft_social') {
    const platform = (step.payload as Record<string, unknown>)?.platform as string | undefined;
    return platform ? `xalt_${platform}` : 'xalt';
  }
  return KIND_TO_AGENT[step.kind] || 'minion';
}

function makeAgentLookup(agents: Agent[]): (id: string) => string {
  const map = new Map(agents.map(a => [a.id, a.name]));
  map.set('boss', 'Boss');
  return (id: string) => map.get(id) || id;
}

function makeStepKindLabels(agentName: (id: string) => string) {
  const result: Record<string, { label: string; agent: string; running: string }> = {};
  for (const [kind, label] of Object.entries(STEP_ACTION_LABELS)) {
    const agent = agentName(KIND_TO_AGENT[kind] || '');
    result[kind] = { label, agent, running: `${agent} 正在${label}...` };
  }
  return result;
}

function stepLabel(kindLabels: Record<string, { label: string; running: string }>, kind: string, status: string): string {
  const info = kindLabels[kind];
  if (!info) return kind;
  if (status === 'running') return info.running;
  return info.label;
}

// ─── Step sort: running > queued > pending > succeeded > failed > cancelled ───
const STEP_STATUS_ORDER: Record<string, number> = {
  running: 0, queued: 1, pending: 2, succeeded: 3, failed: 4, cancelled: 5,
};

function sortSteps(a: Step, b: Step): number {
  return a.id - b.id;
}

// ─── Error message humanizer ───
function humanizeError(error: string | null | undefined): string {
  if (!error) return '未知错误';
  const e = error.toLowerCase();
  // 取消相关
  if (e.includes('cancelled') || e.includes('取消')) return '任务被手动取消，步骤未执行';
  if (e.includes('前序步骤失败') || e.includes('自动取消')) return '前置步骤失败，此步骤未能执行';
  // 网络/超时
  if (e.includes('timeout') || e.includes('超时') || e.includes('etimedout')) return 'AI 调用超时，请稍后重试';
  if (e.includes('econnrefused') || e.includes('econnreset') || e.includes('network')) return '网络连接失败，请检查网络';
  // API Key
  if (e.includes('401') || e.includes('unauthorized') || e.includes('invalid api key') || e.includes('authentication')) return 'API Key 无效或已过期，请在设置中检查';
  if (e.includes('403') || e.includes('forbidden') || e.includes('insufficient_quota')) return 'API 额度不足或权限不够';
  // 限流
  if (e.includes('429') || e.includes('rate limit') || e.includes('too many requests')) return 'AI 接口限流，请稍后重试';
  // 模型错误
  if (e.includes('500') || e.includes('internal server error') || e.includes('bad gateway') || e.includes('502') || e.includes('503')) return 'AI 服务暂时不可用，请稍后重试';
  if (e.includes('context_length') || e.includes('max tokens') || e.includes('too long')) return '输入内容过长，超出模型限制';
  // 如果已经是中文，直接返回
  if (/[\u4e00-\u9fff]/.test(error)) return error;
  // 兜底：包装技术信息
  return `执行出错：${error}`;
}

const PipelineView: React.FC<{
  missions: Mission[]; steps: Step[]; selectedId: number | null;
  proposals: Proposal[]; selectedProposalId: number | null;
  dailyStats: { date: string; missions: number; steps: number }[];
  agentStats: { agentId: string; total: number; running: number; succeeded: number; failed: number }[];
  agents: Agent[];
  heartbeat: HeartbeatStatus | null;
  onApprove: (id: number) => void; onReject: (id: number) => void; onCancel: (id: number) => void;
  onRetryStep: (id: number) => void;
  onRerun: (title: string, description?: string) => void;
}> = ({ missions, steps, selectedId, proposals, selectedProposalId, dailyStats, agentStats, agents, heartbeat, onApprove, onReject, onCancel, onRetryStep, onRerun }) => {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'log' | 'detail'>('log');
  const [filters, setFilters] = useState<Set<string>>(new Set(['status', 'step']));
  const [actingProposalId, setActingProposalId] = useState<number | null>(null);
  const mission = missions.find(m => m.id === selectedId);

  const agentDisplayName = useMemo(() => makeAgentLookup(agents), [agents]);
  const STEP_KIND_LABELS = useMemo(() => makeStepKindLabels(agentDisplayName), [agentDisplayName]);
  const pending = proposals.filter(p => p.status === 'pending');

  const pendingBlock = pending.length > 0 ? (
    <>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-warning-bg flex items-center justify-center flex-shrink-0">
          <Clock size={16} strokeWidth={2} style={{ color: 'var(--color-warning)' }} />
        </div>
        <span className="text-2xl font-bold text-t1 tracking-tight">待审批提案</span>
        <span className="px-2.5 py-0.5 rounded-lg bg-warning-bg text-warning text-sm font-semibold font-mono">{pending.length}</span>
      </div>
      <div className="space-y-3">
        {pending.map(p => {
          const plan = p.proposedSteps as any;
          const planSteps: any[] = plan?.steps || (Array.isArray(plan) ? plan : []);
          const confidence: number | undefined = plan?.confidence;
          return (
            <Card key={p.id} className="p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="text-md font-semibold text-t1">{p.title}</div>
                  <div className="text-xs text-t3 mt-1">
                    {agentDisplayName(p.agentId)} · {p.source} · {new Date(p.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                <span className="text-xs text-t4 font-mono flex-shrink-0">#{p.id}</span>
              </div>
              {p.description && (
                <p className="text-sm text-t2 leading-relaxed mb-3 line-clamp-2">{p.description}</p>
              )}
              {confidence !== undefined && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-t3">置信度</span>
                  <div className="w-20 h-1.5 rounded-full bg-bg-inset overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(confidence * 100).toFixed(0)}%`,
                        backgroundColor: confidence >= 0.8 ? 'var(--color-success)' : 'var(--color-warning)',
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono font-semibold" style={{ color: confidence >= 0.8 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                    {(confidence * 100).toFixed(0)}%
                  </span>
                  <span className="text-2xs text-t4 ml-1">{planSteps.length} 步</span>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setActingProposalId(p.id);
                    try {
                      await (onApprove(p.id) as Promise<unknown>);
                    } finally {
                      setActingProposalId(null);
                    }
                  }}
                  disabled={actingProposalId != null}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border-none cursor-pointer text-white hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  style={{ backgroundColor: 'var(--color-success)' }}
                >
                  <Check size={14} strokeWidth={2.5} />
                  {actingProposalId === p.id ? '处理中…' : '审批'}
                </button>
                <button
                  onClick={async () => {
                    setActingProposalId(p.id);
                    try {
                      await (onReject(p.id) as Promise<unknown>);
                    } finally {
                      setActingProposalId(null);
                    }
                  }}
                  disabled={actingProposalId != null}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border-none cursor-pointer bg-bg-hover text-t2 hover:bg-bg-inset disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <X size={14} strokeWidth={2} />
                  拒绝
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  ) : null;

  // Dedicated proposal approval view
  const selectedProposal = selectedProposalId != null ? proposals.find(p => p.id === selectedProposalId) : null;
  if (selectedProposal && !mission) {
    const sp = selectedProposal;
    const plan = sp.proposedSteps as any;
    const planSteps: any[] = plan?.steps || (Array.isArray(plan) ? plan : []);
    const confidence: number | undefined = plan?.confidence;
    const method: string | undefined = plan?.method;
    const isPending = sp.status === 'pending';
    const isRejected = sp.status === 'rejected';

    return (
      <div className="max-w-2xl animate-fade-up space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            isPending ? 'bg-warning-bg' : isRejected ? 'bg-danger-bg' : 'bg-success-bg',
          )}>
            <Clock size={16} strokeWidth={2} style={{ color: isPending ? 'var(--color-warning)' : isRejected ? 'var(--color-danger)' : 'var(--color-success)' }} />
          </div>
          <h2 className="text-2xl font-bold text-t1 tracking-tight">
            {isPending ? '待审批提案' : isRejected ? '已拒绝提案' : '已通过提案'}
          </h2>
        </div>

        {/* Proposal card */}
        <Card className="p-0">
          {/* Title + meta */}
          <div className="px-7 pt-7 pb-5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <h3 className={cn(
                'text-2xl font-semibold tracking-tight leading-snug',
                isRejected ? 'text-t3' : 'text-t1',
              )}>
                {sp.title}
              </h3>
              <span className="text-xs text-t4 font-mono flex-shrink-0 mt-1.5">#{sp.id}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-t3 flex-wrap">
              <span>{agentDisplayName(sp.agentId)}</span>
              <span className="text-t5">·</span>
              <span>{sp.source}</span>
              <span className="text-t5">·</span>
              <span>{new Date(sp.createdAt).toLocaleString('zh-CN')}</span>
              {sp.materialId && (
                <span className="px-2 py-0.5 rounded-md text-xs font-mono border border-border-1 text-t2">
                  素材 #{sp.materialId}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {sp.description && (
            <div className="px-7 pb-5">
              <p className="text-md text-t2 leading-relaxed">{sp.description}</p>
            </div>
          )}

          {/* Confidence + plan steps */}
          {planSteps.length > 0 && (
            <div className="px-7 pb-5">
              {/* Confidence bar */}
              {confidence !== undefined && (
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm font-medium text-t2">置信度</span>
                    <div className="flex-1 h-2 rounded-full bg-bg-inset overflow-hidden max-w-[160px]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(confidence * 100).toFixed(0)}%`,
                          backgroundColor: confidence >= 0.8 ? 'var(--color-success)' : 'var(--color-warning)',
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold font-mono" style={{ color: confidence >= 0.8 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                      {(confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  {method && (
                    <span className="text-xs text-t3 bg-bg-hover px-2.5 py-1 rounded-lg">{method === 'rule' ? '规则匹配' : 'LLM 规划'}</span>
                  )}
                </div>
              )}

              {/* Step cards */}
              <div className="space-y-2">
                {planSteps.map((s: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-bg-hover">
                    <span className="w-6 h-6 rounded-md bg-bg-inset text-t3 text-xs font-mono font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-t1">
                        {s.agent ? `${agentDisplayName(s.agent)} · ${STEP_KIND_LABELS[s.kind]?.label || s.kind}` : (STEP_KIND_LABELS[s.kind]?.label || s.kind)}
                      </span>
                      {s.reason && (
                        <p className="text-xs text-t3 mt-1 leading-relaxed">{s.reason}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className="px-7 py-5 border-t border-border-2">
            {isPending ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    setActingProposalId(sp.id);
                    try {
                      await (onApprove(sp.id) as Promise<unknown>);
                    } finally {
                      setActingProposalId(null);
                    }
                  }}
                  disabled={actingProposalId != null}
                  className={cn(
                    'flex items-center gap-2 px-6 py-2.5 rounded-xl text-md font-semibold transition-opacity duration-100 border-none cursor-pointer text-white',
                    'hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                  style={{ backgroundColor: 'var(--color-success)' }}
                >
                  <Check size={16} strokeWidth={2.5} />
                  {actingProposalId === sp.id ? '处理中…' : '审批通过'}
                </button>
                <button
                  onClick={async () => {
                    setActingProposalId(sp.id);
                    try {
                      await (onReject(sp.id) as Promise<unknown>);
                    } finally {
                      setActingProposalId(null);
                    }
                  }}
                  disabled={actingProposalId != null}
                  className={cn(
                    'flex items-center gap-2 px-6 py-2.5 rounded-xl text-md font-medium transition-colors duration-100 border-none cursor-pointer',
                    'bg-bg-hover text-t2 hover:bg-bg-inset disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  <X size={16} strokeWidth={2} />
                  拒绝
                </button>
              </div>
            ) : (
              <div className="px-4 py-3 rounded-xl bg-bg-hover text-sm text-t2">
                {sp.status === 'accepted' ? '该提案已通过' : '该提案已被拒绝'}
                {isRejected && sp.rejectReason && (
                  <div className="mt-1 text-xs text-t3">原因：{sp.rejectReason}</div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  if (!mission) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: T.s20, animation: 'fadeUp 0.25s ease both' }}>
        {/* Pipeline overview */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: T.s10 }}>
            <GitBranch size={20} strokeWidth={2} color={T.t1} />
            <span style={{ fontSize: '18px', fontWeight: T.w7, color: T.t1, fontFamily: T.sans }}>任务总览</span>
          </div>
          {heartbeat && (() => {
            const ok = heartbeat.lastResult === 'ok';
            const partial = heartbeat.lastResult === 'partial';
            const color = ok ? T.green : partial ? T.amber : T.red;
            const label = ok ? '正常' : partial ? '部分异常' : '异常';
            const subsKeys = Object.keys(heartbeat.subsystems || {});
            const failedSubs = subsKeys.filter(k => !heartbeat.subsystems[k].ok);
            const timeStr = heartbeat.lastRunAt
              ? (() => {
                  const diff = Date.now() - new Date(heartbeat.lastRunAt).getTime();
                  if (diff < 60_000) return '刚刚';
                  if (diff < 3600_000) return `${Math.round(diff / 60_000)}分钟前`;
                  return `${Math.round(diff / 3600_000)}小时前`;
                })()
              : '从未';
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: T.s8, fontSize: T.fs11, fontFamily: T.sans, color: T.t3 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, boxShadow: `0 0 4px ${color}` }} />
                <span>心跳 <span style={{ color, fontWeight: T.w6 }}>{label}</span></span>
                <span style={{ color: T.t4 }}>· {timeStr}</span>
                {failedSubs.length > 0 && (
                  <span style={{ color: T.red, fontSize: T.fs11 }}>
                    ({failedSubs.join(', ')} 失败)
                  </span>
                )}
              </div>
            );
          })()}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: T.s12 }}>
          {(() => {
            const needsAction = missions.filter(m => m.status === 'failed' || m.status === 'pending').length;
            const runningCount = missions.filter(m => m.status === 'running' || m.status === 'approved').length;
            const doneCount = missions.filter(m => m.status === 'succeeded').length;
            const cards = [
              { icon: <AlertTriangle size={14} strokeWidth={2} />, label: '待处理', count: needsAction, color: T.amber, colorDeep: T.amberDeep, bg: T.amberLight, sub: needsAction === 0 ? '一切正常' : '需要关注' },
              { icon: <Play size={14} strokeWidth={2} />, label: '执行中', count: runningCount, color: T.blue, colorDeep: T.blueDeep, bg: T.blueLight, sub: runningCount === 0 ? '团队空闲' : '进行中' },
              { icon: <CheckCircle2 size={14} strokeWidth={2} />, label: '已完成', count: doneCount, color: T.green, colorDeep: T.greenDeep, bg: T.greenLight, sub: '今日' },
            ];
            return cards.map(c => (
              <Card key={c.label} style={{ padding: `${T.s14}px ${T.s16}px` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: T.s6, marginBottom: T.s8 }}>
                  <span style={{ color: c.colorDeep }}>{c.icon}</span>
                  <span style={{ fontSize: T.fs12, fontWeight: T.w6, color: c.colorDeep, fontFamily: T.sans }}>{c.label}</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: T.w7, color: T.t1, fontFamily: T.mono, lineHeight: 1 }}>{c.count}</div>
                <div style={{ fontSize: T.fs11, color: T.t3, fontFamily: T.sans, marginTop: T.s4 }}>{c.sub}</div>
              </Card>
            ));
          })()}
        </div>
        {/* Monthly Calendar Heatmap */}
        {(() => {
          const now = new Date();
          const year = now.getFullYear();
          const month = now.getMonth(); // 0-indexed
          const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
          const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

          // Build date→count map from dailyStats
          const countMap: Record<string, number> = {};
          let maxVal = 0;
          for (const d of dailyStats) {
            const total = d.missions + d.steps;
            countMap[d.date] = total;
            if (total > maxVal) maxVal = total;
          }

          // Build calendar grid
          const firstDay = new Date(year, month, 1);
          const lastDay = new Date(year, month + 1, 0);
          const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
          const totalDays = lastDay.getDate();
          const today = now.getDate();

          const weeks: (number | null)[][] = [];
          let week: (number | null)[] = Array(startDow).fill(null);
          for (let d = 1; d <= totalDays; d++) {
            week.push(d);
            if (week.length === 7) { weeks.push(week); week = []; }
          }
          if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }

          const cellColor = (v: number): string => {
            if (v === 0) return T.bg2;
            const ratio = maxVal > 0 ? v / maxVal : 0;
            if (ratio <= 0.25) return '#E8F5E9';
            if (ratio <= 0.5) return '#C8E6C9';
            if (ratio <= 0.75) return '#FFE0B2';
            return '#FFAB91';
          };

          const cellSize = 36;
          const gap = 3;

          return (
            <Card>
              <SectionLabel icon={<Zap size={14} strokeWidth={2} />} text={`${year}年${monthNames[month]} 任务日历`} />
              <div>
                {/* Weekday headers */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${cellSize}px)`, gap, marginBottom: gap }}>
                  {WEEKDAYS.map(w => (
                    <div key={w} style={{ height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: T.t4, fontFamily: T.sans, fontWeight: T.w6 }}>{w}</div>
                  ))}
                </div>
                {/* Weeks */}
                {weeks.map((wk, wi) => (
                  <div key={wi} style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${cellSize}px)`, gap, marginBottom: gap }}>
                    {wk.map((day, di) => {
                      if (day == null) return <div key={di} />;
                      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const v = countMap[dateStr] || 0;
                      const isToday = day === today;
                      return (
                        <div key={di} title={`${dateStr} — ${v} 条活动`} style={{
                          width: cellSize, height: cellSize, borderRadius: 6,
                          backgroundColor: cellColor(v),
                          border: isToday ? `2px solid ${T.pri}` : '2px solid transparent',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          cursor: 'default',
                        }}>
                          <span style={{ fontSize: '11px', fontFamily: T.mono, fontWeight: isToday ? T.w7 : T.w5, color: isToday ? T.pri : T.t2, lineHeight: 1 }}>{day}</span>
                          {v > 0 && <span style={{ fontSize: '9px', fontFamily: T.mono, color: T.t4, lineHeight: 1, marginTop: 1 }}>{v}</span>}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {/* Legend */}
                <div style={{ display: 'flex', alignItems: 'center', gap: T.s12, marginTop: T.s10 }}>
                  {[
                    { label: '无', color: T.bg2 },
                    { label: '低', color: '#E8F5E9' },
                    { label: '中', color: '#C8E6C9' },
                    { label: '高', color: '#FFE0B2' },
                    { label: '极高', color: '#FFAB91' },
                  ].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: l.color }} />
                      <span style={{ fontSize: '10px', color: T.t4, fontFamily: T.sans }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          );
        })()}

        {/* Agent Workload — Donut Pie Chart */}
        {agentStats.length > 0 && (() => {
          const withTasks = agentStats.filter(s => s.total > 0);
          if (withTasks.length === 0) return null;
          const grandTotal = withTasks.reduce((s, a) => s + a.total, 0);
          const sorted = [...withTasks].sort((a, b) => b.total - a.total);

          // SVG donut constants
          const R = 48, CX = 64, CY = 64, SW = 18;
          const C = 2 * Math.PI * R;
          let cumDash = 0;
          const segments = sorted.map(stat => {
            const dash = (stat.total / grandTotal) * C;
            const seg = { ...stat, dash, offset: cumDash };
            cumDash += dash;
            return seg;
          });

          return (
            <Card>
              <SectionLabel icon={<Users size={14} strokeWidth={2} />} text="智能体任务分布" />
              <div style={{ display: 'flex', alignItems: 'center', gap: T.s24 }}>
                {/* Donut SVG */}
                <svg width={128} height={128} style={{ flexShrink: 0, overflow: 'visible' }}>
                  <circle cx={CX} cy={CY} r={R} fill="none" stroke={T.bg3} strokeWidth={SW} />
                  <g transform={`rotate(-90 ${CX} ${CY})`}>
                    {segments.map(seg => (
                      <circle
                        key={seg.agentId}
                        cx={CX} cy={CY} r={R}
                        fill="none"
                        stroke={agentHue(seg.agentId)}
                        strokeWidth={SW}
                        strokeDasharray={`${seg.dash} ${C - seg.dash}`}
                        strokeDashoffset={-seg.offset}
                        strokeLinecap="butt"
                        style={{ transition: 'stroke-dasharray 0.4s ease' }}
                      />
                    ))}
                  </g>
                  <text x={CX} y={CY - 7} textAnchor="middle"
                    fontSize={20} fontWeight={700} fill={T.t1} fontFamily={T.sans}>{grandTotal}</text>
                  <text x={CX} y={CY + 11} textAnchor="middle"
                    fontSize={10} fill={T.t3} fontFamily={T.sans}>总任务</text>
                </svg>

                {/* Legend */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: T.s8 }}>
                  {sorted.map(stat => {
                    const agent = agents.find(a => a.id === stat.agentId);
                    const name = agent?.name || agentDisplayName(stat.agentId);
                    const hue = agentHue(stat.agentId);
                    const pct = Math.round((stat.total / grandTotal) * 100);
                    return (
                      <div key={stat.agentId} style={{ display: 'flex', alignItems: 'center', gap: T.s8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: hue, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: T.fs12, color: T.t2, fontFamily: T.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        <span style={{ fontSize: T.fs11, color: T.t3, fontFamily: T.mono }}>{pct}%</span>
                        <span style={{ fontSize: T.fs12, fontWeight: T.w6, color: T.t1, fontFamily: T.mono, minWidth: 22, textAlign: 'right' }}>{stat.total}</span>
                        {stat.failed > 0 && (
                          <span style={{ fontSize: T.fs10, color: T.red, fontFamily: T.mono }}>✕{stat.failed}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        })()}
        {missions.length === 0 && pending.length === 0 && <Empty icon={<FileText size={32} strokeWidth={1.5} />} text="暂无任务 — 点击左侧 + 提案 创建" />}
      </div>
    );
  }

  // Mission detail
  const ms = steps.filter(s => s.missionId === mission.id).sort(sortSteps);
  const stage = STAGES.find(s => s.key === mission.status);
  const sc = stage?.color || T.t4;
  const canCancel = mission.status === 'approved' || mission.status === 'running';
  const isMissionFailed = mission.status === 'failed';
  const isFinished = mission.status === 'succeeded' || mission.status === 'failed';
  const linkedProposal = proposals.find(p => p.id === mission.proposalId);
  const firstFailedId = ms.find(s => s.status === 'failed')?.id ?? null;

  const createdAt = new Date(mission.createdAt);
  const updatedAt = new Date(mission.updatedAt);
  const durationMs = updatedAt.getTime() - createdAt.getTime();
  const durationMin = Math.max(1, Math.round(durationMs / 60000));

  const truncateAtPunctuation = (text: string, max: number): string => {
    if (text.length <= max) return text;
    const clean = text.replace(/^#+\s+/gm, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/^[-*]\s+/gm, '').trim();
    if (clean.length <= max) return clean;
    const slice = clean.slice(0, max);
    const lastPunc = Math.max(
      slice.lastIndexOf('。'), slice.lastIndexOf('，'), slice.lastIndexOf('；'),
      slice.lastIndexOf('！'), slice.lastIndexOf('？'), slice.lastIndexOf('、'),
      slice.lastIndexOf('. '), slice.lastIndexOf(', '), slice.lastIndexOf('! '),
    );
    if (lastPunc > max * 0.4) return clean.slice(0, lastPunc + 1) + '...';
    return slice + '...';
  };

  const resultSummary = (result: unknown): string | null => {
    if (!result || typeof result !== 'object') return null;
    const r = result as Record<string, unknown>;
    for (const key of ['summary', 'title', 'content', 'article', 'text', 'output', 'tweet', 'analysis']) {
      const v = r[key];
      if (typeof v === 'string' && v.trim()) {
        const lines = v.trim().split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('---'));
        const line = lines[0] || v.trim().split('\n')[0];
        return truncateAtPunctuation(line.replace(/^#+\s+/, '').replace(/\*\*/g, '').replace(/^[-*]\s+/, '').trim(), 80);
      }
    }
    return null;
  };

  // Flow node helpers
  const nodeColor = (status: string) => {
    if (status === 'succeeded' || status === 'completed') return { dot: T.green, line: T.green, bg: T.greenLight, deep: T.greenDeep };
    if (status === 'running') return { dot: T.blue, line: T.blue, bg: T.blueLight, deep: T.blueDeep };
    if (status === 'failed') return { dot: T.red, line: T.red, bg: T.redLight, deep: T.redDeep };
    if (status === 'cancelled') return { dot: T.t4, line: T.t5, bg: T.bg3, deep: T.t3 };
    return { dot: T.t4, line: T.b1, bg: T.bg3, deep: T.t3 };
  };

  const fmtTime = (d: string | null | undefined) => d ? new Date(d).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  const fmtDuration = (start: string | null | undefined, end: string | null | undefined) => {
    if (!start || !end) return '';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return '< 1s';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  // Build flow nodes: proposal → approval → steps → completion
  type FlowNode = { type: 'proposal' | 'approval' | 'step' | 'completion'; status: string; label: string; sub: string; time: string; duration?: string; step?: Step };
  const flowNodes: FlowNode[] = [];

  // Proposal node
  flowNodes.push({
    type: 'proposal', status: 'succeeded',
    label: '提案创建',
    sub: `${agentDisplayName(mission.createdBy)} 发起`,
    time: fmtTime(mission.createdAt),
  });

  // Approval node
  const approvalSub = linkedProposal
    ? (linkedProposal.status === 'accepted' ? '自动审批通过' : '手动审批')
    : '已通过';
  flowNodes.push({
    type: 'approval', status: 'succeeded',
    label: '审批通过', sub: approvalSub,
    time: fmtTime(mission.createdAt),
  });

  // Step nodes
  for (const s of ms) {
    const agentName = agentDisplayName(resolveStepAgentId(s));
    const stepLabel = STEP_ACTION_LABELS[s.kind] || s.kind;
    const dur = fmtDuration(s.startedAt, s.finishedAt);
    flowNodes.push({
      type: 'step', status: s.status,
      label: `${agentName} · ${stepLabel}`,
      sub: dur ? `耗时 ${dur}` : (s.status === 'running' ? '执行中...' : s.status === 'cancelled' ? '已取消' : '等待中'),
      time: fmtTime(s.startedAt || s.createdAt),
      duration: dur,
      step: s,
    });
  }

  // Completion node (only if finished)
  if (isFinished) {
    const doneCount = ms.filter(s => s.status === 'succeeded' || s.status === 'completed').length;
    flowNodes.push({
      type: 'completion',
      status: mission.status === 'succeeded' ? 'succeeded' : 'failed',
      label: mission.status === 'succeeded' ? '任务完成' : '任务失败',
      sub: `${doneCount}/${ms.length} 步骤通过 · 总耗时 ${durationMin < 60 ? `${durationMin}分钟` : `${Math.round(durationMin / 60)}小时`}`,
      time: fmtTime(mission.updatedAt),
    });
  }

  return (
    <div className="flex flex-col gap-3 pt-2 animate-fade-up">
      <Card className="flex-1 flex flex-col min-h-0 p-0 overflow-hidden">
        {/* Header */}
        <div className="px-7 pt-6 pb-4">
          <div className="flex items-start gap-3">
            <h3 className="flex-1 text-2xl font-semibold text-t1 tracking-tight leading-snug">{mission.title}</h3>
            <span
              className="inline-flex items-center px-2.5 py-[3px] rounded-lg text-xs font-semibold flex-shrink-0 mt-1"
              style={{ backgroundColor: stage?.bg || T.bg3, color: stage?.deep || sc }}
            >
              {mission.status === 'running' && (
                <span className="w-[5px] h-[5px] rounded-full mr-1.5 animate-pulse-dot" style={{ backgroundColor: stage?.deep || sc }} />
              )}
              {stage?.label || mission.status}
            </span>
            <span className="text-xs text-t4 font-mono flex-shrink-0 mt-1.5">#{mission.id}</span>
          </div>
        </div>

        {/* Tab bar + action buttons */}
        <div className="flex items-center px-7 border-b border-border-2">
          {(['log', 'detail'] as const).map(tab => {
            const labels = { log: '事件日志', detail: '详情' };
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-4 py-2.5 -mb-px text-sm font-medium border-b-2 border-none bg-transparent cursor-pointer transition-colors duration-100',
                  active
                    ? 'border-b-t1 text-t1 font-semibold'
                    : 'border-b-transparent text-t3 hover:text-t2',
                )}
                style={{ borderBottom: active ? '2px solid var(--color-t1)' : '2px solid transparent' }}
              >
                {labels[tab]}
              </button>
            );
          })}
          <div className="flex-1" />
          {canCancel && <ActionBtn icon={<Ban size={13} strokeWidth={2} />} label="取消" color="var(--color-danger)" onClick={() => onCancel(mission.id)} />}
          {isMissionFailed && <ActionBtn icon={<Play size={13} strokeWidth={2.5} />} label="重新执行" color="var(--color-info)" onClick={() => onRerun(mission.title, linkedProposal?.description || undefined)} variant="fill" />}
        </div>

        {/* ═══ Event Log Tab ═══ */}
        {activeTab === 'log' && (
          <>
            {/* Filter pills */}
            <div className="flex gap-1.5 px-7 py-3 border-b border-border-2">
              {([
                { key: 'status', label: '状态' },
                { key: 'step', label: '步骤' },
                { key: 'system', label: '系统' },
              ] as const).map(f => {
                const on = filters.has(f.key);
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilters(prev => {
                      const next = new Set(prev);
                      on ? next.delete(f.key) : next.add(f.key);
                      return next;
                    })}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors duration-100 border-none',
                      on ? 'bg-bg-inset text-t1 font-semibold' : 'bg-transparent text-t4 hover:bg-bg-hover hover:text-t3',
                    )}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {/* Event rows */}
            <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2">
              {(() => {
                const filterCategory = (n: FlowNode) => {
                  if (n.type === 'proposal' || n.type === 'approval' || n.type === 'completion') return 'status';
                  if (n.type === 'step') return 'step';
                  return 'system';
                };
                const filtered = flowNodes.filter(n => filters.has(filterCategory(n)));

                const iconFor = (n: FlowNode) => {
                  // Key milestones: colored
                  if (n.type === 'proposal') return { icon: <Hash size={14} strokeWidth={2} />, color: 'var(--color-t3)' };
                  if (n.type === 'approval') return { icon: <Check size={14} strokeWidth={2.5} />, color: 'var(--color-t3)' };
                  if (n.type === 'completion') return n.status === 'succeeded'
                    ? { icon: <CheckCircle2 size={14} strokeWidth={2} />, color: 'var(--color-success)' }
                    : { icon: <XCircle size={14} strokeWidth={2} />, color: 'var(--color-danger)' };
                  // Steps: neutral grey for success, colored only for active/error states
                  const st = n.status;
                  if (st === 'succeeded' || st === 'completed') return { icon: <CheckCircle2 size={14} strokeWidth={2} />, color: 'var(--color-t4)' };
                  if (st === 'running') return { icon: <Loader2 size={14} strokeWidth={2} className="animate-spin" />, color: 'var(--color-t1)' };
                  if (st === 'failed') return { icon: <AlertTriangle size={14} strokeWidth={2} />, color: 'var(--color-danger)' };
                  if (st === 'cancelled') return { icon: <X size={14} strokeWidth={2} />, color: 'var(--color-t5)' };
                  return { icon: <div className="w-2 h-2 rounded-full border-2 border-t4" />, color: 'var(--color-t5)' };
                };

                let lastDateStr = '';

                if (filtered.length === 0) return <div className="text-t4 text-base text-center py-10">无匹配事件</div>;

                return filtered.map((node, idx) => {
                  const isStep = node.type === 'step' && node.step;
                  const s = node.step;
                  const isFailed = node.status === 'failed';
                  const isSucceeded = node.status === 'succeeded' || node.status === 'completed';
                  const isCancelled = node.status === 'cancelled';
                  const hasResult = !!(s?.result && typeof s.result === 'object');
                  const isExpanded = isStep && expandedStep === s!.id;
                  const autoExpand = isStep && isFailed && s!.id === firstFailedId;
                  const showExpanded = autoExpand || isExpanded;
                  const clickable = isStep && (hasResult || (isFailed && !isCancelled));
                  const summary = isStep && isSucceeded ? resultSummary(s!.result) : null;
                  const errorText = s?.error as string | null | undefined;
                  const ic = iconFor(node);
                  const isLast = idx === filtered.length - 1;
                  const isRunning = node.status === 'running';
                  const durStr = isStep && s ? formatDuration(s.startedAt, s.finishedAt) : null;

                  const rawDate = s?.startedAt || s?.createdAt || mission.createdAt;
                  const d = new Date(rawDate);
                  const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
                  const showDate = dateStr !== lastDateStr;
                  if (showDate) lastDateStr = dateStr;
                  const timeDisplay = showDate ? `${dateStr} ${node.time}` : node.time;

                  return (
                    <div key={idx}
                      onClick={() => clickable && setExpandedStep(isExpanded ? null : s!.id)}
                      className={cn(
                        'flex items-start gap-3 px-3 py-3 rounded-xl transition-colors duration-100',
                        clickable ? 'cursor-pointer hover:bg-bg-hover' : 'cursor-default',
                        isCancelled && 'opacity-50',
                      )}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      {/* Time */}
                      <span className="w-16 flex-shrink-0 text-2xs text-t4 font-mono pt-0.5 text-right">
                        {timeDisplay}
                      </span>
                      {/* Icon with timeline connector */}
                      <span className="w-5 flex-shrink-0 flex flex-col items-center relative" style={{ minHeight: 28 }}>
                        <span className={cn('flex justify-center pt-px z-10', isRunning && 'animate-pulse-dot')} style={{ color: ic.color }}>
                          {ic.icon}
                        </span>
                        {!isLast && (
                          <span className="absolute top-5 bottom-0 w-px" style={{ backgroundColor: 'var(--color-border-2)', left: '50%', transform: 'translateX(-50%)' }} />
                        )}
                      </span>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className={cn(
                            'text-base font-medium',
                            isFailed ? 'text-danger' : isCancelled ? 'text-t4' : 'text-t1',
                          )}>
                            {node.label}
                          </span>
                          {node.duration && (
                            <span className="text-xs text-t4 font-mono">{node.duration}</span>
                          )}
                          {durStr && !node.duration && (
                            <span className="text-xs text-t4 font-mono">耗时 {durStr}</span>
                          )}
                          {clickable && (
                            <span
                              className="text-xs text-t4 transition-transform duration-150 leading-none"
                              style={{ transform: showExpanded ? 'rotate(90deg)' : 'rotate(0)' }}
                            >›</span>
                          )}
                        </div>
                        <div className="text-xs text-t3 mt-0.5">{node.sub}</div>
                        {!showExpanded && summary && (
                          <div className="mt-1 text-sm text-t3 truncate">{summary}</div>
                        )}
                        {!showExpanded && isFailed && !autoExpand && errorText && (
                          <div className="mt-1 text-sm text-danger">{humanizeError(errorText)}</div>
                        )}
                        {showExpanded && s && (
                          <div className={cn('mt-3 p-4 rounded-xl', isFailed ? 'bg-danger-bg' : 'bg-bg-hover')}>
                            {isFailed && (
                              <div>
                                <div className="text-sm text-danger leading-relaxed mb-3">{humanizeError(errorText)}</div>
                                <ActionBtn icon={<Play size={12} strokeWidth={2.5} />} label="重试此步骤" color="var(--color-info)" onClick={() => onRetryStep(s.id)} variant="fill" />
                              </div>
                            )}
                            {hasResult && <StepResultDisplay result={(s.result ?? {}) as Record<string, unknown>} />}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
              {ms.length === 0 && <div style={{ color: T.t4, fontSize: T.fs13, textAlign: 'center', padding: T.s24 }}>暂无步骤</div>}
            </div>
          </>
        )}

        {/* ═══ Detail Tab ═══ */}
        {activeTab === 'detail' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: `${T.s12}px ${T.s20}px ${T.s20}px` }}>
            {(() => {
              const completed = ms.filter(s => (s.status === 'succeeded' || s.status === 'completed') && s.result && typeof s.result === 'object');
              if (completed.length === 0) return <div style={{ color: T.t4, fontSize: T.fs13, textAlign: 'center', padding: T.s24 }}>暂无执行结果</div>;
              return completed.map(s => {
                const agentName = agentDisplayName(resolveStepAgentId(s));
                const stepLabel = STEP_ACTION_LABELS[s.kind] || s.kind;
                return (
                  <div key={s.id} style={{ marginBottom: T.s16 }}>
                    <div style={{ fontSize: T.fs13, fontWeight: T.w6, color: T.t1, fontFamily: T.sans, marginBottom: T.s8 }}>
                      {agentName} · {stepLabel}
                    </div>
                    <div style={{ padding: T.s12, backgroundColor: T.bg0, borderRadius: T.r8 }}>
                      <StepResultDisplay result={(s.result ?? {}) as Record<string, unknown>} />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </Card>
    </div>
  );
};

// ─── Roundtable chat view (Slack/Nexus style) with SSE streaming ───

interface StreamMsg {
  speakerId: string;
  speakerName: string;
  text: string;
  done: boolean; // false = still typing
}

const RoundtableView: React.FC<{ roundtables: RoundtableSession[]; activeId: number | null; agents: Agent[] }> = ({ roundtables, activeId, agents }) => {
  const agentDisplayName = useMemo(() => makeAgentLookup(agents), [agents]);
  const rt = roundtables.find(r => r.id === activeId);
  const [streamMsgs, setStreamMsgs] = useState<StreamMsg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => { scrollToBottom(); }, [streamMsgs, scrollToBottom]);

  // Connect SSE when session is running
  useEffect(() => {
    if (!rt || rt.status !== 'running') {
      setStreamMsgs([]);
      setStreaming(false);
      return;
    }

    setStreaming(true);
    // Seed with existing transcript so previously-arrived messages aren't lost on remount
    const existingLines = (rt.transcript || '').split('\n').filter(Boolean);
    const seed: StreamMsg[] = existingLines.map(line => {
      const ci = line.indexOf(':');
      const speakerName = ci > 0 && ci < 30 ? line.slice(0, ci).trim() : '系统';
      const text = ci > 0 && ci < 30 ? line.slice(ci + 1).trim() : line;
      return { speakerId: '', speakerName, text, done: true };
    });
    setStreamMsgs(seed);

    // Dynamic import to avoid circular deps
    import('../api').then(({ streamRoundtable }) => {
      const close = streamRoundtable(rt.id, {
        onTurnStart: (d) => {
          setStreamMsgs(prev => [...prev, { speakerId: d.speakerId, speakerName: d.speakerName, text: '', done: false }]);
        },
        onToken: (d) => {
          setStreamMsgs(prev => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const last = { ...updated[updated.length - 1] };
            last.text += d.token;
            updated[updated.length - 1] = last;
            return updated;
          });
        },
        onTurnEnd: (d) => {
          setStreamMsgs(prev => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const last = { ...updated[updated.length - 1] };
            last.text = d.fullText;
            last.done = true;
            updated[updated.length - 1] = last;
            return updated;
          });
        },
        onDone: () => {
          setStreaming(false);
        },
        onError: () => {
          setStreaming(false);
        },
      });
      cleanupRef.current = close;
    });

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [rt?.id, rt?.status]);

  if (!rt) return <Empty icon={<Users size={32} strokeWidth={1.5} />} text="选择一个会议" />;

  const transcriptLines = (rt.transcript || '').split('\n').filter(Boolean);
  const transcriptMsgs = transcriptLines.map(line => {
    const ci = line.indexOf(':');
    return ci > 0 && ci < 30
      ? { speaker: line.slice(0, ci).trim(), text: line.slice(ci + 1).trim() }
      : { speaker: '系统', text: line };
  });

  const isStreaming = streaming && rt.status === 'running';
  const displayMsgs: { speaker: string; text: string; typing: boolean }[] = isStreaming
    ? streamMsgs.map(m => ({ speaker: m.speakerName, text: m.text, typing: !m.done }))
    : transcriptMsgs.map(m => ({ ...m, typing: false }));

  const participantIds = (rt.participants || '').split(',').map(s => s.trim()).filter(Boolean);
  const participantAgents = participantIds.map(id => agents.find(a => a.id === id)).filter(Boolean) as Agent[];
  const resolveAgent = (speaker: string) => agents.find(a => a.name === speaker || a.id === speaker);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-7 py-5 bg-bg-hover rounded-t-xl">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-t1 tracking-tight">{rt.title}</h2>
            <div className="flex items-center gap-3 mt-2">
              {/* Stacked avatars */}
              <div className="flex items-center -space-x-2">
                {participantAgents.map(a => (
                  <div key={a.id} className="rounded-full" style={{ border: '2px solid var(--color-bg-panel)' }} title={a.name}>
                    <AgentAvatar id={a.id} name={a.name} size={28} />
                  </div>
                ))}
              </div>
              <span className="text-sm text-t3">{participantIds.length} 位参与者</span>
              <span className="text-t5">·</span>
              <span className="text-sm text-t4">{rt.format}</span>
            </div>
          </div>
          {isStreaming ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
              style={{ backgroundColor: '#D0EBFF', color: '#1864AB' }}>
              <span className="w-[5px] h-[5px] rounded-full animate-pulse-dot" style={{ backgroundColor: '#1864AB' }} />
              进行中 · {displayMsgs.length} 条
            </span>
          ) : (
            <span className="px-3 py-1.5 rounded-lg bg-bg-inset text-xs font-medium text-t3 flex-shrink-0">
              {displayMsgs.length} 条发言
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-7 py-6 bg-bg-hover rounded-b-xl border-t border-border-2">
        {displayMsgs.length > 0 ? displayMsgs.map((msg, mi) => {
          const agent = resolveAgent(msg.speaker);
          return (
            <div key={mi} className={cn('flex gap-4', mi > 0 && 'mt-6 pt-6 border-t border-border-2')}>
              <div className="flex-shrink-0 pt-0.5">
                {agent ? <AgentAvatar id={agent.id} name={agent.name} size={40} /> : (
                  <div className="w-10 h-10 rounded-full bg-bg-inset flex items-center justify-center text-sm font-semibold text-t4">{msg.speaker[0]}</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-md font-semibold text-t1">{agent?.name || agentDisplayName(msg.speaker)}</span>
                  {agent && <span className="text-2xs text-t4">{agent.role}</span>}
                </div>
                <div className="text-md text-t2 leading-relaxed">
                  <MarkdownBlock text={msg.text} />
                  {msg.typing && <span className="animate-pulse text-t1 font-bold">▍</span>}
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="flex flex-col items-center justify-center text-t4 text-sm py-16 gap-3">
            <Users size={28} strokeWidth={1.5} />
            {isStreaming ? '等待智能体发言…' : '暂无消息'}
          </div>
        )}

        {isStreaming && displayMsgs.length > 0 && displayMsgs.every(m => !m.typing) && (
          <div className="flex items-center justify-center gap-2 pt-6 text-sm text-t3">
            <Loader2 size={14} strokeWidth={2} className="animate-spin" />
            下一位智能体准备发言…
          </div>
        )}
        {!isStreaming && displayMsgs.length > 0 && (
          <div className="flex items-center justify-center gap-2 pt-6 text-xs text-t4">
            <CheckCircle2 size={13} strokeWidth={2} />
            会议结束 · {displayMsgs.length} 条发言
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Settings: Model config list ───
const ModelConfigView: React.FC<{
  configs: LlmModelConfig[];
  onAdd: (data: any) => Promise<void>;
  onUpdate: (id: string, data: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSetDefault: (id: string) => Promise<void>;
}> = ({ configs, onAdd, onUpdate, onDelete, onSetDefault }) => {
  const [showModal, setShowModal] = useState<'add' | LlmModelConfig | null>(null);

  return (
    <div className="max-w-3xl animate-fade-up space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-t1 tracking-tight">模型配置</h2>
        <button
          onClick={() => setShowModal('add')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white border-none cursor-pointer hover:opacity-85 transition-opacity"
          style={{ backgroundColor: 'var(--color-t1)' }}
        >
          <Plus size={15} strokeWidth={2.2} /> 添加模型
        </button>
      </div>

      {configs.length === 0 ? (
        <Card className="py-12 text-center">
          <Cpu size={32} strokeWidth={1.5} className="mx-auto mb-3 text-t4" />
          <div className="text-md text-t3 mb-1">尚未配置任何模型</div>
          <div className="text-sm text-t4">点击「添加模型」配置你的第一个 LLM</div>
        </Card>
      ) : (
        <div className="space-y-6">
          {([
            { type: 'text' as const, label: '文本模型', icon: <Cpu size={14} strokeWidth={2} className="text-t3" /> },
            { type: 'image' as const, label: '图片模型', icon: <ImageIcon size={14} strokeWidth={2} className="text-t3" /> },
          ]).map(group => {
            const items = configs.filter(c => (c.type || 'text') === group.type);
            if (items.length === 0) return null;
            return (
              <div key={group.type}>
                <div className="flex items-center gap-2 mb-3">
                  {group.icon}
                  <span className="text-xs font-semibold text-t3 tracking-wide">{group.label}</span>
                  <span className="text-2xs font-mono px-1.5 py-0.5 rounded-md bg-bg-inset text-t4">{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.map(cfg => {
                    const isDefault = cfg.isDefault;
                    return (
                      <div key={cfg.id} className="card p-5 group">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                            isDefault ? 'bg-bg-inset' : 'bg-bg-hover',
                          )}>
                            {group.type === 'image'
                              ? <ImageIcon size={18} strokeWidth={1.8} className="text-t3" />
                              : <Cpu size={18} strokeWidth={1.8} className="text-t3" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-md font-semibold text-t1">{cfg.name}</span>
                              {isDefault && (
                                <span className="px-2 py-[2px] rounded-md bg-t1 text-white text-[10px] font-semibold">默认</span>
                              )}
                            </div>
                            <div className="text-xs text-t4 font-mono mt-1">
                              {cfg.provider} / {cfg.model}
                            </div>
                            <div className="flex items-center gap-3 mt-1.5">
                              {cfg.hasKey ? (
                                <span className="text-xs text-success flex items-center gap-1">
                                  <Shield size={11} strokeWidth={2} /> Key 已配置
                                </span>
                              ) : (
                                <span className="text-xs text-warning flex items-center gap-1">
                                  <AlertTriangle size={11} strokeWidth={2} /> 未配置
                                </span>
                              )}
                              {cfg.baseUrl && <span className="text-xs text-t4 font-mono truncate">{cfg.baseUrl}</span>}
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!isDefault && (
                              <button onClick={() => onSetDefault(cfg.id)} title="设为默认"
                                className="w-8 h-8 rounded-lg flex items-center justify-center border-none bg-transparent text-t4 hover:bg-bg-hover hover:text-t1 cursor-pointer transition-colors">
                                <Star size={15} strokeWidth={1.8} />
                              </button>
                            )}
                            <button onClick={() => setShowModal(cfg)} title="编辑"
                              className="w-8 h-8 rounded-lg flex items-center justify-center border-none bg-transparent text-t4 hover:bg-bg-hover hover:text-t1 cursor-pointer transition-colors">
                              <Pencil size={15} strokeWidth={1.8} />
                            </button>
                            <button onClick={() => { if (confirm(`确认删除「${cfg.name}」？`)) onDelete(cfg.id); }} title="删除"
                              className="w-8 h-8 rounded-lg flex items-center justify-center border-none bg-transparent text-t5 hover:bg-danger-bg hover:text-danger cursor-pointer transition-colors">
                              <Trash2 size={15} strokeWidth={1.8} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal === 'add' && (
        <ModelConfigModal
          onSave={async (data) => { await onAdd(data); }}
          onClose={() => setShowModal(null)}
        />
      )}
      {showModal && showModal !== 'add' && (
        <ModelConfigModal
          initial={showModal as LlmModelConfig}
          onSave={async (data) => { await onUpdate((showModal as LlmModelConfig).id, data); }}
          onClose={() => setShowModal(null)}
        />
      )}
    </div>
  );
};

const iconBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: T.r8, border: 'none',
  backgroundColor: 'transparent', cursor: 'pointer', color: T.t4,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s',
};

// ─── Material Detail View ───

const MAT_STATUS: Record<string, string> = { new: 'running', used: 'succeeded', archived: 'cancelled' };

const MaterialDetailView: React.FC<{
  items: MaterialItem[];
  selectedId: number | null;
  onUpdate?: (id: number, data: any) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  onCreateProposal?: (title: string, description: string) => void;
}> = ({ items, selectedId, onUpdate, onDelete, onCreateProposal }) => {
  const item = items.find(i => i.id === selectedId);
  if (!item) return <Empty icon={<Lightbulb size={32} strokeWidth={1.5} />} text="选择一个素材查看详情" />;

  const STATUS_CFG: Record<string, { label: string; fg: string; bg: string }> = {
    new:      { label: '未读', fg: '#1864AB', bg: '#D0EBFF' },
    used:     { label: '已用', fg: '#1B7A3D', bg: '#D3F9E0' },
    archived: { label: '已归档', fg: '#868E96', bg: '#F1F3F5' },
  };
  const sCfg = STATUS_CFG[item.status] || { label: item.status, fg: '#868E96', bg: '#F1F3F5' };
  const [showContent, setShowContent] = useState(false);

  return (
    <div className="max-w-3xl animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-t1 tracking-tight truncate">
              {item.title || (item.kind === 'url' ? '链接素材' : '笔记')}
            </h2>
            <span
              className="inline-flex items-center px-2.5 py-[3px] rounded-lg text-[10px] font-semibold leading-none flex-shrink-0"
              style={{ color: sCfg.fg, backgroundColor: sCfg.bg }}
            >{sCfg.label}</span>
          </div>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-t3 hover:text-t1 transition-colors group truncate"
            >
              <Link2 size={13} className="flex-shrink-0" />
              <span className="truncate group-hover:underline font-mono">{item.url}</span>
              <ArrowRight size={11} className="flex-shrink-0 text-t4 group-hover:text-t1 transition-colors -rotate-45" />
            </a>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => {
              const title = item.title || '基于素材的写作';
              const desc = item.summary || item.content.slice(0, 200);
              onCreateProposal?.(title, desc);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white border-none cursor-pointer hover:opacity-85 transition-opacity"
            style={{ backgroundColor: 'var(--color-t1)' }}
          >
            <Pencil size={13} /> 写文章
          </button>
          {item.status !== 'archived' && (
            <button
              onClick={() => onUpdate?.(item.id, { status: 'archived' })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-bg-hover text-sm text-t2 font-medium border-none cursor-pointer hover:bg-bg-inset transition-colors"
            >
              <Archive size={13} /> 归档
            </button>
          )}
          <button
            onClick={() => onDelete?.(item.id)}
            className="flex items-center px-3 py-2 rounded-lg text-sm text-danger font-medium border-none cursor-pointer bg-transparent hover:bg-danger-bg transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Tags */}
      {item.tags && item.tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-5">
          {item.tags.map((tag, i) => (
            <span key={i} className="px-2.5 py-1 rounded-lg bg-bg-hover text-xs font-medium text-t2">{tag}</span>
          ))}
        </div>
      )}

      {/* AI Summary */}
      <Card className="mb-4 p-6">
        <h3 className="text-sm font-semibold text-t3 mb-3 flex items-center gap-1.5">
          <Brain size={14} /> AI 摘要
        </h3>
        {item.summary ? (
          <p className="text-md text-t1 leading-relaxed">{item.summary}</p>
        ) : item.summaryStatus === 'failed' ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-danger flex items-center gap-1.5">
              <XCircle size={13} strokeWidth={2} /> 摘要生成失败
            </span>
            <button
              onClick={() => onUpdate?.(item.id, { summaryStatus: 'pending' }).then(() => {
                api.updateMaterial(item.id, { resummarize: true }).catch(() => {});
              })}
              className="px-3 py-1 rounded-lg bg-bg-hover text-xs font-medium text-t2 border-none cursor-pointer hover:bg-bg-inset transition-colors"
            >重试</button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-t3">
            <Loader2 size={13} strokeWidth={2} className="animate-spin" /> AI 正在阅读…
          </div>
        )}
      </Card>

      {/* Content */}
      {item.content && (
        <Card className="mb-4 p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-t3 flex items-center gap-1.5">
              <FileText size={14} /> 原文内容
            </h3>
            <button
              onClick={() => setShowContent(!showContent)}
              className="text-xs font-medium text-t3 hover:text-t1 bg-transparent border-none cursor-pointer transition-colors"
            >{showContent ? '收起' : '展开'}</button>
          </div>
          <div
            className="text-sm text-t2 leading-relaxed whitespace-pre-wrap break-words"
            style={{ maxHeight: showContent ? 'none' : 120, overflow: 'hidden' }}
          >
            {item.content.slice(0, showContent ? undefined : 500)}
            {!showContent && item.content.length > 500 && '…'}
          </div>
        </Card>
      )}
    </div>
  );
};

// ─── Outbox Detail View ───

const OUTBOX_PLATFORM_NAMES: Record<string, string> = {
  tweet: '推特/X', weibo: '微博', xiaohongshu: '小红书',
  douyin: '抖音', zhihu: '知乎', toutiao: '今日头条', wechat_mp: '公众号',
};

const OutboxDetailView: React.FC<{
  items: OutboxItem[];
  selectedId: number | null;
  selectedKind: string | null;
  missions: Mission[];
  publishers?: PublisherInfo[];
  onUpdate?: (kind: string, id: number, data: any) => Promise<void>;
  onDelete?: (kind: string, id: number) => Promise<void>;
  onPublish?: (kind: string, id: number, publisherId: string, theme?: string, styledHtml?: string) => Promise<void>;
  onGoToMission?: (id: number) => void;
}> = ({ items, selectedId, selectedKind, missions, publishers, onUpdate, onDelete, onPublish, onGoToMission }) => {
  const item = items.find(i => i.id === selectedId && i.kind === selectedKind);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPublishMenu, setShowPublishMenu] = useState(false);
  const [browserStatus, setBrowserStatus] = useState<{ state: string; message?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<string>('original');
  const [showAllThemes, setShowAllThemes] = useState(false);

  useEffect(() => {
    if (item) {
      setEditContent(item.content);
      setEditTitle(item.title || '');
      setEditing(false);
      setActiveTab('original');
      setShowPublishMenu(false);
      setShowAllThemes(false);
    }
  }, [item?.id, item?.kind]);

  // Quick-access themes (first 6) + "more" toggle
  const QUICK_THEMES = THEMES.slice(0, 6);

  // Compute themed HTML synchronously (instant!)
  const themedHtml = useMemo(() => {
    if (!item || activeTab === 'original') return '';
    return renderThemedHtml(item.content, activeTab);
  }, [item?.content, activeTab]);

  const handlePublishWithStatus = async (kind: string, id: number, publisherId: string) => {
    const isBrowser = publisherId === 'browser-wechat-mp' || publisherId === 'browser-toutiao';
    let es: EventSource | null = null;
    if (isBrowser) {
      setBrowserStatus({ state: 'launching', message: '正在启动浏览器...' });
      try {
        es = new EventSource(`http://localhost:3456/api/publishers/${publisherId}/status`);
        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            setBrowserStatus(data);
            if (data.state === 'done' || data.state === 'error') {
              es?.close();
            }
          } catch {}
        };
        es.onerror = () => { es?.close(); };
      } catch {}
    }
    setPublishing(true);
    try {
      // If a theme is selected, generate WeChat-compatible HTML client-side
      let publishHtml: string | undefined;
      if (item && activeTab !== 'original') {
        const styled = renderThemedHtml(item.content, activeTab);
        publishHtml = await makeWeChatCompatible(styled, activeTab);
      }
      await onPublish?.(kind, id, publisherId, activeTab !== 'original' ? activeTab : undefined, publishHtml);
      if (isBrowser) setBrowserStatus({ state: 'done', message: '草稿已保存到公众号' });
    } catch {
      if (isBrowser) setBrowserStatus({ state: 'error', message: '发布失败' });
    } finally {
      setPublishing(false);
      es?.close();
      if (!isBrowser) setBrowserStatus(null);
      // Auto-clear browser status after 5s
      if (isBrowser) setTimeout(() => setBrowserStatus(null), 5000);
    }
  };

  if (!item) {
    return <Empty icon={<Send size={32} strokeWidth={1.5} />} text="选择一个内容项查看详情" />;
  }

  const mission = item.missionId ? missions.find(m => m.id === item.missionId) : null;

  const STATUS_LABEL: Record<string, string> = { draft: '草稿', approved: '已审核', exported: '已导出', archived: '已归档' };
  const NEXT_STATUS: Record<string, string> = { draft: 'approved', approved: 'exported', exported: 'archived' };
  const NEXT_LABEL: Record<string, string> = { draft: '标记已审核', approved: '标记已导出', exported: '归档' };

  const handleCopy = async () => {
    if (item.kind === 'article' && activeTab !== 'original' && themedHtml) {
      // Copy WeChat-compatible styled HTML to clipboard
      try {
        const wechatHtml = await makeWeChatCompatible(themedHtml, activeTab);
        const blob = new Blob([wechatHtml], { type: 'text/html' });
        const textBlob = new Blob([item.content], { type: 'text/plain' });
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': textBlob })]);
      } catch {
        navigator.clipboard.writeText(item.content);
      }
    } else {
      const text = item.kind === 'article' ? `# ${item.title || ''}\n\n${item.content}` : item.content;
      navigator.clipboard.writeText(text);
    }
  };

  const handleExportMd = () => {
    const text = item.kind === 'article' ? `# ${item.title || ''}\n\n${item.content}` : item.content;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.title || 'outbox-' + item.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: any = { content: editContent };
      if (item.kind === 'article') data.title = editTitle;
      await onUpdate?.(item.kind, item.id, data);
      setEditing(false);
    } finally { setSaving(false); }
  };

  const handleStatusChange = async (status: string) => {
    setSaving(true);
    try { await onUpdate?.(item.kind, item.id, { status }); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try { await onDelete?.(item.kind, item.id); } finally { setSaving(false); }
  };

  const OUTBOX_STATUS: Record<string, { label: string; fg: string; bg: string }> = {
    draft:    { label: '草稿', fg: '#946800', bg: '#FFF3BF' },
    approved: { label: '已审核', fg: '#1864AB', bg: '#D0EBFF' },
    exported: { label: '已导出', fg: '#1B7A3D', bg: '#D3F9E0' },
    archived: { label: '已归档', fg: '#868E96', bg: '#F1F3F5' },
  };
  const statusCfg = OUTBOX_STATUS[item.status] || { label: item.status, fg: '#868E96', bg: '#F1F3F5' };

  return (
    <div className="max-w-4xl mx-auto w-full animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            {item.kind === 'tweet' ? <Twitter size={18} className="text-t3 flex-shrink-0" /> : <BookOpen size={18} className="text-t3 flex-shrink-0" />}
            <h2 className="text-2xl font-bold text-t1 tracking-tight truncate">
              {item.kind === 'tweet'
                ? (OUTBOX_PLATFORM_NAMES[item.platform || ''] || '推文草稿')
                : (item.title || '未命名文章')}
            </h2>
            {item.platform && item.platform !== 'tweet' && (
              <span className="px-2 py-[2px] rounded-md bg-bg-hover text-2xs font-medium text-t3 flex-shrink-0">
                {OUTBOX_PLATFORM_NAMES[item.platform] || item.platform}
              </span>
            )}
            <span
              className="inline-flex items-center px-2.5 py-[3px] rounded-lg text-[10px] font-semibold leading-none flex-shrink-0"
              style={{ color: statusCfg.fg, backgroundColor: statusCfg.bg }}
            >
              {statusCfg.label}
            </span>
          </div>
          {mission && (
            <div
              className="flex items-center gap-1.5 text-sm text-t3 mt-1 ml-[30px] cursor-pointer group max-w-full"
              onClick={() => onGoToMission?.(mission.id)}
            >
              <GitBranch size={12} strokeWidth={1.8} className="flex-shrink-0" />
              <span className="truncate group-hover:text-t1 group-hover:underline transition-colors">
                来自：{mission.title}
              </span>
              <ArrowRight size={12} strokeWidth={2} className="flex-shrink-0 text-t4 group-hover:text-t1 transition-colors" />
            </div>
          )}
        </div>

        {/* Action buttons — horizontal */}
        {!editing && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-bg-hover text-sm text-t2 font-medium border-none cursor-pointer hover:bg-bg-inset transition-colors">
              <Pencil size={13} /> 编辑
            </button>
            <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-bg-hover text-sm text-t2 font-medium border-none cursor-pointer hover:bg-bg-inset transition-colors">
              <Copy size={13} /> 复制
            </button>
            {item.kind === 'article' && (
              <button onClick={handleExportMd} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-bg-hover text-sm text-t2 font-medium border-none cursor-pointer hover:bg-bg-inset transition-colors">
                <Download size={13} /> .md
              </button>
            )}
            {NEXT_STATUS[item.status] && (
              <button
                onClick={() => handleStatusChange(NEXT_STATUS[item.status])}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white border-none cursor-pointer hover:opacity-85 disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: 'var(--color-t1)' }}
              >
                <Check size={13} /> {NEXT_LABEL[item.status]}
              </button>
            )}
            {(item.status === 'approved' || item.status === 'exported') && (() => {
              const readyPubs = (publishers || []).filter(p => p.ready);
              if (readyPubs.length === 0) return null;
              if (readyPubs.length === 1) {
                return (
                  <button
                    onClick={() => handlePublishWithStatus(item.kind, item.id, readyPubs[0].id)}
                    disabled={publishing}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border-none cursor-pointer hover:opacity-85 disabled:opacity-50 transition-opacity"
                    style={{ backgroundColor: 'var(--color-success)', color: '#fff' }}
                  >
                    <Upload size={13} /> {publishing ? '发布中…' : '发布'}
                  </button>
                );
              }
              return (
                <div className="relative">
                  <button
                    onClick={() => setShowPublishMenu(!showPublishMenu)}
                    disabled={publishing}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border-none cursor-pointer hover:opacity-85 disabled:opacity-50 transition-opacity"
                    style={{ backgroundColor: 'var(--color-success)', color: '#fff' }}
                  >
                    <Upload size={13} /> {publishing ? '发布中…' : '发布 ▾'}
                  </button>
                  {showPublishMenu && (
                    <div className="absolute top-full right-0 mt-1 min-w-[180px] bg-bg-panel rounded-xl shadow-md z-10 overflow-hidden border border-border-2">
                      {readyPubs.map(pub => (
                        <div key={pub.id}
                          onClick={() => { setShowPublishMenu(false); handlePublishWithStatus(item.kind, item.id, pub.id); }}
                          className="px-4 py-2.5 text-sm text-t1 cursor-pointer hover:bg-bg-hover transition-colors"
                        >{pub.name}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <button
              onClick={handleDelete}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-danger font-medium border-none cursor-pointer bg-transparent hover:bg-danger-bg transition-colors disabled:opacity-50"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Theme tab bar (article, non-editing only) */}
      {item.kind === 'article' && !editing && (
        <div className="flex gap-1.5 flex-wrap mb-5 bg-bg-hover rounded-xl p-1.5">
          {[{ id: 'original', name: '原文' } as { id: string; name: string }, ...(showAllThemes ? THEMES : QUICK_THEMES)].map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-3.5 py-1.5 rounded-lg text-xs font-medium border-none cursor-pointer transition-all duration-100',
                  active
                    ? 'bg-bg-panel text-t1 font-semibold shadow-xs'
                    : 'bg-transparent text-t3 hover:text-t2',
                )}
              >{tab.name}</button>
            );
          })}
          <button
            onClick={() => setShowAllThemes(!showAllThemes)}
            className="px-2.5 py-1.5 rounded-lg text-xs text-t4 bg-transparent border-none cursor-pointer hover:text-t3 transition-colors"
          >{showAllThemes ? '收起' : `更多(${THEMES.length - QUICK_THEMES.length})`}</button>
        </div>
      )}

      {/* Content area */}
      <Card className="mb-4">
        {editing ? (
          <div className="space-y-4">
            {item.kind === 'article' && (
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="标题"
                className="w-full px-4 py-3 rounded-xl text-lg font-semibold text-t1 bg-bg-hover border-none outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)]"
              />
            )}
            <MilkdownEditor
              value={editContent}
              onChange={setEditContent}
              minHeight={item.kind === 'article' ? 300 : 120}
            />
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-white border-none cursor-pointer hover:opacity-85 disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: 'var(--color-t1)' }}
              >{saving ? '保存中…' : '保存'}</button>
              <button
                onClick={() => { setEditing(false); setEditContent(item.content); setEditTitle(item.title || ''); }}
                className="px-5 py-2 rounded-xl text-sm font-medium text-t1 bg-bg-hover border-none cursor-pointer hover:bg-bg-inset transition-colors"
              >取消</button>
            </div>
          </div>
        ) : activeTab !== 'original' && themedHtml ? (
          <div dangerouslySetInnerHTML={{ __html: themedHtml }} />
        ) : (
          <div>
            {item.kind === 'article' ? (
              <div className="text-md leading-[1.75] text-t1" dangerouslySetInnerHTML={{ __html: renderMarkdown(item.content) }} />
            ) : (
              <div className="text-lg leading-relaxed text-t1 whitespace-pre-wrap">{item.content}</div>
            )}
          </div>
        )}
      </Card>

      {/* Browser publish status banner */}
      {browserStatus && (
        <div className={cn(
          'mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2',
          browserStatus.state === 'error' ? 'bg-danger-bg text-danger'
            : browserStatus.state === 'done' ? 'bg-success-bg text-success'
            : 'bg-warning-bg text-warning',
        )}>
          {browserStatus.state === 'launching' && '正在启动浏览器…'}
          {browserStatus.state === 'need_scan' && '请在弹出的浏览器窗口中扫码登录'}
          {browserStatus.state === 'publishing' && '正在创建草稿…'}
          {browserStatus.state === 'done' && '草稿已保存到公众号'}
          {browserStatus.state === 'error' && (browserStatus.message || '发布失败')}
        </div>
      )}

      {/* Metadata */}
      <div className="pt-4 border-t border-border-2 text-2xs text-t4 font-mono">
        创建于 {new Date(item.createdAt).toLocaleString('zh-CN')}
        {item.exportedAt && ` · 导出于 ${new Date(item.exportedAt).toLocaleString('zh-CN')}`}
      </div>
    </div>
  );
};

// ─── Helpers ───

function relTime(dateStr: string): string {
  const diffMin = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}小时前`;
  return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function formatDuration(startedAt?: string | null, finishedAt?: string | null): string | null {
  if (!startedAt || !finishedAt) return null;
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return null;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m${rem}s` : `${min}m`;
}

// ─── Signal Feed View ───

const KIND_FILTER_MAP: Record<string, string[]> = {
  '全部': [],
  '任务': ['mission_created', 'mission_approved', 'mission_succeeded', 'mission_failed', 'mission_cancelled', 'mission_finalized'],
  '步骤': ['step_succeeded', 'step_failed', 'step_started'],
  '会议': ['roundtable_started', 'roundtable_finished'],
};

const EVENT_KIND_LABELS: Record<string, { label: string; fg: string; bg: string }> = {
  mission_created:   { label: '创建任务', fg: '#1864AB', bg: '#D0EBFF' },
  mission_approved:  { label: '审批通过', fg: '#1B7A3D', bg: '#D3F9E0' },
  mission_succeeded: { label: '任务完成', fg: '#1B7A3D', bg: '#D3F9E0' },
  mission_failed:    { label: '任务失败', fg: '#C92A2A', bg: '#FFE3E3' },
  mission_cancelled: { label: '任务取消', fg: '#868E96', bg: '#F1F3F5' },
  mission_finalized: { label: '任务定稿', fg: '#5C3D99', bg: '#E8DAFB' },
  step_succeeded:    { label: '步骤完成', fg: '#1B7A3D', bg: '#D3F9E0' },
  step_failed:       { label: '步骤失败', fg: '#C92A2A', bg: '#FFE3E3' },
  step_started:      { label: '步骤开始', fg: '#1864AB', bg: '#D0EBFF' },
  roundtable_started:  { label: '会议开始', fg: '#946800', bg: '#FFF3BF' },
  roundtable_finished: { label: '会议结束', fg: '#1B7A3D', bg: '#D3F9E0' },
};

const SignalFeedView: React.FC<{ events: EventItem[]; agents: Agent[] }> = ({ events, agents }) => {
  const [kindFilter, setKindFilter] = useState('全部');
  const agentMap = useMemo(() => {
    const m: Record<string, Agent> = {};
    for (const a of agents) m[a.id] = a;
    return m;
  }, [agents]);

  const filtered = useMemo(() => {
    const kinds = KIND_FILTER_MAP[kindFilter];
    if (!kinds || kinds.length === 0) return events.slice(0, 100);
    return events.filter(e => kinds.includes(e.kind)).slice(0, 100);
  }, [events, kindFilter]);

  return (
    <div className="max-w-3xl animate-fade-up">
      <div className="flex items-center gap-3 mb-5">
        <Activity size={20} strokeWidth={2} className="text-t1" />
        <h2 className="text-2xl font-bold text-t1 tracking-tight">动态</h2>
        <span className="px-2 py-0.5 rounded-lg bg-bg-inset text-t3 text-sm font-mono">{events.length}</span>
      </div>
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {Object.keys(KIND_FILTER_MAP).map(k => (
          <button
            key={k}
            onClick={() => setKindFilter(k)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium border-none cursor-pointer transition-colors duration-100',
              kindFilter === k ? 'bg-bg-inset text-t1 font-semibold' : 'bg-transparent text-t3 hover:bg-bg-hover',
            )}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="space-y-1">
        {filtered.map(ev => {
          const agent = ev.agentId ? agentMap[ev.agentId] : null;
          const kindCfg = EVENT_KIND_LABELS[ev.kind] || { label: ev.kind, fg: '#868E96', bg: '#F1F3F5' };
          return (
            <div key={ev.id} className="flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-bg-hover transition-colors duration-100">
              {agent ? (
                <AgentAvatar id={agent.id} name={agent.name} size={32} />
              ) : (
                <div className="w-8 h-8 rounded-full bg-bg-inset flex items-center justify-center flex-shrink-0">
                  <Zap size={14} className="text-t4" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-t1 truncate">{ev.title}</span>
                  <span
                    className="inline-flex items-center px-2 py-[2px] rounded-md text-[10px] font-semibold leading-none flex-shrink-0 whitespace-nowrap"
                    style={{ color: kindCfg.fg, backgroundColor: kindCfg.bg }}
                  >
                    {kindCfg.label}
                  </span>
                  <span className="text-2xs text-t4 ml-auto flex-shrink-0">{relTime(ev.createdAt)}</span>
                </div>
                {ev.summary && (
                  <div className="text-xs text-t3 line-clamp-2">{ev.summary}</div>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <Empty icon={<Activity size={32} strokeWidth={1.5} />} text="暂无动态" />
        )}
      </div>
    </div>
  );
};

// ─── Stage View (Agent Card Grid) ───

const StageView: React.FC<{
  stageData: StageAgent[];
  agents: Agent[];
  activeId: string;
  onSelectAgent: (id: string) => void;
  rels: Relationship[];
  memories: Memory[];
  onCreateMemory: (c: string, k: string) => void;
  onDeleteMemory: (id: number) => void;
  onRenameAgent: (id: string, name: string) => void;
}> = ({ stageData, agents, activeId, onSelectAgent, rels, memories, onCreateMemory, onDeleteMemory, onRenameAgent }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'detail'>(!activeId || activeId === 'minion' ? 'grid' : 'detail');

  // If user clicks a card, show detail
  const handleCardClick = useCallback((id: string) => {
    onSelectAgent(id);
    setViewMode('detail');
  }, [onSelectAgent]);

  const handleBackToGrid = useCallback(() => {
    setViewMode('grid');
  }, []);

  if (viewMode === 'detail' && activeId && activeId !== 'minion') {
    return (
      <div className="animate-fade-up">
        <button
          onClick={handleBackToGrid}
          className="flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded-lg bg-bg-hover text-t3 text-sm font-medium border-none cursor-pointer hover:bg-bg-inset transition-colors"
        >
          <ArrowRight size={14} strokeWidth={2} className="rotate-180" /> 返回卡片
        </button>
        <AgentView agents={agents} activeId={activeId} rels={rels} memories={memories} onCreateMemory={onCreateMemory} onDeleteMemory={onDeleteMemory} onRenameAgent={onRenameAgent} />
      </div>
    );
  }

  const roots = stageData.filter(a => !a.parentId);
  const byParent: Record<string, StageAgent[]> = {};
  for (const a of stageData) {
    if (a.parentId) (byParent[a.parentId] ??= []).push(a);
  }

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-3 mb-5">
        <Bot size={20} strokeWidth={2} className="text-t1" />
        <h2 className="text-2xl font-bold text-t1 tracking-tight">智能体</h2>
        <span className="px-2 py-0.5 rounded-lg bg-bg-inset text-t3 text-sm font-mono">{stageData.length}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {roots.map(agent => {
          const children = byParent[agent.id] || [];
          return (
            <React.Fragment key={agent.id}>
              <StageCard agent={agent} agents={agents} onClick={() => handleCardClick(agent.id)} />
              {children.map(child => (
                <StageCard key={child.id} agent={child} agents={agents} onClick={() => handleCardClick(child.id)} isChild />
              ))}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

const StageCard: React.FC<{
  agent: StageAgent;
  agents: Agent[];
  onClick: () => void;
  isChild?: boolean;
}> = ({ agent, agents, onClick, isChild }) => {
  const agentMap = useMemo(() => {
    const m: Record<string, Agent> = {};
    for (const a of agents) m[a.id] = a;
    return m;
  }, [agents]);

  return (
    <div
      onClick={onClick}
      className={cn(
        'card p-5 cursor-pointer hover:shadow-md transition-shadow duration-150',
        isChild && 'ml-4 opacity-90',
      )}
    >
      {/* Top: avatar + name + role */}
      <div className="flex items-center gap-3 mb-3">
        <AgentAvatar id={agent.id} name={agent.name} size={isChild ? 40 : 48} online active={agent.runningSteps > 0} />
        <div className="flex-1 min-w-0">
          <div className={cn('font-semibold text-t1 truncate', isChild ? 'text-sm' : 'text-base')}>{agent.name}</div>
          <div className="text-xs text-t3 truncate">{agent.role}</div>
        </div>
      </div>
      {/* Middle: badges */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {agent.runningSteps > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#D0EBFF] text-[#1864AB]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1864AB] animate-pulse-dot" />
            {agent.runningSteps} 运行中
          </span>
        )}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-bg-inset text-t3">
          <Brain size={10} strokeWidth={2} /> {agent.memoryCount}
        </span>
      </div>
      {/* Bottom: top relationships */}
      {agent.topRelationships.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2">
          {agent.topRelationships.map(r => {
            const other = agentMap[r.otherId];
            return (
              <div key={r.otherId} className="flex items-center gap-1" title={`${other?.name || r.otherId}: ${r.score.toFixed(2)}`}>
                <AgentAvatar id={r.otherId} name={other?.name || r.otherId} size={20} />
                <span className="text-2xs font-mono text-t4">{r.score.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
      )}
      {/* Recent event */}
      {agent.recentEvent && (
        <div className="text-xs text-t4 truncate pt-2 border-t border-border-1">
          {agent.recentEvent.title} · {relTime(agent.recentEvent.createdAt)}
        </div>
      )}
    </div>
  );
};

// ─── Main export ───
export const MainView: React.FC<Props> = React.memo((p) => {
  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--color-bg-base)', paddingTop: 48 }}>
      {p.error && (
        <div className="mx-6 mb-2 px-4 py-2.5 rounded-lg bg-danger-bg text-danger text-base flex items-center gap-2">
          <AlertTriangle size={16} strokeWidth={2} />{p.error}
        </div>
      )}
      <div className="flex-1 overflow-auto px-8 py-6">
        {p.nav === 'theme' && <ThemeView themeId={p.themeId} onSetTheme={p.onSetTheme} />}
        {p.nav === 'agents' && <StageView stageData={p.stageData || []} agents={p.agents} activeId={p.activeAgentId} onSelectAgent={() => {}} rels={p.relationships} memories={p.memories} onCreateMemory={p.onCreateMemory} onDeleteMemory={p.onDeleteMemory} onRenameAgent={p.onRenameAgent} />}
        {p.nav === 'signal' && <SignalFeedView events={p.events || []} agents={p.agents} />}
        {p.nav === 'pipeline' && <PipelineView missions={p.missions} steps={p.steps} selectedId={p.selectedMissionId} selectedProposalId={p.selectedProposalId} proposals={p.proposals} dailyStats={p.dailyStats} agentStats={p.agentStats} agents={p.agents} heartbeat={p.heartbeat} onApprove={p.onApproveProposal} onReject={p.onRejectProposal} onCancel={p.onCancelMission} onRetryStep={p.onRetryStep} onRerun={p.onRerunMission} />}

        {p.nav === 'materials' && <MaterialDetailView items={p.materials || []} selectedId={p.selectedMaterialId ?? null} onUpdate={p.onUpdateMaterial} onDelete={p.onDeleteMaterial} onCreateProposal={p.onCreateProposalFromMaterial} />}
        {p.nav === 'outbox' && <OutboxDetailView items={p.outboxItems || []} selectedId={p.selectedOutboxId ?? null} selectedKind={p.selectedOutboxKind ?? null} missions={p.missions} publishers={p.publishers} onUpdate={p.onUpdateOutboxItem} onDelete={p.onDeleteOutboxItem} onPublish={p.onPublishOutboxItem} onGoToMission={(id) => { p.onSelectMission?.(id); }} />}
        {p.nav === 'roundtable' && <RoundtableView roundtables={p.roundtables} activeId={p.activeRoundtableId} agents={p.agents} />}
        {p.nav === 'settings' && p.settingsTab === 'model-config' && (
          <ModelConfigView configs={p.llmConfigs} onAdd={p.onAddLlmConfig} onUpdate={p.onUpdateLlmConfig} onDelete={p.onDeleteLlmConfig} onSetDefault={p.onSetDefaultLlmConfig} />
        )}
        {p.nav === 'settings' && p.settingsTab === 'tools-config' && <SettingsToolsTab />}
        {p.nav === 'settings' && p.settingsTab === 'agents-config' && <SettingsAgentsTab onChanged={p.onAgentsChanged} />}
        {p.nav === 'settings' && p.settingsTab === 'policy' && <SettingsPolicyTab />}
        {p.nav === 'settings' && p.settingsTab === 'triggers' && <SettingsTriggersTab />}
        {p.nav === 'settings' && p.settingsTab === 'rss-config' && <SettingsRssTab />}
        {p.nav === 'settings' && p.settingsTab === 'about' && <SettingsAboutTab />}
        {p.nav === 'settings' && !p.settingsTab && (
          <Empty icon={<Cpu size={32} strokeWidth={1.5} />} text="请从左侧选择设置项" />
        )}
      </div>
    </div>
  );
});
