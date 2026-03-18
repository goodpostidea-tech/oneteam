import { getDb } from '../db/client';
import { getLogger } from '../util/logger';
import { maybeFinalizeMissionIfDone } from './mission-finalizer';
import { dispatchStep } from '../llm/dispatcher';
import { extractMemoriesFromStepResult } from '../llm/memory-extractor';
import { STEP_AGENT_MAP } from '../llm/step-planner';
import { PLATFORM_TO_AGENT } from './agents';
import { saveToOutbox } from './outbox-writer';
import { applyRelationshipDrifts } from './relationships';
import { enqueueReactionsForEvent } from './reactions';

const logger = getLogger('worker-runner');

// ─── 熔断器 ───
let consecutiveFailures = 0;
let circuitBreakerUntil = 0;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000; // 60 秒

/** 解析步骤对应的 agentId */
function resolveStepAgentId(step: { kind: string; payload?: unknown }): string {
  const payload = step.payload as Record<string, unknown> | undefined;
  // 优先使用 payload 中显式指定的 agent（来自 expandPlatformSteps）
  if (payload?.assignedAgent && typeof payload.assignedAgent === 'string') {
    return payload.assignedAgent;
  }
  if (step.kind === 'draft_social' || step.kind === 'write_article') {
    const platform = payload?.platform as string | undefined;
    if (platform && PLATFORM_TO_AGENT[platform]) return PLATFORM_TO_AGENT[platform];
    return step.kind === 'draft_social' ? 'xalt' : 'quill';
  }
  return STEP_AGENT_MAP[step.kind as keyof typeof STEP_AGENT_MAP] || 'minion';
}

/** 手动触发一次 worker tick（用于提案创建后立即执行） */
export function triggerWorkerTick(): void {
  processOneQueuedStep().catch(() => {});
}

export async function processOneQueuedStep(): Promise<void> {
  // 熔断器检查
  if (circuitBreakerUntil > Date.now()) {
    return; // 静默跳过，等待冷却
  }

  const db = getDb();

  /** 原子认领：同一 mission 下所有 queued 步骤一次性认领，支持并行执行 */
  const steps = await db.$transaction(async (tx) => {
    const first = await tx.opsMissionStep.findFirst({
      where: { status: 'queued' },
      orderBy: { id: 'asc' },
    });

    if (!first) return [];

    const allQueued = await tx.opsMissionStep.findMany({
      where: { missionId: first.missionId, status: 'queued' },
      orderBy: { id: 'asc' },
    });

    if (allQueued.length === 0) return [];

    const ids = allQueued.map((s) => s.id);
    const updated = await tx.opsMissionStep.updateMany({
      where: { id: { in: ids }, status: 'queued' },
      data: { status: 'running', startedAt: new Date() },
    });

    if (updated.count === 0) return [];
    return allQueued;
  });

  if (steps.length === 0) return;

  const missionId = steps[0].missionId;
  const mission = await db.opsMission.findUnique({
    where: { id: missionId },
    select: { title: true, createdBy: true, proposalId: true },
  });
  const missionTitle = mission?.title || `任务 #${missionId}`;
  const missionCreatedBy = mission?.createdBy ?? null;

  // Check if this mission was created by a reaction (to avoid observer loop)
  let missionSource: string | null = null;
  if (mission?.proposalId) {
    const proposal = await db.opsMissionProposal.findUnique({
      where: { id: mission.proposalId },
      select: { source: true },
    });
    missionSource = proposal?.source ?? null;
  }

  logger.info(`Processing ${steps.length} step(s) of mission ${missionId} in parallel`);

  const results = await Promise.allSettled(steps.map((s) => dispatchStep(s)));
  const driftPairs: { agentA: string; agentB: string }[] = [];
  let failureCount = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const result = results[i];

    if (result.status === 'fulfilled') {
      await db.opsMissionStep.update({
        where: { id: step.id },
        data: { status: 'succeeded', result: result.value, finishedAt: new Date() },
      });

      const stepEvent = await db.opsAgentEvent.create({
        data: {
          agentId: null,
          kind: 'step_succeeded',
          title: missionTitle,
          summary: step.kind,
          tags: ['step', 'succeeded'],
          payload: { stepId: step.id, missionId, stepKind: step.kind },
        },
      });

      // Observer reaction: only for non-reaction missions, sample 30%
      if (missionSource !== 'reaction' && Math.random() < 0.3) {
        enqueueReactionsForEvent(stepEvent.id, 'step_succeeded').catch(() => {});
      }

      const stepAgentId = resolveStepAgentId(step);
      extractMemoriesFromStepResult(stepAgentId, step.kind, result.value).catch((err) => {
        logger.error(`Memory extraction failed for step ${step.id}`, err);
      });
      saveToOutbox(step, result.value).catch((err) => {
        logger.error(`Outbox write failed for step ${step.id}`, err);
      });

      if (missionCreatedBy && missionCreatedBy !== stepAgentId) {
        driftPairs.push({ agentA: stepAgentId, agentB: missionCreatedBy });
      }
    } else {
      failureCount++;
      const error = result.reason;
      await db.opsMissionStep.update({
        where: { id: step.id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          finishedAt: new Date(),
        },
      });

      await db.opsAgentEvent.create({
        data: {
          agentId: null,
          kind: 'step_failed',
          title: missionTitle,
          summary: error instanceof Error ? error.message : 'Unknown error',
          tags: ['step', 'failed'],
          payload: { stepId: step.id, missionId, stepKind: step.kind },
        },
      });
      logger.error(`Step ${step.id} failed`, error);
    }
  }

  // 同一批并行步骤：关系漂移只调用一次，避免重复放大
  if (driftPairs.length > 0) {
    applyRelationshipDrifts(
      driftPairs.map(({ agentA, agentB }) => ({
        agentA,
        agentB,
        drift: 0.01,
        reason: `协作完成批量步骤 (${steps.length} 步)`,
      })),
    ).catch(() => {});
  }

  await maybeFinalizeMissionIfDone(missionId);

  // 步骤完成后立即检查是否有新的 queued 步骤，不等下一个 tick
  setImmediate(() => processOneQueuedStep().catch(() => {}));

  if (failureCount > 0) {
    consecutiveFailures += failureCount;
    if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
      logger.error(
        `Circuit breaker triggered: ${consecutiveFailures} consecutive failures. Worker paused for ${CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s`,
      );
      await db.opsAgentEvent.create({
        data: {
          agentId: null,
          kind: 'circuit_breaker',
          title: 'Worker 熔断器触发',
          summary: `连续 ${consecutiveFailures} 次步骤执行失败，Worker 暂停 ${CIRCUIT_BREAKER_COOLDOWN_MS / 1000} 秒`,
          tags: ['worker', 'circuit_breaker', 'alert'],
          payload: { consecutiveFailures, cooldownMs: CIRCUIT_BREAKER_COOLDOWN_MS },
        },
      });
      consecutiveFailures = 0;
    }
  } else {
    consecutiveFailures = 0;
  }
}
