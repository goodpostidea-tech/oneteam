import { getDb } from '../db/client';
import { getLogger } from '../util/logger';
import { getPolicy } from './policy';

const logger = getLogger('relationships');

const DEFAULT_RELATIONSHIPS: { agentA: string; agentB: string; score: number }[] =
  [
    { agentA: 'minion', agentB: 'sage', score: 0.75 },
    { agentA: 'minion', agentB: 'xalt', score: 0.30 },
    { agentA: 'sage', agentB: 'observer', score: 0.80 },
    { agentA: 'sage', agentB: 'xalt', score: 0.25 },
    { agentA: 'quill', agentB: 'xalt', score: 0.70 },
    { agentA: 'scout', agentB: 'quill', score: 0.65 },
    { agentA: 'scout', agentB: 'sage', score: 0.60 },
    { agentA: 'quill', agentB: 'observer', score: 0.45 },
    { agentA: 'minion', agentB: 'scout', score: 0.55 },
    { agentA: 'minion', agentB: 'quill', score: 0.50 },
    { agentA: 'minion', agentB: 'observer', score: 0.65 },
    { agentA: 'sage', agentB: 'quill', score: 0.55 },
    { agentA: 'scout', agentB: 'xalt', score: 0.60 },
    { agentA: 'scout', agentB: 'observer', score: 0.50 },
    { agentA: 'observer', agentB: 'xalt', score: 0.30 },
  ];

export async function ensureDefaultRelationships(): Promise<void> {
  const db = getDb();
  const count = await db.opsAgentRelationship.count();
  if (count > 0) return;

  await db.opsAgentRelationship.createMany({
    data: DEFAULT_RELATIONSHIPS.map((r) => ({
      agentA: r.agentA < r.agentB ? r.agentA : r.agentB,
      agentB: r.agentA < r.agentB ? r.agentB : r.agentA,
      score: r.score,
    })),
  });

  logger.info('Inserted default agent relationships');
}

/**
 * 查询两个 agent 之间的亲密度（0.10-0.95），不存在则返回 0.5
 */
export async function getAffinityScore(a: string, b: string): Promise<number> {
  const db = getDb();
  const [agentA, agentB] = a < b ? [a, b] : [b, a];

  const rel = await db.opsAgentRelationship.findUnique({
    where: { agentA_agentB: { agentA, agentB } },
  });

  return rel?.score ?? 0.5;
}

/**
 * 获取低亲密度配对，用于辩论（观点碰撞更有趣）
 * 返回按亲密度升序排列的 agent 对
 */
export async function getLowAffinityPairs(
  agentIds: string[],
  limit = 3,
): Promise<{ agentA: string; agentB: string; score: number }[]> {
  const db = getDb();
  const pairs: { agentA: string; agentB: string; score: number }[] = [];

  for (let i = 0; i < agentIds.length; i++) {
    for (let j = i + 1; j < agentIds.length; j++) {
      const [a, b] = agentIds[i] < agentIds[j]
        ? [agentIds[i], agentIds[j]]
        : [agentIds[j], agentIds[i]];
      const rel = await db.opsAgentRelationship.findUnique({
        where: { agentA_agentB: { agentA: a, agentB: b } },
      });
      pairs.push({ agentA: agentIds[i], agentB: agentIds[j], score: rel?.score ?? 0.5 });
    }
  }

  return pairs.sort((a, b) => a.score - b.score).slice(0, limit);
}

/**
 * 获取高亲密度配对，用于闲聊
 */
export async function getHighAffinityPairs(
  agentIds: string[],
  limit = 3,
): Promise<{ agentA: string; agentB: string; score: number }[]> {
  const db = getDb();
  const pairs: { agentA: string; agentB: string; score: number }[] = [];

  for (let i = 0; i < agentIds.length; i++) {
    for (let j = i + 1; j < agentIds.length; j++) {
      const [a, b] = agentIds[i] < agentIds[j]
        ? [agentIds[i], agentIds[j]]
        : [agentIds[j], agentIds[i]];
      const rel = await db.opsAgentRelationship.findUnique({
        where: { agentA_agentB: { agentA: a, agentB: b } },
      });
      pairs.push({ agentA: agentIds[i], agentB: agentIds[j], score: rel?.score ?? 0.5 });
    }
  }

  return pairs.sort((a, b) => b.score - a.score).slice(0, limit);
}

export interface RelationshipDrift {
  agentA: string;
  agentB: string;
  drift: number;
  reason: string;
}

/**
 * 应用亲密度漂移。约束：每次 ±0.03 max，下限 0.10，上限 0.95
 */
export async function applyRelationshipDrifts(drifts: RelationshipDrift[]): Promise<void> {
  const db = getDb();
  const policy = await getPolicy('relationship_drift', { enabled: true, max_drift: 0.03 });
  if (!policy.enabled) return;

  const maxDrift = policy.max_drift || 0.03;

  for (const d of drifts) {
    const [agentA, agentB] = d.agentA < d.agentB ? [d.agentA, d.agentB] : [d.agentB, d.agentA];
    const clampedDrift = Math.max(-maxDrift, Math.min(maxDrift, d.drift));

    const existing = await db.opsAgentRelationship.findUnique({
      where: { agentA_agentB: { agentA, agentB } },
    });

    if (!existing) {
      const newScore = Math.max(0.10, Math.min(0.95, 0.5 + clampedDrift));
      await db.opsAgentRelationship.create({
        data: { agentA, agentB, score: newScore },
      });
    } else {
      const newScore = Math.max(0.10, Math.min(0.95, existing.score + clampedDrift));
      await db.opsAgentRelationship.update({
        where: { agentA_agentB: { agentA, agentB } },
        data: { score: newScore },
      });
    }

    logger.info(`Relationship drift: ${agentA}↔${agentB} ${clampedDrift > 0 ? '+' : ''}${clampedDrift.toFixed(3)} (${d.reason})`);
  }
}
