import { getDb } from '../db/client';
import { getLogger } from '../util/logger';
import { getPolicy } from './policy';
import { AGENTS } from './agents';
import { llmGenerate } from '../llm/provider';
import { buildAgentSystemPrompt } from '../llm/agent-prompt';
import { createProposal } from './proposal-service';
import { STEP_AGENT_MAP } from '../llm/step-planner';

const logger = getLogger('initiative');

/**
 * 心跳调用：检查哪些 agent 该提主动提案了，写入 OpsInitiativeQueue
 */
export async function evaluateInitiatives(): Promise<void> {
  const db = getDb();
  const policy = await getPolicy('initiative_policy', {
    enabled: false,
    cooldown_hours: 4,
    min_memories: 5,
  });

  if (!policy.enabled) return;

  const cooldownMs = (policy.cooldown_hours || 4) * 60 * 60 * 1000;
  const minMemories = policy.min_memories || 5;

  for (const agent of AGENTS) {
    // 检查冷却：最近是否已有主动提案
    const lastInitiative = await db.opsInitiativeQueue.findFirst({
      where: { agentId: agent.id },
      orderBy: { createdAt: 'desc' },
    });

    if (lastInitiative && Date.now() - lastInitiative.createdAt.getTime() < cooldownMs) {
      continue;
    }

    // 检查记忆量：至少需要足够的高置信度记忆
    const memCount = await db.opsAgentMemory.count({
      where: { agentId: agent.id, confidence: { gte: 0.6 } },
    });

    if (memCount < minMemories) {
      continue;
    }

    // 跳过概率：10-15% 的概率 "今天不想干"
    if (Math.random() < 0.12) {
      logger.info(`Initiative skipped for ${agent.id} (random skip)`);
      continue;
    }

    // 入队
    await db.opsInitiativeQueue.create({
      data: { agentId: agent.id, status: 'queued' },
    });

    logger.info(`Initiative enqueued for ${agent.id}`);
  }
}

/**
 * Worker 消费：用 LLM 生成提案内容，然后走完整的提案服务
 */
export async function processInitiativeQueue(): Promise<void> {
  const db = getDb();

  const item = await db.opsInitiativeQueue.findFirst({
    where: { status: 'queued' },
    orderBy: { id: 'asc' },
  });

  if (!item) return;

  await db.opsInitiativeQueue.update({
    where: { id: item.id },
    data: { status: 'running' },
  });

  try {
    const agent = AGENTS.find((a) => a.id === item.agentId) || AGENTS[0];

    // 拉取该 agent 的高置信度记忆
    const memories = await db.opsAgentMemory.findMany({
      where: { agentId: agent.id, confidence: { gte: 0.6 } },
      orderBy: { confidence: 'desc' },
      take: 15,
    });

    const system = await buildAgentSystemPrompt(agent, memories);

    const memoryContext = memories
      .map((m) => `[${m.kind}] ${m.content}`)
      .join('\n');

    const prompt = `基于你的记忆和经验，你认为团队目前应该主动做什么？

你的近期记忆：
${memoryContext}

请提出一个具体的工作提案，格式：
TITLE|提案标题（简洁，10-30字）
DESC|提案描述（1-2句话说明为什么要做这件事）
KIND|步骤类型（analyze/write_article/draft_social/crawl）

只输出一个提案，不要输出其他内容。`;

    const { text } = await llmGenerate({ system, prompt, maxTokens: 512 });

    // 解析
    const titleMatch = text.match(/TITLE\|(.+)/);
    const descMatch = text.match(/DESC\|(.+)/);
    const kindMatch = text.match(/KIND\|(.+)/);

    const title = titleMatch?.[1]?.trim();
    const description = descMatch?.[1]?.trim();
    const kind = kindMatch?.[1]?.trim();

    const validKinds = ['analyze', 'write_article', 'draft_social', 'crawl'];
    if (!title || !validKinds.includes(kind || '')) {
      logger.warn(`Initiative for ${agent.id} produced invalid output, skipping`);
      await db.opsInitiativeQueue.update({
        where: { id: item.id },
        data: { status: 'failed' },
      });
      return;
    }

    // 走完整的提案服务（包括配额检查、Cap Gates 等）
    const stepKind = kind!;
    const result = await createProposal({
      agentId: agent.id,
      title: `[主动] ${title}`,
      description: description || undefined,
      source: 'initiative',
      planResult: {
        steps: [{
          kind: stepKind,
          agent: STEP_AGENT_MAP[stepKind] || agent.id,
          agentName: STEP_AGENT_MAP[stepKind] || agent.id,
          reason: '主动提案',
        }],
        confidence: 0.85,
        method: 'rule',
      },
    });

    await db.opsInitiativeQueue.update({
      where: { id: item.id },
      data: { status: 'done' },
    });

    logger.info(
      `Initiative by ${agent.id}: "${title}" → proposal ${result.proposalId} (${result.status})`,
    );
  } catch (error) {
    logger.error(`Initiative ${item.id} failed`, error);
    await db.opsInitiativeQueue.update({
      where: { id: item.id },
      data: { status: 'failed' },
    });
  }
}
