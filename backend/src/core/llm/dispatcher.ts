import type { OpsMissionStep } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { getDb } from '../db/client';
import { AGENTS } from '../ops/agents';
import { STEP_AGENT_MAP } from './step-planner';
import { handleAnalyze } from './step-handlers/analyze';
import { handleWriteArticle } from './step-handlers/write-article';
import { handleDraftSocial } from './step-handlers/draft-social';
import { handleCrawl } from './step-handlers/crawl';
import { handleRoundtableStep } from './step-handlers/roundtable-step';
import { PLATFORM_TO_AGENT } from '../ops/agents';
import { getAgentMemoriesWithInheritance } from './agent-prompt';

export async function dispatchStep(step: OpsMissionStep): Promise<Prisma.InputJsonValue> {
  const db = getDb();

  // 按 step kind 选择 agent；draft_social / write_article 由 platform 决定子智能体
  let bestAgentId = STEP_AGENT_MAP[step.kind] || 'minion';
  const payload = step.payload as Record<string, unknown> | undefined;
  if (payload?.assignedAgent && typeof payload.assignedAgent === 'string') {
    bestAgentId = payload.assignedAgent;
  } else if (step.kind === 'draft_social' || step.kind === 'write_article') {
    const platform = payload?.platform as string | undefined;
    if (platform && PLATFORM_TO_AGENT[platform]) {
      bestAgentId = PLATFORM_TO_AGENT[platform];
    }
  }
  const agent = AGENTS.find((a) => a.id === bestAgentId) || AGENTS[0];

  const memories = await getAgentMemoriesWithInheritance(agent.id);

  // 收集同一 mission 中已完成的前序步骤结果
  const priorSteps = await db.opsMissionStep.findMany({
    where: {
      missionId: step.missionId,
      id: { lt: step.id },
      status: 'succeeded',
    },
    orderBy: { id: 'asc' },
  });

  const priorContext = priorSteps
    .filter((s) => s.result)
    .map((s) => ({
      kind: s.kind,
      result: s.result as Record<string, unknown>,
    }));

  if (priorContext.length > 0) {
    const payload = (step.payload as Record<string, unknown>) ?? {};
    payload._priorResults = priorContext;
    (step as any).payload = payload;
  }

  // 收集该 agent 最近完成的同类步骤结果（跨 mission），用于避免重复产出
  const recentSameKindSteps = await db.opsMissionStep.findMany({
    where: {
      kind: step.kind,
      status: 'succeeded',
      id: { not: step.id },
    },
    orderBy: { finishedAt: 'desc' },
    take: 3,
    include: { mission: { select: { title: true } } },
  });

  if (recentSameKindSteps.length > 0) {
    const payload = (step.payload as Record<string, unknown>) ?? {};
    payload._recentHistory = recentSameKindSteps.map((s) => ({
      missionTitle: s.mission.title,
      result: s.result as Record<string, unknown>,
      finishedAt: s.finishedAt?.toISOString(),
    }));
    (step as any).payload = payload;
  }

  switch (step.kind) {
    case 'analyze':
      return handleAnalyze(step, agent, memories) as Promise<unknown> as Promise<Prisma.InputJsonValue>;
    case 'write_article':
      return handleWriteArticle(step, agent, memories) as Promise<unknown> as Promise<Prisma.InputJsonValue>;
    case 'draft_social':
      return handleDraftSocial(step, agent, memories) as Promise<unknown> as Promise<Prisma.InputJsonValue>;
    case 'crawl':
      return handleCrawl(step, agent, memories) as Promise<unknown> as Promise<Prisma.InputJsonValue>;
    case 'roundtable':
      return handleRoundtableStep(step, agent, memories) as Promise<Prisma.InputJsonValue>;
    default:
      return { error: `Unknown step kind: ${step.kind}` };
  }
}
