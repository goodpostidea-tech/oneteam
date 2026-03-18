import { getDb } from '../db/client';
import { getLogger } from '../util/logger';
import { getPolicy } from './policy';
import { getLowAffinityPairs } from './relationships';
import { AGENTS } from './agents';
import { enqueueRoundtable } from './roundtable';
import { enqueueReactionsForEvent } from './reactions';

const logger = getLogger('mission-finalizer');

export async function maybeFinalizeMissionIfDone(missionId: number): Promise<void> {
  const db = getDb();

  const mission = await db.opsMission.findUnique({
    where: { id: missionId },
    include: { steps: { orderBy: { id: 'asc' } } },
  });

  if (!mission) {
    logger.error(`Mission ${missionId} not found`);
    return;
  }

  const steps = mission.steps;
  if (steps.length === 0) return;

  // 找到刚完成的步骤（最后一个 succeeded/failed 的）
  const justFinished = steps.filter((s) => s.status === 'succeeded' || s.status === 'failed');
  const lastFinished = justFinished[justFinished.length - 1];

  if (!lastFinished) return;

  if (lastFinished.status === 'succeeded') {
    // ─── 成功：激活后续 pending 步骤（draft_social/write_article 并行组一次性全部激活）───
    // 注意：步骤已在 proposal-service 中按 kind 排序（analyze→crawl→roundtable→write_article→draft_social），
    // 同类型步骤连续排列，break 不会截断后续不同类型的步骤组。
    const pendingSteps = steps.filter((s) => s.status === 'pending');
    if (pendingSteps.length > 0) {
      const firstPending = pendingSteps[0];
      const toPromote: typeof pendingSteps = [];

      if (firstPending.kind === 'draft_social' || firstPending.kind === 'write_article') {
        // 同类型步骤可并行，全部激活
        const parallelKind = firstPending.kind;
        for (const s of pendingSteps) {
          if (s.kind === parallelKind) toPromote.push(s);
          else break; // 遇到不同 kind 停止，保持依赖顺序
        }
      } else {
        toPromote.push(firstPending);
      }

      if (toPromote.length > 0) {
        await db.opsMissionStep.updateMany({
          where: { id: { in: toPromote.map((s) => s.id) } },
          data: { status: 'queued' },
        });
        logger.info(
          `Mission ${missionId}: activated ${toPromote.length} step(s) to queued [${toPromote.map((s) => `${s.id}(${s.kind})`).join(', ')}]`,
        );
      }

      // 还有后续步骤，mission 还在运行
      if (mission.status !== 'running') {
        await db.opsMission.update({
          where: { id: missionId },
          data: { status: 'running' },
        });
      }
      return;
    }

    // 没有更多 pending 步骤了，检查是否全部完成
    const allDone = steps.every((s) =>
      s.status === 'succeeded' || s.status === 'failed' || s.status === 'cancelled',
    );

    if (allDone) {
      const hasFailed = steps.some((s) => s.status === 'failed');
      const newStatus = hasFailed ? 'failed' : 'succeeded';

      if (mission.status !== newStatus) {
        await db.opsMission.update({
          where: { id: missionId },
          data: { status: newStatus },
        });

        const finalizedEvent = await db.opsAgentEvent.create({
          data: {
            agentId: mission.createdBy,
            kind: 'mission_finalized',
            title: mission.title,
            summary: newStatus === 'succeeded' ? '所有步骤完成' : newStatus,
            tags: ['mission', newStatus],
            payload: { missionId: mission.id },
          },
        });

        // Trigger reaction matrix for mission_finalized (quill article + xalt social)
        // But skip if this mission itself was created by a reaction (avoid loops)
        if (newStatus === 'succeeded') {
          let source: string | null = null;
          if (mission.proposalId) {
            const proposal = await db.opsMissionProposal.findUnique({
              where: { id: mission.proposalId },
              select: { source: true },
            });
            source = proposal?.source ?? null;
          }
          if (source !== 'reaction') {
            enqueueReactionsForEvent(finalizedEvent.id, 'mission_finalized').catch(() => {});
          }
        }

        logger.info(`Mission ${missionId} finalized as ${newStatus}`);

        // 成功完成 → 有概率触发低亲密度配对辩论
        if (newStatus === 'succeeded') {
          maybeTriggerDebate(mission.title, mission.id).catch(err => {
            logger.error('Auto-debate trigger failed', err);
          });
        }
      }
    }
  } else if (lastFinished.status === 'failed') {
    // ─── 失败：取消所有后续 pending 步骤 ───
    const pendingSteps = steps.filter((s) => s.status === 'pending');
    if (pendingSteps.length > 0) {
      await db.opsMissionStep.updateMany({
        where: {
          id: { in: pendingSteps.map((s) => s.id) },
        },
        data: { status: 'cancelled', error: '前序步骤失败，自动取消' },
      });
      logger.info(`Mission ${missionId}: cancelled ${pendingSteps.length} pending steps due to failure`);
    }

    // 标记 mission 为 failed
    if (mission.status !== 'failed') {
      await db.opsMission.update({
        where: { id: missionId },
        data: { status: 'failed' },
      });

      await db.opsAgentEvent.create({
        data: {
          agentId: mission.createdBy,
          kind: 'mission_finalized',
          title: mission.title,
          summary: '步骤执行失败，后续步骤已取消',
          tags: ['mission', 'failed'],
          payload: { missionId: mission.id },
        },
      });

      logger.info(`Mission ${missionId} finalized as failed`);
    }
  }
}

/**
 * 任务成功后，有 20% 概率触发低亲密度配对辩论
 * Tutorial: "Deliberate low-affinity pairs for interesting debates"
 */
async function maybeTriggerDebate(missionTitle: string, missionId: number): Promise<void> {
  const debatePolicy = await getPolicy('auto_debate', { enabled: true, probability: 0.2 });
  if (!debatePolicy.enabled) return;
  if (Math.random() > (debatePolicy.probability || 0.2)) return;

  const db = getDb();

  // 检查今日辩论数量
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayDebates = await db.opsRoundtableSession.count({
    where: { format: 'debate', createdAt: { gte: todayStart } },
  });
  if (todayDebates >= 3) return;

  // 选择低亲密度配对
  const agentIds = AGENTS.map(a => a.id);
  const lowPairs = await getLowAffinityPairs(agentIds, 1);
  if (lowPairs.length === 0) return;

  const pair = lowPairs[0];
  const participants = [pair.agentA, pair.agentB];

  await enqueueRoundtable({
    title: `辩论: ${missionTitle}`,
    format: 'debate',
    participants,
    description: `基于任务 #${missionId} "${missionTitle}" 的成果进行辩论。两位参与者观点经常不合（亲密度 ${pair.score.toFixed(2)}），期待观点碰撞。`,
  });

  logger.info(`Auto-debate triggered for mission ${missionId}: ${pair.agentA} vs ${pair.agentB} (affinity ${pair.score.toFixed(2)})`);
}
