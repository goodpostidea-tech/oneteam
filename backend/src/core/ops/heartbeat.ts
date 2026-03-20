import { getDb } from '../db/client';
import { getLogger } from '../util/logger';
import { evaluateTriggers } from './triggers';
import { processReactionQueue } from './reactions';
import { processRoundtableQueue } from './roundtable';
import { evaluateInitiatives } from './initiative';
import { fetchAllRssFeeds } from './rss-fetcher';
import { consumeMaterials } from './material-consumer';
import { getPolicy } from './policy';

import { isLlmReady } from '../config/llm-config';

const logger = getLogger('heartbeat');

interface HeartbeatStatus {
  lastRunAt: string | null;
  lastResult: 'ok' | 'partial' | 'error';
  llmReady: boolean;
  subsystems: Record<string, { ok: boolean; error?: string }>;
}

let _status: HeartbeatStatus = {
  lastRunAt: null,
  lastResult: 'ok',
  llmReady: false,
  subsystems: {},
};

export function getHeartbeatStatus(): HeartbeatStatus {
  return { ..._status };
}

export async function runHeartbeatCycle(): Promise<void> {
  const llmReady = isLlmReady();
  logger.info(`Heartbeat cycle started (llmReady=${llmReady})`);
  const subs: Record<string, { ok: boolean; error?: string }> = {};

  const run = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); subs[name] = { ok: true }; }
    catch (error) { logger.error(`Heartbeat: ${name} failed`, error); subs[name] = { ok: false, error: String(error) }; }
  };

  // LLM-dependent subsystems: skip when not ready
  if (llmReady) {
    await run('triggers', evaluateTriggers);
    await run('reactions', processReactionQueue);
    await run('roundtable', processRoundtableQueue);
    await run('initiatives', evaluateInitiatives);
    await run('materialConsumer', consumeMaterials);
  } else {
    for (const name of ['triggers', 'reactions', 'roundtable', 'initiatives', 'materialConsumer']) {
      subs[name] = { ok: true, error: 'skipped: LLM not configured' };
    }
    logger.info('LLM not configured, skipping LLM-dependent subsystems');
  }

  // Non-LLM subsystems: always run
  await run('promoteInsights', promoteInsights);
  await run('recoverStuck', recoverStuckTasks);
  await run('rssFetch', async () => {
    const interval = await getPolicy<{ minutes: number }>('rss_interval', { minutes: 60 });
    const intervalMs = interval.minutes * 60 * 1000;

    // 用 DB 持久化的时间戳判断，不依赖内存变量（重启不丢失）
    const { getAllRssFeeds } = await import('../config/rss-config');
    const feeds = getAllRssFeeds().filter(f => f.enabled);
    if (feeds.length === 0) return;

    // 取所有 feed 中最近一次 fetch 时间
    const lastFetchTimes = feeds
      .map(f => f.lastFetchedAt ? new Date(f.lastFetchedAt).getTime() : 0)
      .filter(t => t > 0);
    const lastFetch = lastFetchTimes.length > 0 ? Math.max(...lastFetchTimes) : 0;
    const elapsed = lastFetch ? Date.now() - lastFetch : Infinity;

    if (elapsed >= intervalMs) {
      await fetchAllRssFeeds();
    }
  });

  const allOk = Object.values(subs).every(s => s.ok);
  const anyOk = Object.values(subs).some(s => s.ok);
  _status = {
    lastRunAt: new Date().toISOString(),
    lastResult: allOk ? 'ok' : anyOk ? 'partial' : 'error',
    llmReady,
    subsystems: subs,
  };

  logger.info('Heartbeat cycle finished');
}

/**
 * 高置信度 insight（>0.85）被引用多次后晋升为 strategy
 */
async function promoteInsights(): Promise<void> {
  const db = getDb();

  const candidates = await db.opsAgentMemory.findMany({
    where: {
      kind: 'insight',
      confidence: { gte: 0.85 },
    },
  });

  let promoted = 0;
  for (const mem of candidates) {
    // 如果该 agent 已有同内容的 strategy，跳过
    const existing = await db.opsAgentMemory.findFirst({
      where: { agentId: mem.agentId, kind: 'strategy', content: mem.content },
    });
    if (existing) continue;

    // 检查 insight 是否存在超过 24 小时
    const age = Date.now() - mem.createdAt.getTime();
    if (age < 24 * 60 * 60 * 1000) continue;

    await db.opsAgentMemory.update({
      where: { id: mem.id },
      data: { kind: 'strategy' },
    });
    promoted++;
  }

  if (promoted > 0) {
    logger.info(`Promoted ${promoted} high-confidence insights to strategy`);
  }
}

/**
 * 恢复卡住的任务：running 超过 15 分钟的 step 标记为 failed
 */
async function recoverStuckTasks(): Promise<void> {
  const db = getDb();
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);

  const stuck = await db.opsMissionStep.findMany({
    where: {
      status: 'running',
      startedAt: { lt: cutoff },
    },
  });

  for (const step of stuck) {
    await db.opsMissionStep.update({
      where: { id: step.id },
      data: {
        status: 'failed',
        error: 'Recovered by heartbeat: stuck for >15 minutes',
        finishedAt: new Date(),
      },
    });

    await db.opsAgentEvent.create({
      data: {
        agentId: null,
        kind: 'step_recovered',
        title: `步骤超时恢复`,
        summary: `${step.kind} 运行超过 15 分钟，已标记为失败`,
        tags: ['step', 'recovered', 'heartbeat'],
        payload: { stepId: step.id, missionId: step.missionId, stepKind: step.kind },
      },
    });

    logger.warn(`Recovered stuck step ${step.id} (mission ${step.missionId})`);
  }

  if (stuck.length > 0) {
    // 检查对应的 mission 是否需要 finalize
    const { maybeFinalizeMissionIfDone } = await import('./mission-finalizer');
    const missionIds = [...new Set(stuck.map((s) => s.missionId))];
    for (const mid of missionIds) {
      await maybeFinalizeMissionIfDone(mid);
    }
  }

  // ─── 清理卡住的圆桌会议（running > 30 分钟） ───
  const rtCutoff = new Date(Date.now() - 30 * 60 * 1000);
  const stuckSessions = await db.opsRoundtableSession.findMany({
    where: { status: 'running', createdAt: { lt: rtCutoff } },
  });
  for (const s of stuckSessions) {
    await db.opsRoundtableSession.update({
      where: { id: s.id },
      data: { status: 'failed' },
    });
    logger.warn(`Recovered stuck roundtable session ${s.id} (running > 30 min)`);
  }

  // ─── 清理卡住的圆桌队列 ───
  const stuckQueue = await db.opsRoundtableQueue.findMany({
    where: { status: 'running', createdAt: { lt: rtCutoff } },
  });
  for (const q of stuckQueue) {
    await db.opsRoundtableQueue.update({
      where: { id: q.id },
      data: { status: 'failed' },
    });
    logger.warn(`Recovered stuck roundtable queue item ${q.id}`);
  }
}
