import { getDb } from '../db/client';
import type { Prisma } from '@prisma/client';
import { getLogger } from '../util/logger';
import { enqueueReactionsForEvent } from './reactions';
import { getPolicy } from './policy';
import type { PlanResult } from '../llm/step-planner';
import { expandPlatformSteps, decideContentPlatforms } from '../llm/step-planner';
import { triggerWorkerTick } from './worker-runner';

const logger = getLogger('proposal-service');

export interface CreateProposalInput {
  title: string;
  description?: string;
  source: 'api' | 'trigger' | 'reaction' | 'initiative' | 'material';
  agentId: string;          // 提案发起者（用户提交='boss'，agent 发起=agentId）
  planResult: PlanResult;   // 自动规划结果
  materialId?: number;      // 关联素材
}

export interface CreateProposalResult {
  proposalId: number;
  missionId?: number;
  autoApproved: boolean;
  status: 'pending' | 'accepted' | 'rejected';
  reason?: string;
}

export async function createProposal(
  input: CreateProposalInput,
): Promise<CreateProposalResult> {
  const db = getDb();

  // ─── 1. 每日配额检查 ───
  const quotaPolicy = await getPolicy('daily_quota', { limit: 20 });
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayCount = await db.opsMissionProposal.count({
    where: {
      agentId: input.agentId,
      createdAt: { gte: todayStart },
    },
  });

  if (todayCount >= quotaPolicy.limit) {
    logger.info(`Agent ${input.agentId} exceeded daily quota (${todayCount}/${quotaPolicy.limit}), rejecting`);
    const reason = `每日配额已满 (${todayCount}/${quotaPolicy.limit})`;
    const rejected = await db.opsMissionProposal.create({
      data: {
        agentId: input.agentId,
        title: input.title,
        description: input.description,
        status: 'rejected',
        rejectReason: reason,
        source: input.source,
        materialId: input.materialId || null,
        proposedSteps: input.planResult as unknown as Prisma.InputJsonValue,
      },
    });
    return {
      proposalId: rejected.id,
      autoApproved: false,
      status: 'rejected',
      reason,
    };
  }

  // ─── 2. Cap Gates 检查（按步骤类型限流） ───
  const capGates = await getPolicy<Record<string, number>>('cap_gates', {});
  for (const step of input.planResult.steps) {
    const limit = capGates[step.kind];
    if (limit === undefined) continue;

    const todayStepCount = await db.opsMissionStep.count({
      where: {
        kind: step.kind,
        createdAt: { gte: todayStart },
        status: { in: ['queued', 'running', 'succeeded'] },
      },
    });

    if (todayStepCount >= limit) {
      logger.info(`Cap gate hit for ${step.kind} (${todayStepCount}/${limit}), rejecting`);
      const reason = `${step.kind} 今日配额已满 (${todayStepCount}/${limit})`;
      const rejected = await db.opsMissionProposal.create({
        data: {
          agentId: input.agentId,
          title: input.title,
          description: input.description,
          status: 'rejected',
          rejectReason: reason,
          source: input.source,
          proposedSteps: input.planResult as unknown as Prisma.InputJsonValue,
        },
      });
      return {
        proposalId: rejected.id,
        autoApproved: false,
        status: 'rejected',
        reason,
      };
    }
  }

  // ─── 3. 创建提案 ───
  const proposal = await db.opsMissionProposal.create({
    data: {
      agentId: input.agentId,
      title: input.title,
      description: input.description,
      status: 'pending',
      source: input.source,
      materialId: input.materialId || null,
      proposedSteps: input.planResult as unknown as Prisma.InputJsonValue,
    },
  });

  // ─── 4. 审批决策：confidence ≥ 0.8 且策略允许 → 自动通过 ───
  const autoApprovePolicy = await getPolicy('auto_approve', { enabled: false });
  const autoApprove =
    autoApprovePolicy.enabled && input.planResult.confidence >= 0.8;

  if (!autoApprove) {
    logger.info(
      `Proposal ${proposal.id} pending (confidence=${input.planResult.confidence.toFixed(2)}, autoApprove=${autoApprovePolicy.enabled})`,
    );
    return {
      proposalId: proposal.id,
      autoApproved: false,
      status: 'pending',
    };
  }

  // ─── 5. 自动通过：创建 mission + steps ───
  const { mission, stepsCreated } = await createMissionFromProposal(proposal.id);

  // 更新提案状态
  await db.opsMissionProposal.update({
    where: { id: proposal.id },
    data: { status: 'accepted' },
  });

  // 写事件
  const event = await db.opsAgentEvent.create({
    data: {
      agentId: input.agentId,
      kind: 'mission_created',
      title: mission.title,
      summary: `自动审批通过（置信度 ${(input.planResult.confidence * 100).toFixed(0)}%）`,
      tags: ['mission', 'auto_approved'],
      payload: { missionId: mission.id, proposalId: proposal.id },
    },
  });

  await enqueueReactionsForEvent(event.id, 'mission_created');

  logger.info(
    `Proposal ${proposal.id} auto-approved as mission ${mission.id} (${stepsCreated} steps)`,
  );

  return {
    proposalId: proposal.id,
    missionId: mission.id,
    autoApproved: true,
    status: 'accepted',
  };
}

// ─── 从已有提案创建 mission + steps（审批和自动通过共用） ───
export async function createMissionFromProposal(proposalId: number) {
  const db = getDb();

  const proposal = await db.opsMissionProposal.findUniqueOrThrow({
    where: { id: proposalId },
  });

  const planData = proposal.proposedSteps as any;
  let steps: any[] = planData?.steps || (Array.isArray(planData) ? planData : []);

  // 自动展开平台步骤：如果步骤没有指定 platform，从 policy 读默认平台集展开为子智能体
  const hasUnexpandedSteps = steps.some(
    (s: any) => (s.kind === 'draft_social' || s.kind === 'write_article') && !s.platform,
  );
  if (hasUnexpandedSteps) {
    const platformPolicy = await getPolicy<{ platforms: string[] }>('default_platforms', { platforms: [] });
    let targetPlatforms = platformPolicy.platforms;

    // 如果没有配置默认平台，让父智能体决策
    if (targetPlatforms.length === 0) {
      const decision = await decideContentPlatforms(proposal.title, proposal.description || undefined);
      targetPlatforms = decision.platforms;
      if (targetPlatforms.length > 0) {
        logger.info(`Auto-decided platforms for "${proposal.title}": ${targetPlatforms.join(', ')} (${decision.reasoning})`);
      }
    }

    if (targetPlatforms.length > 0) {
      steps = await expandPlatformSteps(steps, targetPlatforms);
    }
  }

  // 如果关联了素材，加载素材内容用于注入 step payload
  let materialContext: { title: string; url?: string; summary?: string; content: string } | null = null;
  if (proposal.materialId) {
    const mat = await db.opsMaterial.findUnique({ where: { id: proposal.materialId } });
    if (mat) {
      materialContext = {
        title: mat.title || '',
        url: mat.url || undefined,
        summary: mat.summary || undefined,
        content: mat.content.slice(0, 6000),
      };
    }
  }

  // 按 kind 稳定排序，确保步骤链顺序正确（避免 draft_social 夹在中间被截断）
  const STEP_ORDER: Record<string, number> = {
    analyze: 0, crawl: 1, roundtable: 2, write_article: 3, draft_social: 4,
  };
  steps.sort((a: any, b: any) => (STEP_ORDER[a.kind] ?? 99) - (STEP_ORDER[b.kind] ?? 99));

  const mission = await db.opsMission.create({
    data: {
      proposalId: proposal.id,
      title: proposal.title,
      status: 'approved',
      createdBy: proposal.agentId,
    },
  });

  let stepsCreated = 0;
  if (steps.length > 0) {
    await db.opsMissionStep.createMany({
      data: steps.map((step: any, i: number) => ({
        missionId: mission.id,
        kind: step.kind || 'analyze',
        status: i === 0 ? 'queued' : 'pending',
        payload: {
          topic: proposal.title,
          description: proposal.description || undefined,
          reason: step.reason || undefined,
          ...(step.agent ? { assignedAgent: step.agent } : {}),
          ...(step.platform ? { platform: step.platform } : {}),
          ...(materialContext ? { materialContext } : {}),
        } as Prisma.InputJsonValue,
      })),
    });
    stepsCreated = steps.length;
  }

  // 立即触发 worker，不等下一个 tick
  setImmediate(() => triggerWorkerTick());

  return { mission, stepsCreated };
}
