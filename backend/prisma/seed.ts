/**
 * Seed script — initializes a fresh database with default data.
 * Run: npx tsx prisma/seed.ts
 *
 * Safe to run multiple times — all operations are idempotent (skip if data exists).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ─── 1. Default policies ───
  const policyCount = await db.opsPolicy.count();
  if (policyCount === 0) {
    const policies: Record<string, unknown> = {
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
    for (const [key, value] of Object.entries(policies)) {
      await db.opsPolicy.create({ data: { key, value: value as any } });
    }
    console.log(`  ✓ Inserted ${Object.keys(policies).length} policies`);
  } else {
    console.log(`  · Policies already exist (${policyCount}), skipping`);
  }

  // ─── 2. Default agent relationships ───
  const relCount = await db.opsAgentRelationship.count();
  if (relCount === 0) {
    const pairs: { agentA: string; agentB: string; score: number }[] = [
      // Core team relationships
      { agentA: 'minion', agentB: 'sage',  score: 0.65 },
      { agentA: 'minion', agentB: 'scout', score: 0.60 },
      { agentA: 'minion', agentB: 'quill', score: 0.55 },
      { agentA: 'minion', agentB: 'xalt',  score: 0.50 },
      { agentA: 'sage',   agentB: 'scout', score: 0.70 },
      { agentA: 'sage',   agentB: 'quill', score: 0.40 }, // low affinity → debate material
      { agentA: 'sage',   agentB: 'xalt',  score: 0.35 }, // low affinity → debate material
      { agentA: 'scout',  agentB: 'quill', score: 0.55 },
      { agentA: 'scout',  agentB: 'xalt',  score: 0.60 },
      { agentA: 'quill',  agentB: 'xalt',  score: 0.50 },
    ];
    await db.opsAgentRelationship.createMany({
      data: pairs.map(r => ({
        agentA: r.agentA < r.agentB ? r.agentA : r.agentB,
        agentB: r.agentA < r.agentB ? r.agentB : r.agentA,
        score: r.score,
      })),
    });
    console.log(`  ✓ Inserted ${pairs.length} agent relationships`);
  } else {
    console.log(`  · Relationships already exist (${relCount}), skipping`);
  }

  // ─── 3. Default trigger rules ───
  const triggerCount = await db.opsTriggerRule.count();
  if (triggerCount === 0) {
    const triggers = [
      { name: '任务成功后自动辩论', kind: 'mission_success_debate', eventFilter: { kind: 'mission_succeeded' }, enabled: false, cooldownSec: 3600 },
      { name: '素材驱动提案', kind: 'material_proposal', eventFilter: { kind: 'material_ready' }, enabled: false, cooldownSec: 1800 },
      { name: '每日站会', kind: 'daily_standup', eventFilter: { kind: 'cron_daily' }, enabled: false, cooldownSec: 86400 },
      { name: '低亲密度自动辩论', kind: 'low_affinity_debate', eventFilter: { kind: 'step_succeeded' }, enabled: false, cooldownSec: 7200 },
      { name: '周度复盘', kind: 'weekly_review', eventFilter: { kind: 'cron_weekly' }, enabled: false, cooldownSec: 604800 },
    ];
    for (const t of triggers) {
      await db.opsTriggerRule.create({
        data: {
          name: t.name,
          kind: t.kind,
          eventFilter: t.eventFilter as any,
          enabled: t.enabled,
          cooldownSec: t.cooldownSec,
        },
      });
    }
    console.log(`  ✓ Inserted ${triggers.length} trigger rules`);
  } else {
    console.log(`  · Triggers already exist (${triggerCount}), skipping`);
  }

  // ─── 4. Initial agent memories (starter knowledge) ───
  const memCount = await db.opsAgentMemory.count();
  if (memCount === 0) {
    const memories = [
      { agentId: 'sage', kind: 'strategy', content: '分析任务时应先确认目标受众和核心信息，再展开数据收集。', confidence: 0.8, tags: ['workflow', 'analysis'] },
      { agentId: 'scout', kind: 'insight', content: '信息源的多样性比单一权威来源更能降低偏见风险。', confidence: 0.75, tags: ['research', 'methodology'] },
      { agentId: 'quill', kind: 'preference', content: '长文开头用故事 hook 比直接列数据更能留住读者。', confidence: 0.85, tags: ['writing', 'engagement'] },
      { agentId: 'xalt', kind: 'pattern', content: '带具体数字的推文互动率比纯文字高 40%。', confidence: 0.7, tags: ['social', 'engagement'] },
      { agentId: 'minion', kind: 'strategy', content: '复杂任务应先拆解为独立子任务再分配，避免串行阻塞。', confidence: 0.9, tags: ['coordination', 'workflow'] },
    ];
    for (const m of memories) {
      await db.opsAgentMemory.create({
        data: {
          agentId: m.agentId,
          kind: m.kind,
          content: m.content,
          confidence: m.confidence,
          tags: m.tags as any,
        },
      });
    }
    console.log(`  ✓ Inserted ${memories.length} starter memories`);
  } else {
    console.log(`  · Memories already exist (${memCount}), skipping`);
  }

  console.log('Seed complete.');
}

main()
  .catch(e => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => db.$disconnect());
