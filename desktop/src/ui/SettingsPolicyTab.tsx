import React, { useState, useEffect, useCallback } from 'react';
import { T } from './styles';
import { api } from '../api';
import { cn } from '../lib/utils';

interface PolicyData {
  auto_approve: { enabled: boolean };
  daily_quota: { limit: number };
  cap_gates: Record<string, number>;
}

const CAP_LABELS: Record<string, string> = {
  analyze: '分析数据', crawl: '扫描资料', write_article: '撰写文章',
  draft_social: '生成社交内容', roundtable: '团队会议', roundtable_max_rounds: '单次会议最大消息数',
};

const CAP_DEFAULTS: Record<string, number> = {
  analyze: 15, crawl: 10, write_article: 5,
  draft_social: 8, roundtable: 5, roundtable_max_rounds: 20,
};

const CAP_UNITS: Record<string, string> = {
  roundtable_max_rounds: '条/次',
};

export const SettingsPolicyTab: React.FC = () => {
  const [data, setData] = useState<PolicyData>({
    auto_approve: { enabled: true },
    daily_quota: { limit: 20 },
    cap_gates: {},
  });
  const [saving, setSaving] = useState<string | null>(null);

  const loadPolicies = useCallback(async () => {
    try {
      const rows = await api.getPolicies();
      const map: Record<string, any> = {};
      for (const r of rows) map[r.key] = r.value;
      setData({
        auto_approve: map.auto_approve || { enabled: true },
        daily_quota: map.daily_quota || { limit: 20 },
        cap_gates: { ...CAP_DEFAULTS, ...(map.cap_gates || {}) },
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  const save = async (key: string, value: any) => {
    setSaving(key);
    try { await api.updatePolicy(key, value); } catch { /* ignore */ }
    finally { setSaving(null); }
  };

  const toggleAutoApprove = () => {
    const next = { ...data.auto_approve, enabled: !data.auto_approve.enabled };
    setData(d => ({ ...d, auto_approve: next }));
    save('auto_approve', next);
  };

  const updateQuota = (limit: number) => {
    const next = { limit };
    setData(d => ({ ...d, daily_quota: next }));
    save('daily_quota', next);
  };

  const updateCapGate = (kind: string, limit: number) => {
    const next = { ...data.cap_gates, [kind]: limit };
    setData(d => ({ ...d, cap_gates: next }));
    save('cap_gates', next);
  };

  return (
    <div className="max-w-2xl animate-fade-up space-y-4">
      {/* Auto Approve */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-md font-semibold text-t1 mb-1">自动审批</h3>
            <p className="text-xs text-t3">置信度 ≥ 80% 的提案自动通过</p>
          </div>
          <button
            onClick={toggleAutoApprove}
            className={cn(
              'w-11 h-6 rounded-full border-none cursor-pointer transition-colors duration-200 relative',
              data.auto_approve.enabled ? 'bg-t1' : 'bg-bg-inset',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-xs transition-transform duration-200',
                data.auto_approve.enabled ? 'translate-x-[22px]' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>
      </div>

      {/* Daily Quota */}
      <div className="card p-6">
        <h3 className="text-md font-semibold text-t1 mb-1">每日配额</h3>
        <div className="flex items-center justify-between">
          <p className="text-sm text-t3">每个智能体每天最多发起的提案数</p>
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={100}
              value={data.daily_quota.limit}
              onChange={e => { const v = Number(e.target.value); if (v > 0) setData(d => ({ ...d, daily_quota: { limit: v } })); }}
              onBlur={() => updateQuota(data.daily_quota.limit)}
              className="w-16 px-2.5 py-1.5 rounded-lg bg-bg-hover border-none text-sm font-mono text-t1 text-center outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)]"
            />
            <span className="text-xs text-t4">条/天</span>
          </div>
        </div>
      </div>

      {/* Cap Gates */}
      <div className="card p-6">
        <h3 className="text-md font-semibold text-t1 mb-1">步骤类型限额</h3>
        <p className="text-xs text-t3 mb-4">每种步骤类型每天最多执行的次数</p>
        <div className="space-y-3">
          {Object.entries(CAP_LABELS).map(([kind, label]) => (
            <div key={kind} className="flex items-center justify-between">
              <span className="text-sm text-t2">{label}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={1} max={100}
                  value={data.cap_gates[kind] ?? CAP_DEFAULTS[kind] ?? 10}
                  onChange={e => { const v = Number(e.target.value); if (v > 0) setData(d => ({ ...d, cap_gates: { ...d.cap_gates, [kind]: v } })); }}
                  onBlur={() => updateCapGate(kind, data.cap_gates[kind] ?? CAP_DEFAULTS[kind] ?? 10)}
                  className="w-16 px-2.5 py-1.5 rounded-lg bg-bg-hover border-none text-sm font-mono text-t1 text-center outline-none focus:ring-2 focus:ring-[var(--color-primary-muted)]"
                />
                <span className="text-xs text-t4 w-8">{CAP_UNITS[kind] || '次/天'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
