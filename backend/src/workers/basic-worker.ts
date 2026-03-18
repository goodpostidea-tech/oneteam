import { getDb } from '../core/db/client';
import { getLogger } from '../core/util/logger';
import { maybeFinalizeMissionIfDone } from '../core/ops/mission-finalizer';

const logger = getLogger('basic-worker');

async function runOnce(): Promise<void> {
  const db = getDb();

  // 原子认领一个 queued 步骤
  const step = await db.$transaction(async (tx) => {
    const next = await tx.opsMissionStep.findFirst({
      where: { status: 'queued' },
      orderBy: { id: 'asc' },
    });

    if (!next) {
      return null;
    }

    const updated = await tx.opsMissionStep.updateMany({
      where: { id: next.id, status: 'queued' },
      data: { status: 'running', startedAt: new Date() },
    });

    if (updated.count === 0) {
      return null;
    }

    return next;
  });

  if (!step) {
    logger.info('No queued steps found');
    return;
  }

  const mission = await db.opsMission.findUnique({ where: { id: step.missionId }, select: { title: true } });
  const missionTitle = mission?.title || `任务 #${step.missionId}`;

  logger.info(`Processing step ${step.id} of mission ${step.missionId} kind=${step.kind}`);

  try {
    const result = {
      echo: step.payload ?? null,
      finishedAt: new Date().toISOString(),
    };

    await getDb().opsMissionStep.update({
      where: { id: step.id },
      data: {
        status: 'succeeded',
        result,
        finishedAt: new Date(),
      },
    });

    await getDb().opsAgentEvent.create({
      data: {
        agentId: null,
        kind: 'step_succeeded',
        title: missionTitle,
        summary: step.kind,
        tags: ['step', 'succeeded'],
        payload: { stepId: step.id, missionId: step.missionId, stepKind: step.kind },
      },
    });

    await maybeFinalizeMissionIfDone(step.missionId);
  } catch (error) {
    logger.error(`Step ${step.id} failed`, error);

    await getDb().opsMissionStep.update({
      where: { id: step.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      },
    });

    await getDb().opsAgentEvent.create({
      data: {
        agentId: null,
        kind: 'step_failed',
        title: missionTitle,
        summary: error instanceof Error ? error.message : 'Unknown error',
        tags: ['step', 'failed'],
        payload: { stepId: step.id, missionId: step.missionId, stepKind: step.kind },
      },
    });

    await maybeFinalizeMissionIfDone(step.missionId);
  }
}

async function main() {
  logger.info('Basic worker started');

  // 简单轮询模式：每 5 秒尝试处理一个步骤
  // 以后可以改成更复杂的并发模型
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await runOnce();
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

// 仅在直接运行该文件时启动
if (require.main === module) {
  main().catch((error) => {
    logger.error('Basic worker fatal error', error);
    process.exit(1);
  });
}

