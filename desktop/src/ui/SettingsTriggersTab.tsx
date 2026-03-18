import React, { useState, useEffect, useCallback } from 'react';
import { T } from './styles';
import { api } from '../api';
import type { TriggerRule } from '../types';
import { ToggleLeft, ToggleRight, Clock, Zap, Rss } from 'lucide-react';

import type { Agent } from '../types';

// ─── RSS Interval Card ───
const RssIntervalCard: React.FC = () => {
  const [minutes, setMinutes] = useState<number>(60);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getPolicies().then(policies => {
      const rss = policies.find(p => p.key === 'rss_interval');
      if (rss?.value?.minutes) setMinutes(rss.value.minutes);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const handleChange = async (val: number) => {
    setMinutes(val);
    setSaving(true);
    try { await api.updatePolicy('rss_interval', { minutes: val }); }
    catch { /* ignore */ }
    finally { setSaving(false); }
  };

  if (!loaded) return null;

  return (
    <div style={{
      backgroundColor: T.bg1, borderRadius: T.r12, border: `1px solid ${T.b1}`,
      padding: `${T.s14}px ${T.s16}px`, marginBottom: T.s12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: T.s8 }}>
          <Rss size={14} strokeWidth={2} color={T.pri} />
          <span style={{ fontSize: T.fs13, fontWeight: T.w6, color: T.t1, fontFamily: T.sans }}>
            RSS 自动刷新频率
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: T.fs11, color: T.t3, fontFamily: T.sans }}>
          <Clock size={11} strokeWidth={2} />
          <span>每</span>
          <select
            value={minutes}
            onChange={e => handleChange(Number(e.target.value))}
            disabled={saving}
            style={{
              padding: '2px 4px', border: `1px solid ${T.b2}`, borderRadius: T.r6,
              fontSize: T.fs11, fontFamily: T.mono, background: T.bg1, color: T.t2,
              cursor: 'pointer', outline: 'none',
            }}
          >
            {[5, 10, 15, 30, 60, 120, 240, 480].map(m => (
              <option key={m} value={m}>{m < 60 ? `${m}分钟` : `${m / 60}小时`}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ fontSize: T.fs11, color: T.t4, fontFamily: T.sans, marginTop: T.s6 }}>
        心跳每 5 分钟运行一次，但 RSS 拉取仅在达到设定间隔后执行。
      </div>
    </div>
  );
};

// ─── Material Consumer Card ───
const MaterialConsumerCard: React.FC = () => {
  const [enabled, setEnabled] = useState(true);
  const [batchSize, setBatchSize] = useState(3);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getPolicies().then(policies => {
      const mc = policies.find(p => p.key === 'material_consumer');
      if (mc?.value) {
        if (mc.value.enabled !== undefined) setEnabled(mc.value.enabled);
        if (mc.value.batch_size) setBatchSize(mc.value.batch_size);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try { await api.updatePolicy('material_consumer', { enabled, batch_size: batchSize, ...patch }); }
    catch { /* ignore */ }
    finally { setSaving(false); }
  };

  if (!loaded) return null;

  return (
    <div style={{
      backgroundColor: T.bg1, borderRadius: T.r12, border: `1px solid ${T.b1}`,
      padding: `${T.s14}px ${T.s16}px`, marginBottom: T.s12,
      opacity: enabled ? 1 : 0.6, transition: 'opacity 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: T.s8 }}>
          <Zap size={14} strokeWidth={2} color={enabled ? T.pri : T.t4} />
          <span style={{ fontSize: T.fs13, fontWeight: T.w6, color: T.t1, fontFamily: T.sans }}>
            素材自动消费
          </span>
          <span style={{
            padding: '2px 8px', borderRadius: T.rFull, fontSize: T.fs11, fontFamily: T.sans,
            backgroundColor: '#FEF3C7', color: '#92400E',
          }}>新素材 → 自动提案</span>
        </div>
        <button
          onClick={() => { const next = !enabled; setEnabled(next); save({ enabled: next }); }}
          disabled={saving}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {enabled
            ? <ToggleRight size={28} color={T.green} />
            : <ToggleLeft size={28} color={T.t4} />
          }
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: T.s16, fontSize: T.fs11, color: T.t3, fontFamily: T.sans, marginTop: T.s8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>每轮最多处理</span>
          <select
            value={batchSize}
            onChange={e => { const v = Number(e.target.value); setBatchSize(v); save({ batch_size: v }); }}
            disabled={saving}
            style={{
              padding: '2px 4px', border: `1px solid ${T.b2}`, borderRadius: T.r6,
              fontSize: T.fs11, fontFamily: T.mono, background: T.bg1, color: T.t2,
              cursor: 'pointer', outline: 'none',
            }}
          >
            {[1, 2, 3, 5, 8, 10].map(n => (
              <option key={n} value={n}>{n}条</option>
            ))}
          </select>
          <span>素材</span>
        </div>
      </div>
      <div style={{ fontSize: T.fs11, color: T.t4, fontFamily: T.sans, marginTop: T.s6 }}>
        心跳自动拾取新素材，由 AI 判断处理方式并创建提案。受配额和 Cap Gates 管控。
      </div>
    </div>
  );
};

const TRIGGER_LABELS: Record<string, string> = {
  proactive_minion_daily_brief: '每日状态汇总',
  proactive_scout_intel_scan: '情报扫描',
  proactive_quill_content: '内容创作',
  proactive_sage_analysis: '深度分析',
  proactive_xalt_social: '社媒内容',
};

function fmtCooldown(sec: number): string {
  if (sec < 3600) return `${Math.round(sec / 60)}分钟`;
  return `${Math.round(sec / 3600)}小时`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '从未';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}分钟前`;
  return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const SettingsTriggersTab: React.FC = () => {
  const [rules, setRules] = useState<TriggerRule[]>([]);
  const [updating, setUpdating] = useState<number | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const AGENT_NAME = Object.fromEntries(agents.map(a => [a.id, a.name]));

  const load = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([api.getTriggers(), api.getAgents()]);
      setRules(r);
      setAgents(a);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (rule: TriggerRule) => {
    setUpdating(rule.id);
    try {
      await api.updateTrigger(rule.id, { enabled: !rule.enabled });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    } catch { /* ignore */ }
    finally { setUpdating(null); }
  };

  const updateCooldown = async (rule: TriggerRule, hours: number) => {
    const sec = Math.max(1800, hours * 3600);
    setUpdating(rule.id);
    try {
      await api.updateTrigger(rule.id, { cooldownSec: sec });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, cooldownSec: sec } : r));
    } catch { /* ignore */ }
    finally { setUpdating(null); }
  };

  // Extract agent id from trigger name
  const agentOf = (name: string): string => {
    const match = name.match(/proactive_(\w+)_/);
    return match ? match[1] : 'unknown';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: T.s12, animation: 'fadeUp 0.25s ease both' }}>
      <div style={{ fontSize: T.fs11, color: T.t4, fontFamily: T.sans, lineHeight: 1.5, marginBottom: T.s8 }}>
        触发规则控制智能体的定时自主行为。启用后，心跳系统每 5 分钟检查一次，满足冷却条件时自动创建提案。
      </div>

      <MaterialConsumerCard />
      <RssIntervalCard />

      {rules.map(rule => {
        const agentId = agentOf(rule.name);
        const cooldownHours = Math.round(rule.cooldownSec / 3600);

        return (
          <div key={rule.id} style={{
            backgroundColor: T.bg1, borderRadius: T.r12, border: `1px solid ${T.b1}`,
            padding: `${T.s14}px ${T.s16}px`,
            opacity: rule.enabled ? 1 : 0.6,
            transition: 'opacity 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: T.s8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: T.s8 }}>
                <Zap size={14} strokeWidth={2} color={rule.enabled ? T.pri : T.t4} />
                <span style={{ fontSize: T.fs13, fontWeight: T.w6, color: T.t1, fontFamily: T.sans }}>
                  {TRIGGER_LABELS[rule.name] || rule.name}
                </span>
                <span style={{
                  padding: '2px 8px', borderRadius: T.rFull, fontSize: T.fs11, fontFamily: T.sans,
                  backgroundColor: T.bg3, color: T.t3,
                }}>
                  {AGENT_NAME[agentId] || agentId}
                </span>
              </div>
              <button
                onClick={() => toggle(rule)}
                disabled={updating === rule.id}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {rule.enabled
                  ? <ToggleRight size={28} color={T.green} />
                  : <ToggleLeft size={28} color={T.t4} />
                }
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: T.s16, fontSize: T.fs11, color: T.t3, fontFamily: T.sans }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} strokeWidth={2} />
                <span>冷却</span>
                <select
                  value={cooldownHours}
                  onChange={e => updateCooldown(rule, Number(e.target.value))}
                  disabled={updating === rule.id}
                  style={{
                    padding: '2px 4px', border: `1px solid ${T.b2}`, borderRadius: T.r6,
                    fontSize: T.fs11, fontFamily: T.mono, background: T.bg1, color: T.t2,
                    cursor: 'pointer', outline: 'none',
                  }}
                >
                  {[1, 2, 4, 6, 8, 12, 24].map(h => (
                    <option key={h} value={h}>{h}小时</option>
                  ))}
                </select>
              </div>
              <span>上次触发: {fmtTime(rule.lastFiredAt)}</span>
            </div>
          </div>
        );
      })}

      {rules.length === 0 && (
        <div style={{ padding: T.s32, textAlign: 'center', color: T.t3, fontSize: T.fs13 }}>
          暂无触发规则
        </div>
      )}
    </div>
  );
};
