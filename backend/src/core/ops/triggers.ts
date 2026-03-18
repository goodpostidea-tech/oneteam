import { getDb } from '../db/client';
import { getLogger } from '../util/logger';
import { createProposal } from './proposal-service';
import { STEP_AGENT_MAP } from '../llm/step-planner';
import type { Prisma } from '@prisma/client';

const logger = getLogger('triggers');

// ─── 触发规则执行逻辑 ───

interface TriggerConfig {
  agentId: string;
  title: string;
  description: string;
  steps: Array<{ kind: string; payload?: Record<string, unknown> }>;
  skipProbability?: number; // 跳过概率 (0-1)
  jitterMinutes?: [number, number]; // 抖动范围 [min, max]
}

// 根据规则名映射到具体的提案生成逻辑
const TRIGGER_HANDLERS: Record<string, TriggerConfig> = {
  proactive_minion_daily_brief: {
    agentId: 'minion',
    title: '每日状态汇总与优先级对齐',
    description: 'Minion 定期汇总团队进展，梳理优先级。',
    steps: [{ kind: 'analyze', payload: { reason: 'daily_brief' } }],
    skipProbability: 0.1,
    jitterMinutes: [0, 15],
  },
  proactive_scout_intel_scan: {
    agentId: 'scout',
    title: '情报扫描：行业动态与趋势',
    description: 'Scout 扫描最新行业情报，发现可能的机会和风险。',
    steps: [{ kind: 'crawl', payload: { reason: 'intel_scan' } }],
    skipProbability: 0.12,
    jitterMinutes: [10, 30],
  },
  proactive_quill_content: {
    agentId: 'quill',
    title: '内容创作：基于近期洞察撰写文章',
    description: 'Quill 根据近期团队讨论的洞察，创作一篇内容。',
    steps: [
      { kind: 'analyze', payload: { reason: 'content_planning' } },
      { kind: 'write_article', payload: { reason: 'proactive_content' } },
    ],
    skipProbability: 0.15,
    jitterMinutes: [15, 45],
  },
  proactive_sage_analysis: {
    agentId: 'sage',
    title: '深度分析：近期数据与策略评估',
    description: 'Sage 对近期数据和策略进行深度分析。',
    steps: [{ kind: 'analyze', payload: { reason: 'strategic_review' } }],
    skipProbability: 0.1,
    jitterMinutes: [5, 25],
  },
  proactive_xalt_social: {
    agentId: 'xalt',
    title: '社媒内容：生成推文文案',
    description: 'Xalt 根据近期话题生成社交媒体内容。',
    steps: [{ kind: 'draft_social', payload: { reason: 'proactive_social', platform: 'tweet' } }],
    skipProbability: 0.12,
    jitterMinutes: [10, 35],
  },
};

async function shouldFireTrigger(
  rule: { id: number; cooldownSec: number; lastFiredAt: Date | null },
): Promise<boolean> {
  if (!rule.lastFiredAt) return true;
  const now = Date.now();
  const last = rule.lastFiredAt.getTime();
  return now - last > rule.cooldownSec * 1000;
}

export async function ensureDefaultTriggers(): Promise<void> {
  const db = getDb();
  const count = await db.opsTriggerRule.count();
  if (count > 0) return;

  const defaultRules: Prisma.OpsTriggerRuleCreateInput[] = [
    {
      name: 'proactive_minion_daily_brief',
      kind: 'proactive',
      eventFilter: { type: 'time' },
      enabled: true,
      cooldownSec: 60 * 60 * 4, // 4 小时
    },
    {
      name: 'proactive_scout_intel_scan',
      kind: 'proactive',
      eventFilter: { type: 'time' },
      enabled: true,
      cooldownSec: 60 * 60 * 6, // 6 小时
    },
    {
      name: 'proactive_quill_content',
      kind: 'proactive',
      eventFilter: { type: 'time' },
      enabled: true,
      cooldownSec: 60 * 60 * 8, // 8 小时
    },
    {
      name: 'proactive_sage_analysis',
      kind: 'proactive',
      eventFilter: { type: 'time' },
      enabled: true,
      cooldownSec: 60 * 60 * 6, // 6 小时
    },
    {
      name: 'proactive_xalt_social',
      kind: 'proactive',
      eventFilter: { type: 'time' },
      enabled: true,
      cooldownSec: 60 * 60 * 4, // 4 小时
    },
  ];

  await db.opsTriggerRule.createMany({ data: defaultRules });
  logger.info(`Inserted ${defaultRules.length} default trigger rules`);
}

export async function evaluateTriggers(): Promise<void> {
  const db = getDb();

  const rules = await db.opsTriggerRule.findMany({
    where: { enabled: true },
  });

  for (const rule of rules) {
    if (!(await shouldFireTrigger(rule))) continue;

    const handler = TRIGGER_HANDLERS[rule.name];
    if (!handler) {
      logger.warn(`No handler for trigger rule: ${rule.name}`);
      continue;
    }

    // 跳过概率
    if (handler.skipProbability && Math.random() < handler.skipProbability) {
      logger.info(`Trigger ${rule.name} skipped (random skip ${(handler.skipProbability * 100).toFixed(0)}%)`);
      continue;
    }

    // 抖动：如果设置了抖动范围，检查是否应该延迟
    if (handler.jitterMinutes) {
      const [min, max] = handler.jitterMinutes;
      const jitterMs = (min + Math.random() * (max - min)) * 60 * 1000;
      const timeSinceLastFire = rule.lastFiredAt
        ? Date.now() - rule.lastFiredAt.getTime()
        : Infinity;

      // 如果刚过了冷却时间不久，用抖动让触发更自然
      if (timeSinceLastFire < rule.cooldownSec * 1000 + jitterMs) {
        continue;
      }
    }

    logger.info(`Trigger firing: ${rule.name}`);

    try {
      await createProposal({
        agentId: handler.agentId,
        title: handler.title,
        description: handler.description,
        source: 'trigger',
        planResult: {
          steps: handler.steps.map((s) => ({
            kind: s.kind,
            agent: STEP_AGENT_MAP[s.kind] || handler.agentId,
            agentName: STEP_AGENT_MAP[s.kind] || handler.agentId,
            reason: s.kind,
          })),
          confidence: 0.9,
          method: 'rule',
        },
      });

      await db.opsTriggerRule.update({
        where: { id: rule.id },
        data: { lastFiredAt: new Date() },
      });
    } catch (error) {
      logger.error(`Trigger ${rule.name} failed`, error);
    }
  }
}
