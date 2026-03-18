import React, { useRef, useCallback } from 'react';
import { agentHue } from './styles';
import { AgentAvatar } from './AgentAvatar';
import { cn } from '../lib/utils';

const PLATFORM_NAMES: Record<string, string> = {
  tweet: '推特/X', weibo: '微博', xiaohongshu: '小红书',
  douyin: '抖音', zhihu: '知乎', toutiao: '今日头条', wechat_mp: '公众号',
};

function useDebouncedCallback(fn: (v: string) => void, delay = 300) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  return useCallback((v: string) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fn(v), delay);
  }, [fn, delay]);
}
import type {
  NavKey, Agent, Mission, Step, RoundtableSession, Proposal,
  SettingsTab, OutboxItem, OutboxStats, MaterialItem, MaterialStats,
} from '../types';
import {
  Plus, Brain, FileText, Users, Cpu, Shield, Zap, ChevronRight,
  Wrench, Send, Twitter, BookOpen, Lightbulb, Link2, StickyNote,
  Rss, Loader2, Search,
} from 'lucide-react';

interface Props {
  nav: NavKey;
  agents: Agent[]; activeAgentId: string; onSelectAgent: (id: string) => void;
  missions: Mission[]; steps: Step[]; selectedMissionId: number | null;
  onSelectMission: (id: number | null) => void;
  selectedProposalId: number | null; onSelectProposal: (id: number | null) => void;
  roundtables: RoundtableSession[]; activeRoundtableId: number | null;
  onSelectRoundtable: (id: number) => void;
  proposals: Proposal[]; pendingCount: number;
  memoryCount: number; loading: boolean;
  onCreateProposal: () => void; onCreateRoundtable: () => void; onAddMemory: () => void;
  settingsTab?: SettingsTab; onSelectSettingsTab?: (tab: SettingsTab) => void;
  modelConfigCount?: number;
  outboxItems?: OutboxItem[]; outboxStats?: OutboxStats | null;
  selectedOutboxId?: number | null; outboxKind?: string | null;
  onSelectOutbox?: (kind: string, id: number) => void;
  outboxFilter?: string; onSetOutboxFilter?: (f: string) => void;
  onBackfillOutbox?: () => void;
  materials?: MaterialItem[]; materialStats?: MaterialStats | null;
  selectedMaterialId?: number | null; onSelectMaterial?: (id: number) => void;
  materialFilter?: string; onSetMaterialFilter?: (f: string) => void;
  onCreateMaterial?: (data: { url?: string; text?: string; content?: string }) => Promise<void> | void;
  onRefreshRss?: () => void;
  rssRefreshing?: boolean;
  materialTotal?: number;
  onLoadMoreMaterials?: () => void;
  // Search + pagination
  pipelineSearch?: string;
  onPipelineSearch?: (q: string) => void;
  pipelineStatus?: string;
  onPipelineStatusFilter?: (status: string) => void;
  missionTotal?: number;
  onLoadMoreMissions?: () => void;
  outboxSearch?: string;
  onOutboxSearch?: (q: string) => void;
  outboxTotal?: number;
  onLoadMoreOutbox?: () => void;
  roundtableSearch?: string;
  onRoundtableSearch?: (q: string) => void;
  roundtableTotal?: number;
  onLoadMoreRoundtables?: () => void;
  materialSearch?: string;
  onMaterialSearch?: (q: string) => void;
}

// ─── Shared sub-components ───

const SectionHead: React.FC<{
  title: string;
  count?: number;
  action?: { label: string; onClick: () => void; loading?: boolean };
  onTitleClick?: () => void;
}> = ({ title, count, action, onTitleClick }) => (
  <div className="flex items-center justify-between px-5 pt-4 pb-3">
    <div className="flex items-center gap-2">
      <span
        onClick={onTitleClick}
        className={cn(
          'text-xl font-semibold text-t1',
          onTitleClick && 'cursor-pointer hover:text-primary-deep',
        )}
      >
        {title}
      </span>
      {count !== undefined && (
        <span className="px-1.5 py-0.5 rounded-md bg-bg-inset text-t3 text-xs font-medium font-mono">
          {count}
        </span>
      )}
    </div>
    {action && (
      <button
        onClick={action.onClick}
        disabled={action.loading}
        className={cn(
          'flex items-center gap-1 px-3 py-1.5 rounded-lg',
          'bg-bg-hover text-t2 text-sm font-medium transition-colors duration-100',
          action.loading
            ? 'cursor-wait opacity-60'
            : 'cursor-pointer hover:bg-bg-inset',
        )}
      >
        <Plus size={13} strokeWidth={2} />
        {action.loading ? '…' : action.label}
      </button>
    )}
  </div>
);

/** Status pill — right-aligned label for mission/proposal status */
const STATUS_CONFIG: Record<string, { label: string; fg: string; bg: string }> = {
  pending:      { label: '待审批', fg: '#946800', bg: '#FFF3BF' },
  approved:     { label: '已批准', fg: '#1864AB', bg: '#D0EBFF' },
  running:      { label: '执行中', fg: '#1864AB', bg: '#D0EBFF' },
  succeeded:    { label: '已完成', fg: '#1B7A3D', bg: '#D3F9E0' },
  failed:       { label: '失败',   fg: '#C92A2A', bg: '#FFE3E3' },
  cancelled:    { label: '已取消', fg: '#868E96', bg: '#F1F3F5' },
  rejected:     { label: '已拒绝', fg: '#868E96', bg: '#F1F3F5' },
  // Material + Outbox statuses
  'mat-new':    { label: '未读',   fg: '#1864AB', bg: '#D0EBFF' },
  'mat-used':   { label: '已用',   fg: '#1B7A3D', bg: '#D3F9E0' },
  'mat-archived':{ label: '已归档', fg: '#868E96', bg: '#F1F3F5' },
  'ob-draft':   { label: '草稿',   fg: '#946800', bg: '#FFF3BF' },
  'ob-approved':{ label: '已审核', fg: '#1864AB', bg: '#D0EBFF' },
  'ob-exported':{ label: '已导出', fg: '#1B7A3D', bg: '#D3F9E0' },
  'ob-archived':{ label: '已归档', fg: '#868E96', bg: '#F1F3F5' },
};

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || { label: status, fg: '#868E96', bg: '#F1F3F5' };
  return (
    <span
      className="inline-flex items-center px-2 py-[2px] rounded-md text-[10px] font-semibold leading-none flex-shrink-0 whitespace-nowrap"
      style={{ color: cfg.fg, backgroundColor: cfg.bg }}
    >
      {status === 'running' && (
        <span className="w-[5px] h-[5px] rounded-full mr-1 animate-pulse-dot" style={{ backgroundColor: cfg.fg }} />
      )}
      {cfg.label}
    </span>
  );
};

/** Clickable list row used for all list sections */
const ListRow = React.forwardRef<HTMLDivElement, {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}>(({ isActive, onClick, children, className }, ref) => (
  <div
    ref={ref}
    onClick={onClick}
    className={cn(
      'flex overflow-hidden rounded-lg cursor-pointer transition-colors duration-100',
      isActive ? 'bg-bg-hover' : 'bg-transparent hover:bg-bg-hover/60',
      className,
    )}
  >
    {children}
  </div>
));

/** Filter pill tab */
const FilterTab: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={cn(
      'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors duration-100 cursor-pointer border-none',
      active
        ? 'bg-bg-inset text-t1 font-semibold'
        : 'bg-transparent text-t3 hover:bg-bg-hover hover:text-t2',
    )}
  >
    {children}
  </button>
);

/** Debounced search input for panel lists */
const PanelSearch: React.FC<{ value?: string; onChange?: (q: string) => void; placeholder?: string }> = ({ value = '', onChange, placeholder = '搜索…' }) => {
  const [local, setLocal] = React.useState(value);
  const debouncedOnChange = useDebouncedCallback(onChange || (() => {}));
  const handleChange = (v: string) => { setLocal(v); debouncedOnChange(v); };
  React.useEffect(() => { setLocal(value); }, [value]);
  return (
    <div className="px-4 pb-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t4" />
        <input
          value={local}
          onChange={e => handleChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-hover border-none text-sm text-t1 placeholder:text-t4 outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)] transition-shadow"
        />
      </div>
    </div>
  );
};

/** Relative time helper */
function relTime(dateStr: string): string {
  const diffMin = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}小时前`;
  return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// ─── Material quick input ───
const MaterialQuickInput: React.FC<{
  onSubmit?: (data: { url?: string; text?: string; content?: string }) => Promise<void> | void;
}> = ({ onSubmit }) => {
  const [value, setValue] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [mode, setMode] = React.useState<'auto' | 'url+content'>('auto');
  const [urlValue, setUrlValue] = React.useState('');

  const handleSubmit = async () => {
    if (!onSubmit) return;
    setSubmitting(true);
    try {
      if (mode === 'url+content') {
        const u = urlValue.trim();
        const c = value.trim();
        if (!u && !c) return;
        await onSubmit(u ? { url: u, content: c || undefined } as any : { text: c });
        setUrlValue(''); setValue(''); setMode('auto');
      } else {
        const v = value.trim();
        if (!v) return;
        const isUrl = /^https?:\/\//i.test(v);
        await onSubmit(isUrl ? { url: v } : { text: v });
        setValue('');
      }
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  };

  return (
    <div className="px-3 pb-3 pt-2 border-t border-border-1">
      <div className="flex gap-1.5 mb-2">
        <FilterTab active={mode === 'auto'} onClick={() => setMode('auto')}>快速</FilterTab>
        <FilterTab active={mode === 'url+content'} onClick={() => setMode('url+content')}>链接+内容</FilterTab>
      </div>
      {mode === 'url+content' && (
        <input
          value={urlValue}
          onChange={e => setUrlValue(e.target.value)}
          placeholder="链接 (可选)"
          disabled={submitting}
          className="w-full mb-1.5 px-2.5 py-1.5 rounded-md border border-border-1 bg-bg-panel text-t1 text-sm font-mono placeholder:text-t3 outline-none focus:border-[var(--color-primary-deep)]"
        />
      )}
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
        placeholder={mode === 'auto' ? '粘贴链接或写想法… (回车发送)' : '粘贴文章内容… (回车发送)'}
        disabled={submitting}
        className="w-full px-2.5 py-2 rounded-md border border-border-1 bg-bg-panel text-t1 text-sm placeholder:text-t3 outline-none resize-none focus:border-[var(--color-primary-deep)] transition-colors"
        style={{ minHeight: mode === 'url+content' ? 80 : 52, maxHeight: 160 }}
      />
      {submitting && (
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-t3">
          <Loader2 size={11} strokeWidth={2} className="animate-spin" />
          正在抓取和分析…
        </div>
      )}
    </div>
  );
};

// ─── Main component ───
export const SecondaryPanel: React.FC<Props> = React.memo((p) => {
  const stepsOf = (mId: number) => p.steps.filter(s => s.missionId === mId);

  if (p.nav === 'theme') return null;
  if (p.nav === 'signal') return null;

  return (
    <aside
      className="flex flex-col flex-shrink-0 overflow-hidden"
      style={{ width: 300, backgroundColor: 'var(--color-bg-panel)', paddingTop: 48, borderRight: '1px solid var(--color-border-2)' }}
    >
      {/* ═══ AGENTS ═══ */}
      {p.nav === 'agents' && (() => {
        const roots = p.agents.filter(a => !a.parentId);
        const byParent = p.agents.reduce<Record<string, Agent[]>>((acc, a) => {
          if (a.parentId) {
            (acc[a.parentId] ??= []).push(a);
          }
          return acc;
        }, {});
        return (
          <>
            <SectionHead
              title="智能体"
              count={p.agents.length}
              action={{ label: '记忆', onClick: p.onAddMemory, loading: p.loading }}
            />
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {roots.map(root => {
                const children = byParent[root.id] ?? [];
                const hasChildren = children.length > 0;
                return (
                  <div key={root.id} className="mb-1 last:mb-0">
                    <ListRow
                      isActive={root.id === p.activeAgentId}
                      onClick={() => p.onSelectAgent(root.id)}
                      className={hasChildren ? 'rounded-b-none' : undefined}
                    >
                      <div className="flex items-center gap-3 px-3 py-2.5 flex-1 min-w-0">
                        <AgentAvatar id={root.id} name={root.name} size={38} online active={root.id === p.activeAgentId} />
                        <div className="flex-1 min-w-0">
                          <div className="text-base font-semibold text-t1 truncate">{root.name}</div>
                          <div className="text-xs text-t3 truncate mt-0.5">{root.role}</div>
                        </div>
                        {root.id === p.activeAgentId && (
                          <span
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold font-mono flex-shrink-0"
                            style={{ backgroundColor: `${agentHue(root.id)}18`, color: agentHue(root.id) }}
                          >
                            <Brain size={10} strokeWidth={2} />
                            {p.memoryCount}
                          </span>
                        )}
                      </div>
                    </ListRow>
                    {hasChildren && (
                      <div className="border-l-2 ml-5 pl-1 mt-0.5 mb-1 space-y-0.5" style={{ borderColor: 'var(--color-border-2)' }}>
                        {children.map(child => {
                          const isActive = child.id === p.activeAgentId;
                          const hue = agentHue(child.id);
                          return (
                            <ListRow
                              key={child.id}
                              isActive={isActive}
                              onClick={() => p.onSelectAgent(child.id)}
                              className="ml-2 rounded-lg min-h-[48px]"
                            >
                              <div className="flex items-center gap-3 px-2 py-2 flex-1 min-w-0">
                                <AgentAvatar id={child.id} name={child.name} size={32} online active={isActive} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-t1 truncate">{child.name}</div>
                                  <div className="text-2xs text-t4 truncate mt-0.5">{child.role}</div>
                                </div>
                                {isActive && (
                                  <span
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-2xs font-semibold font-mono flex-shrink-0"
                                    style={{ backgroundColor: `${hue}18`, color: hue }}
                                  >
                                    <Brain size={9} strokeWidth={2} />
                                    {p.memoryCount}
                                  </span>
                                )}
                              </div>
                            </ListRow>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* ═══ PIPELINE ═══ */}
      {p.nav === 'pipeline' && (() => {
        const agentName = (id: string) => p.agents.find(a => a.id === id)?.name || id;
        const sa = agentName('sage'), sc = agentName('scout'),
              qu = agentName('quill'), xa = agentName('xalt');

        const stepAgentId = (s: { kind: string; payload?: unknown }) =>
          s.kind === 'draft_social' ? `xalt_${(s.payload as Record<string, unknown>)?.platform || 'tweet'}` : '';
        const STEP_NAMES: Record<string, string> = {
          analyze: `${sa} 分析`, crawl: `${sc} 扫描`,
          write_article: `${qu} 撰写`, draft_social: `${xa} 社交`, roundtable: '团队会议',
        };
        const STEP_RUNNING: Record<string, string> = {
          analyze: `${sa} 分析中…`, crawl: `${sc} 扫描中…`,
          write_article: `${qu} 撰写中…`, draft_social: `${xa} 生成中…`, roundtable: '会议进行中…',
        };
        const stepName = (s: { kind: string; payload?: unknown }) =>
          s.kind === 'draft_social' ? agentName(stepAgentId(s)) : (STEP_NAMES[s.kind] || s.kind).split(' ')[0];

        const missionSummary = (m: Mission): string => {
          const ms = stepsOf(m.id);
          if (m.status === 'pending')   return '等待审批';
          if (m.status === 'approved') {
            const q = ms.find(s => s.status === 'queued');
            return q ? `${q.kind === 'draft_social' ? stepName(q) : STEP_NAMES[q.kind] || q.kind} 排队中` : '准备执行';
          }
          if (m.status === 'running') {
            const r = ms.find(s => s.status === 'running');
            return r ? (r.kind === 'draft_social' ? stepName(r) + ' 生成中…' : STEP_RUNNING[r.kind] || r.kind) : '执行中';
          }
          if (m.status === 'succeeded') {
            const last = [...ms].reverse().find(s => s.status === 'completed' || s.status === 'succeeded');
            return last ? `${last.kind === 'draft_social' ? stepName(last) + ' 完成' : STEP_NAMES[last.kind] || last.kind} 完成` : '全部完成';
          }
          if (m.status === 'failed') {
            const done = ms.filter(s => s.status === 'completed' || s.status === 'succeeded').length;
            return `第${done + 1}步失败`;
          }
          if (m.status === 'cancelled') return '已取消';
          return m.status;
        };

        const sorted = [...p.missions].sort((a, b) => {
          const order: Record<string, number> = { running: 0, approved: 1, failed: 2, pending: 3, succeeded: 4 };
          const diff = (order[a.status] ?? 5) - (order[b.status] ?? 5);
          return diff !== 0 ? diff : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });

        const pendingProposals = p.proposals.filter(pr => pr.status === 'pending' || pr.status === 'rejected');
        const filteredSorted = sorted;

        return (
          <>
            <SectionHead
              title="任务"
              count={p.missions.length}
              action={{ label: '提案', onClick: p.onCreateProposal, loading: p.loading }}
              onTitleClick={() => { p.onSelectMission(null); p.onSelectProposal(null); }}
            />
            {/* Search */}
            <PanelSearch value={p.pipelineSearch} onChange={p.onPipelineSearch} placeholder="搜索任务…" />
            {/* Status filter */}
            <div className="flex gap-1.5 px-5 pb-3 flex-wrap">
              {[
                { key: 'all', label: '全部' },
                { key: 'pending', label: '待处理' },
                { key: 'running', label: '执行中' },
                { key: 'succeeded', label: '已完成' },
                { key: 'failed', label: '失败' },
              ].map(tab => (
                <FilterTab key={tab.key} active={(p.pipelineStatus || 'all') === tab.key} onClick={() => p.onPipelineStatusFilter?.(tab.key)}>
                  {tab.label}
                </FilterTab>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {/* Pending proposals — only show when filter includes them */}
              {(p.pipelineStatus === 'all' || p.pipelineStatus === 'pending' || p.pipelineStatus === 'failed') && pendingProposals.map(pr => {
                const isActive = pr.id === p.selectedProposalId;
                const isPending = pr.status === 'pending';
                return (
                  <ListRow
                    key={`p-${pr.id}`}
                    isActive={isActive}
                    onClick={() => { p.onSelectProposal(pr.id); p.onSelectMission(null); }}
                  >
                    <div className="flex-1 px-3 min-w-0" style={{ height: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn('flex-1 text-sm font-medium truncate', isPending ? 'text-t1' : 'text-t3')}>
                          {pr.title}
                        </span>
                        <StatusPill status={isPending ? 'pending' : 'rejected'} />
                      </div>
                      <div className="text-xs text-t4 truncate">
                        {agentName(pr.agentId || 'minion')} · {relTime(pr.createdAt)}
                      </div>
                    </div>
                  </ListRow>
                );
              })}

              {/* Missions */}
              {filteredSorted.map(m => {
                const isActive = m.id === p.selectedMissionId;
                const summary = missionSummary(m);
                return (
                  <ListRow
                    key={m.id}
                    isActive={isActive}
                    onClick={() => { p.onSelectMission(m.id); p.onSelectProposal(null); }}
                    ref={el => { if (isActive && el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }}
                    className={m.status === 'running' || m.status === 'approved' ? 'animate-row-breathe' : undefined}
                  >
                    <div className="flex-1 px-3 min-w-0" style={{ height: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="flex-1 text-sm font-medium text-t1 truncate">{m.title}</span>
                        <StatusPill status={m.status} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-t3 truncate">{summary}</span>
                        <span className="text-2xs text-t4 flex-shrink-0 ml-auto">{relTime(m.updatedAt)}</span>
                      </div>
                    </div>
                  </ListRow>
                );
              })}

              {pendingProposals.length === 0 && filteredSorted.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-t3 text-sm gap-2">
                  <FileText size={24} strokeWidth={1.5} className="opacity-30" />
                  {p.pipelineSearch ? '未找到匹配的任务' : '暂无任务'}
                </div>
              )}
              {p.missionTotal != null && p.missions.length < p.missionTotal && (
                <div className="py-2 text-center">
                  <button onClick={p.onLoadMoreMissions} className="px-4 py-1.5 rounded-lg bg-bg-hover text-sm text-t3 border-none cursor-pointer hover:bg-bg-inset transition-colors">
                    加载更多 ({p.missions.length}/{p.missionTotal})
                  </button>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* ═══ SETTINGS ═══ */}
      {p.nav === 'settings' && (
        <>
          <SectionHead title="设置" />
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {([
              { key: 'model-config' as SettingsTab,  icon: Cpu,     label: '模型配置', count: p.modelConfigCount },
              { key: 'tools-config' as SettingsTab,  icon: Wrench,  label: '工具配置' },
              { key: 'agents-config' as SettingsTab, icon: Users,   label: '智能体' },
              { key: 'policy' as SettingsTab,        icon: Shield,  label: '策略管理' },
              { key: 'triggers' as SettingsTab,      icon: Zap,     label: '触发规则' },
              { key: 'rss-config' as SettingsTab,    icon: Rss,     label: 'RSS 订阅源' },
            ]).map(item => {
              const isActive = p.settingsTab === item.key;
              return (
                <div
                  key={item.key}
                  onClick={() => p.onSelectSettingsTab?.(item.key)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 mb-1 rounded-md cursor-pointer transition-colors duration-150',
                    isActive
                      ? 'bg-[var(--color-primary-light)]'
                      : 'bg-transparent hover:bg-bg-hover',
                  )}
                >
                  <div
                    className={cn(
                      'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0',
                      isActive ? 'bg-[var(--color-primary-muted)]' : 'bg-bg-inset',
                    )}
                  >
                    <item.icon
                      size={14}
                      strokeWidth={1.8}
                      style={{ color: isActive ? 'var(--color-primary-deep)' : 'var(--color-t3)' }}
                    />
                  </div>
                  <span
                    className={cn('flex-1 text-base', isActive ? 'font-semibold text-t1' : 'font-medium text-t2')}
                  >
                    {item.label}
                  </span>
                  {item.count !== undefined && (
                    <span className="text-xs font-mono text-t2 bg-bg-inset px-1.5 py-0.5 rounded-full">
                      {item.count}
                    </span>
                  )}
                  <ChevronRight size={14} strokeWidth={2} className="text-t4 flex-shrink-0" />
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ═══ OUTBOX ═══ */}
      {p.nav === 'outbox' && (() => {
        const items = p.outboxItems || [];
        const stats = p.outboxStats;
        const filter = p.outboxFilter || 'all';
        const filtered = items;

        const OUTBOX_STATUS_MAP: Record<string, string> = {
          draft: 'ob-draft', approved: 'ob-approved', exported: 'ob-exported', archived: 'ob-archived',
        };

        return (
          <>
            <SectionHead title="发件箱" count={stats?.total ?? items.length} />
            {stats && (
              <div className="flex gap-2 px-5 pb-2 text-xs font-mono">
                <span style={{ color: '#946800', fontWeight: 600 }}>{stats.draft} 待审核</span>
                <span className="text-t4">·</span>
                <span style={{ color: '#1B7A3D', fontWeight: 600 }}>{stats.exported} 已导出</span>
              </div>
            )}
            <div className="flex gap-1.5 px-5 pb-2">
              {[{ key: 'all', label: '全部' }, { key: 'tweet', label: '推文' }, { key: 'article', label: '文章' }].map(t => (
                <FilterTab key={t.key} active={filter === t.key} onClick={() => p.onSetOutboxFilter?.(t.key)}>
                  {t.label}
                </FilterTab>
              ))}
            </div>
            <PanelSearch value={p.outboxSearch} onChange={p.onOutboxSearch} placeholder="搜索内容…" />
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {filtered.map(item => {
                const isActive = p.selectedOutboxId === item.id && p.outboxKind === item.kind;
                const preview = item.kind === 'article'
                  ? (item.title || item.content.slice(0, 60))
                  : item.content.slice(0, 80);
                return (
                  <ListRow
                    key={`${item.kind}-${item.id}`}
                    isActive={isActive}
                    onClick={() => p.onSelectOutbox?.(item.kind, item.id)}
                  >
                    <div className="flex-1 px-3 min-w-0" style={{ height: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="flex-1 text-sm font-medium text-t1 truncate">{preview}</span>
                        <StatusPill status={OUTBOX_STATUS_MAP[item.status] || item.status} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-t4">{PLATFORM_NAMES[item.platform || ''] || (item.kind === 'tweet' ? '推文' : '文章')}</span>
                        <span className="text-2xs text-t4 flex-shrink-0 ml-auto">{relTime(item.createdAt)}</span>
                      </div>
                    </div>
                  </ListRow>
                );
              })}
              {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-t3 text-sm gap-2">
                  <Send size={24} strokeWidth={1.5} className="opacity-30" />
                  {p.outboxSearch ? '未找到匹配内容' : '暂无内容'}
                  {!p.outboxSearch && items.length === 0 && p.onBackfillOutbox && (
                    <button
                      onClick={p.onBackfillOutbox}
                      className="mt-2 px-4 py-1.5 border border-border-1 rounded-md text-sm text-t2 bg-bg-panel hover:border-border-3 cursor-pointer transition-colors"
                    >
                      从历史任务回填
                    </button>
                  )}
                </div>
              )}
              {p.outboxTotal != null && items.length < p.outboxTotal && (
                <div className="py-2 text-center">
                  <button onClick={p.onLoadMoreOutbox} className="px-4 py-1.5 rounded-lg bg-bg-hover text-sm text-t3 border-none cursor-pointer hover:bg-bg-inset transition-colors">
                    加载更多 ({items.length}/{p.outboxTotal})
                  </button>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* ═══ MATERIALS ═══ */}
      {p.nav === 'materials' && (() => {
        const items = p.materials || [];
        const stats = p.materialStats;
        const filter = p.materialFilter || 'all';
        const filtered = items;

        return (
          <>
            <SectionHead
              title="素材箱"
              count={stats?.total ?? items.length}
              action={p.onRefreshRss ? { label: '刷新', onClick: p.onRefreshRss, loading: p.rssRefreshing } : undefined}
            />
            {stats && (
              <div className="flex gap-2 px-5 pb-2 text-xs font-mono text-t3">
                <span>{stats.new} 未读</span>
                <span className="text-t4">·</span>
                <span>{stats.used} 已用</span>
              </div>
            )}
            <div className="flex gap-1.5 px-5 pb-2 flex-wrap">
              {[
                { key: 'all', label: '全部' },
                { key: 'manual', label: '手动' },
                ...(stats?.sources || []).filter(s => s !== 'manual').map(s => ({ key: s, label: s })),
              ].map(tab => (
                <FilterTab key={tab.key} active={filter === tab.key} onClick={() => p.onSetMaterialFilter?.(tab.key)}>
                  {tab.label}
                </FilterTab>
              ))}
            </div>
            <PanelSearch value={p.materialSearch} onChange={p.onMaterialSearch} placeholder="搜索素材…" />
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {filtered.map(item => {
                const isActive = p.selectedMaterialId === item.id;
                const preview = item.title || item.content.slice(0, 60) || item.url || '无标题';
                const matStatus = `mat-${item.status}`;
                return (
                  <ListRow key={item.id} isActive={isActive} onClick={() => p.onSelectMaterial?.(item.id)}>
                    <div className="flex-1 px-3 min-w-0" style={{ height: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="flex-1 text-sm font-medium text-t1 truncate">{preview}</span>
                        <StatusPill status={matStatus} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {item.source && item.source !== 'manual' && (
                          <span className="text-xs text-t4">{item.source}</span>
                        )}
                        {item.source === 'manual' && (
                          <span className="text-xs text-t4">手动</span>
                        )}
                        <span className="text-2xs text-t4 flex-shrink-0 ml-auto">{relTime(item.createdAt)}</span>
                      </div>
                    </div>
                  </ListRow>
                );
              })}
              {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-t3 text-sm gap-2">
                  <Lightbulb size={24} strokeWidth={1.5} className="opacity-30" />
                  {p.materialSearch ? '未找到匹配素材' : '暂无素材'}
                </div>
              )}
              {p.materialTotal != null && items.length < p.materialTotal && (
                <div className="py-2 text-center">
                  <button
                    onClick={p.onLoadMoreMaterials}
                    className="px-4 py-1.5 border border-border-1 rounded-md text-sm text-t2 hover:border-border-3 cursor-pointer transition-colors"
                  >
                    加载更多 ({items.length}/{p.materialTotal})
                  </button>
                </div>
              )}
            </div>
            <MaterialQuickInput onSubmit={p.onCreateMaterial} />
          </>
        );
      })()}

      {/* ═══ ROUNDTABLE ═══ */}
      {p.nav === 'roundtable' && (() => {
        return (
        <>
          <SectionHead
            title="会议"
            count={p.roundtables.length}
            action={{ label: '新建', onClick: p.onCreateRoundtable, loading: p.loading }}
          />
          <PanelSearch value={p.roundtableSearch} onChange={p.onRoundtableSearch} placeholder="搜索会议…" />
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {p.roundtables.map(rt => {
              const isActive = rt.id === p.activeRoundtableId;
              const isRunning = rt.status === 'running';
              const pIds = (rt.participants || '').split(',').filter(Boolean);
              return (
                <ListRow key={rt.id} isActive={isActive} onClick={() => p.onSelectRoundtable(rt.id)}>
                  <div className="flex-1 px-3 min-w-0" style={{ height: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex-1 text-sm font-medium text-t1 truncate">{rt.title}</span>
                      <StatusPill status={isRunning ? 'running' : 'succeeded'} />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-t4">
                      <span>{pIds.length} 位参与者</span>
                      <span>·</span>
                      <span>{rt.format}</span>
                      <span className="ml-auto flex-shrink-0">{relTime(rt.createdAt)}</span>
                    </div>
                  </div>
                </ListRow>
              );
            })}
            {p.roundtables.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-t3 text-sm gap-2">
                <Users size={24} strokeWidth={1.5} className="opacity-30" />
                {p.roundtableSearch ? '未找到匹配会议' : '暂无会话'}
              </div>
            )}
            {p.roundtableTotal != null && p.roundtables.length < p.roundtableTotal && (
              <div className="py-2 text-center">
                <button onClick={p.onLoadMoreRoundtables} className="px-4 py-1.5 rounded-lg bg-bg-hover text-sm text-t3 border-none cursor-pointer hover:bg-bg-inset transition-colors">
                  加载更多 ({p.roundtables.length}/{p.roundtableTotal})
                </button>
              </div>
            )}
          </div>
        </>
        );
      })()}
    </aside>
  );
});

SecondaryPanel.displayName = 'SecondaryPanel';
