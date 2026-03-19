import { getDb } from '../db/client';
import { getLogger } from '../util/logger';

const logger = getLogger('policy');

export async function getPolicy<T>(key: string, fallback: T): Promise<T> {
  const db = getDb();
  const row = await db.opsPolicy.findUnique({ where: { key } });
  if (!row) return fallback;
  return row.value as T;
}

export async function setPolicy<T>(key: string, value: T): Promise<void> {
  const db = getDb();
  await db.opsPolicy.upsert({
    where: { key },
    update: { value: value as any },
    create: { key, value: value as any },
  });
}

// ─── 默认策略种子 ───

const DEFAULT_POLICIES: Record<string, unknown> = {
  auto_approve: { enabled: false },
  heartbeat_interval: { minutes: 30 },
  daily_quota: { limit: 20 },
  cap_gates: {
    draft_social: 8,
    write_article: 5,
    crawl: 10,
    analyze: 15,
    roundtable: 5,
    roundtable_max_rounds: 20,
  },
  roundtable_policy: { enabled: true, max_daily: 5 },
  memory_influence: { enabled: true, probability: 0.3 },
  relationship_drift: { enabled: true, max_drift: 0.03 },
  initiative_policy: { enabled: false, cooldown_hours: 4, min_memories: 5 },
  rss_interval: { minutes: 60 },
  material_consumer: { enabled: true, batch_size: 3 },
  auto_debate: { enabled: true, probability: 0.2 },
  default_platforms: { platforms: ['tweet', 'weibo', 'xiaohongshu'] },
  reaction_matrix: {
    mission_created: [
      { targetAgent: 'sage', stepKind: 'analyze', description: '分析新任务的背景和可行性' },
    ],
    mission_finalized: [
      { targetAgent: 'quill', stepKind: 'write_article', description: '根据任务成果撰写文章' },
      { targetAgent: 'xalt', stepKind: 'draft_social', description: '根据任务成果拟推文' },
    ],
    step_succeeded: [
      { targetAgent: 'observer', stepKind: 'analyze', description: '审查步骤产出质量' },
    ],
  },
};

export async function ensureDefaultPolicies(): Promise<void> {
  const db = getDb();
  const existing = await db.opsPolicy.count();
  if (existing > 0) return;

  for (const [key, value] of Object.entries(DEFAULT_POLICIES)) {
    await db.opsPolicy.create({ data: { key, value: value as any } });
  }
  logger.info(`Inserted ${Object.keys(DEFAULT_POLICIES).length} default policies`);
}
