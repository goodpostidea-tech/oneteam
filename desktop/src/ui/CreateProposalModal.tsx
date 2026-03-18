import React, { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { api } from '../api';
import { cn } from '../lib/utils';
import type { CreateProposalInput } from '../types';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

const STEP_ACTION: Record<string, string> = {
  analyze: '分析数据', crawl: '扫描资料', write_article: '撰写文章',
  draft_social: '生成社交内容', roundtable: '团队会议',
};

const SOCIAL_PLATFORMS = [
  { id: 'tweet',       name: '推特/X' },
  { id: 'weibo',       name: '微博' },
  { id: 'xiaohongshu', name: '小红书' },
  { id: 'douyin',      name: '抖音' },
  { id: 'zhihu',       name: '知乎' },
  { id: 'toutiao',     name: '今日头条' },
  { id: 'wechat_mp',   name: '公众号' },
];

interface PlanStep {
  kind: string;
  agent: string;
  agentName: string;
  reason: string;
}

interface PlanResult {
  steps: PlanStep[];
  confidence: number;
  method: 'rule' | 'llm';
}

/** 将相同 agent+kind 的连续步骤分组成可折叠块 */
function groupSteps(steps: PlanStep[]): Array<{ type: 'single' | 'group'; steps: PlanStep[]; startIndex: number }> {
  if (!Array.isArray(steps) || steps.length === 0) return [];
  const result: Array<{ type: 'single' | 'group'; steps: PlanStep[]; startIndex: number }> = [];
  let i = 0;
  while (i < steps.length) {
    const first = steps[i];
    if (!first || typeof first !== 'object') { i++; continue; }
    const batch: PlanStep[] = [first];
    while (i + batch.length < steps.length) {
      const next = steps[i + batch.length];
      if (!next || typeof next !== 'object') break;
      if (String(next.agent) === String(first.agent) && String(next.kind) === String(first.kind)) batch.push(next);
      else break;
    }
    result.push({ type: batch.length === 1 ? 'single' : 'group', steps: batch, startIndex: i });
    i += batch.length;
  }
  return result;
}

interface Props {
  onSubmit: (data: CreateProposalInput) => Promise<void>;
  onClose: () => void;
}

export const CreateProposalModal: React.FC<Props> = ({ onSubmit, onClose }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [phase, setPhase] = useState<'input' | 'planning' | 'confirm' | 'submitting'>('input');
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  const groups = useMemo(() => planResult ? groupSteps(planResult.steps) : [], [planResult]);
  const toggleGroup = (idx: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const togglePlatform = (id: string) => {
    setPlatforms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const handlePlan = async () => {
    if (!title.trim()) return;
    setPhase('planning');
    setError(null);
    try {
      const plan = await api.planSteps(title.trim(), description.trim() || undefined, platforms.length > 0 ? platforms : undefined);
      setPlanResult(plan);
      if (plan.confidence >= 0.8) {
        setPhase('submitting');
        await onSubmit({
          title: title.trim(),
          description: description.trim() || undefined,
          platforms: platforms.length > 0 ? platforms : undefined,
          planResult: plan,
        });
        onClose();
      } else {
        setPhase('confirm');
      }
    } catch {
      setError('规划失败，请重试');
      setPhase('input');
    }
  };

  const handleConfirm = async () => {
    setPhase('submitting');
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        platforms: platforms.length > 0 ? platforms : undefined,
        planResult: planResult ?? undefined,
      });
      onClose();
    } catch {
      setError('提交失败');
      setPhase('confirm');
    }
  };

  // ─── Phase: Input / Planning ───
  if (phase === 'input' || phase === 'planning') {
    return (
      <Modal title="创建提案" onClose={onClose}>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-t1 mb-2">你想做什么？</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例如：写一篇关于 AI 趋势的小红书文章"
              autoFocus
              disabled={phase === 'planning'}
              onKeyDown={e => { if (e.key === 'Enter' && title.trim()) handlePlan(); }}
              className={cn(
                'w-full px-4 py-3 rounded-xl text-md text-t1 placeholder:text-t4',
                'bg-bg-hover border-none outline-none transition-shadow duration-150',
                'focus:ring-2 focus:ring-[var(--color-primary-muted)]',
                phase === 'planning' && 'opacity-60',
              )}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-t1 mb-2">补充说明</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="目标受众、风格要求、具体内容…"
              rows={3}
              disabled={phase === 'planning'}
              className={cn(
                'w-full px-4 py-3 rounded-xl text-md text-t1 placeholder:text-t4 resize-none',
                'bg-bg-hover border-none outline-none transition-shadow duration-150',
                'focus:ring-2 focus:ring-[var(--color-primary-muted)]',
                phase === 'planning' && 'opacity-60',
              )}
            />
          </div>

          {/* Platform selector */}
          <div>
            <label className="block text-sm font-semibold text-t1 mb-2">目标平台 <span className="font-normal text-t4">（可选，多选）</span></label>
            <div className="flex flex-wrap gap-2">
              {SOCIAL_PLATFORMS.map(p => {
                const active = platforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlatform(p.id)}
                    disabled={phase === 'planning'}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium border-none cursor-pointer transition-colors duration-100',
                      active ? 'bg-t1 text-white' : 'bg-bg-hover text-t3 hover:bg-bg-inset',
                      phase === 'planning' && 'opacity-60',
                    )}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
            {platforms.length > 0 && (
              <div className="text-2xs text-t4 mt-1.5">
                已选 {platforms.length} 个平台，将为每个平台生成适配内容
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-danger">
              <AlertTriangle size={14} strokeWidth={2} />{error}
            </div>
          )}

          <div className="px-4 py-3 rounded-xl bg-bg-hover text-sm text-t3 leading-relaxed">
            系统会自动分析需求、规划步骤并分配智能体。高置信度任务自动开始执行。
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-md font-medium text-t1 bg-bg-hover border-none cursor-pointer hover:bg-bg-inset transition-colors"
            >
              取消
            </button>
            <button
              onClick={handlePlan}
              disabled={!title.trim() || phase === 'planning'}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-xl text-md font-semibold text-white border-none cursor-pointer transition-opacity',
                'hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {phase === 'planning' ? (
                <>
                  <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                  规划中…
                </>
              ) : '提交'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // ─── Phase: Confirm / Submitting ───
  return (
    <Modal title="确认执行计划" onClose={onClose} width={540}>
      <div className="flex flex-col max-h-[calc(100vh-12rem)] min-h-0">
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-5 pr-1 -mr-1">
          {/* Task summary */}
          <div className="px-4 py-3 rounded-xl bg-bg-hover flex-shrink-0">
            <div className="text-md font-semibold text-t1">{title}</div>
            {description && <div className="text-sm text-t3 mt-1">{description}</div>}
          </div>

          {/* Low-confidence warning */}
          {planResult && planResult.confidence < 0.8 && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-warning-bg text-sm text-warning leading-relaxed flex-shrink-0">
              <AlertTriangle size={16} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
              <span>
                系统对这个任务的理解置信度较低（{((planResult.confidence) * 100).toFixed(0)}%），请确认以下执行计划是否合理。
              </span>
            </div>
          )}

          {/* Step plan: grouped and collapsible */}
          {planResult && (
            <div className="flex-shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-t2">执行计划</span>
                <span className="text-2xs text-t4 bg-bg-hover px-2 py-0.5 rounded-md">
                  {planResult.method === 'rule' ? '规则匹配' : 'LLM 规划'}
                </span>
              </div>
              <div className="space-y-2">
                {groups.map((g, gIdx) => {
                  const first = g.steps[0];
                  if (!first) return null;
                  const agentName = first.agentName ?? first.agent ?? '';
                  const kindLabel = STEP_ACTION[first.kind] ?? first.kind ?? '';
                  const stepLabel = agentName ? `${agentName} · ${kindLabel}` : kindLabel;
                  if (g.type === 'single') {
                    return (
                      <div key={gIdx} className="flex items-start gap-3 p-3.5 rounded-xl bg-bg-hover">
                        <span className="w-6 h-6 rounded-lg bg-bg-inset text-t3 text-xs font-semibold font-mono flex items-center justify-center flex-shrink-0">
                          {g.startIndex + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-t1">{stepLabel}</div>
                          {first.reason && (
                            <div className="text-xs text-t3 mt-1 leading-relaxed">{first.reason}</div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  const isExpanded = expandedGroups.has(gIdx);
                  const count = g.steps.length;
                  return (
                    <div key={gIdx} className="rounded-xl bg-bg-hover overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleGroup(gIdx)}
                        className="w-full flex items-start gap-3 p-3.5 text-left border-none cursor-pointer bg-transparent hover:bg-bg-inset transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown size={16} className="text-t4 flex-shrink-0 mt-0.5" />
                        ) : (
                          <ChevronRight size={16} className="text-t4 flex-shrink-0 mt-0.5" />
                        )}
                        <span className="w-6 h-6 rounded-lg bg-bg-inset text-t3 text-xs font-semibold font-mono flex items-center justify-center flex-shrink-0">
                          {g.startIndex + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-t1">
                            {stepLabel}
                            <span className="text-t4 font-normal ml-1">× {count}</span>
                          </div>
                          {!isExpanded && (
                            <div className="text-xs text-t4 mt-1 truncate">
                              {g.steps.map(s => s.reason).filter(Boolean).join('、')}
                            </div>
                          )}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-3.5 pt-0 pl-12 space-y-2">
                          {g.steps.map((s, i) => (
                            <div key={i} className="flex items-start gap-2 py-2 px-3 rounded-lg bg-bg-inset">
                              <span className="text-2xs text-t4 font-mono flex-shrink-0">
                                {g.startIndex + i + 1}
                              </span>
                              {s.reason && (
                                <div className="text-xs text-t3 leading-relaxed">{s.reason}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && <div className="text-sm text-danger">{error}</div>}
        </div>

        {/* Fixed actions */}
        <div className="flex justify-end gap-3 pt-5 mt-2 border-t border-border-2 flex-shrink-0">
          <button
            onClick={() => { setPhase('input'); setPlanResult(null); setExpandedGroups(new Set()); }}
            className="px-5 py-2.5 rounded-xl text-md font-medium text-t1 bg-bg-hover border-none cursor-pointer hover:bg-bg-inset transition-colors"
          >
            返回修改
          </button>
          <button
            onClick={handleConfirm}
            disabled={phase === 'submitting'}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-md font-semibold text-white border-none cursor-pointer transition-opacity',
              'hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            style={{ backgroundColor: 'var(--color-success)' }}
          >
            {phase === 'submitting' ? (
              <>
                <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                提交中…
              </>
            ) : (
              <>
                <Check size={15} strokeWidth={2.5} />
                确认执行
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
