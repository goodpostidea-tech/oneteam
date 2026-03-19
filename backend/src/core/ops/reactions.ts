import { getDb } from '../db/client';
import { getLogger } from '../util/logger';
import { createProposal } from './proposal-service';
import { getPolicy } from './policy';
import { getAgentName } from '../llm/step-planner';

const logger = getLogger('reactions');

interface ReactionRule {
  targetAgent: string;
  stepKind: string;
  description: string;
}

export async function processReactionQueue(): Promise<void> {
  const db = getDb();

  const queued = await db.opsAgentReaction.findMany({
    where: { status: 'queued' },
    orderBy: { id: 'asc' },
    take: 5,
  });

  for (const reaction of queued) {
    try {
      await db.opsAgentReaction.update({
        where: { id: reaction.id },
        data: { status: 'running' },
      });

      // 从关联事件中获取上下文
      const event = reaction.eventId
        ? await db.opsAgentEvent.findUnique({ where: { id: reaction.eventId } })
        : null;

      // 从 reaction_matrix 查找匹配规则
      const matrix = await getPolicy<Record<string, ReactionRule[]>>('reaction_matrix', {});
      const rules = event ? (matrix[event.kind] || []) : [];
      const rule = rules.find((r) => r.targetAgent === reaction.targetAgent);

      const stepKind = rule?.stepKind || 'analyze';
      const description = rule?.description || '根据事件自动创建的任务';
      const eventTitle = event?.title || '未知事件';

      await createProposal({
        agentId: reaction.targetAgent,
        title: `Auto: ${description} (${eventTitle})`,
        description: `由 ${event?.kind || 'unknown'} 事件触发：${eventTitle}`,
        source: 'reaction',
        planResult: {
          steps: [{
            kind: stepKind,
            agent: reaction.targetAgent,
            agentName: await getAgentName(reaction.targetAgent),
            reason: description,
          }],
          confidence: 0.9,
          method: 'rule',
        },
      });

      await db.opsAgentReaction.update({
        where: { id: reaction.id },
        data: { status: 'done' },
      });
    } catch (error) {
      logger.error(`Reaction ${reaction.id} failed`, error);
      await db.opsAgentReaction.update({
        where: { id: reaction.id },
        data: { status: 'failed' },
      });
    }
  }
}

// 策略驱动：根据 reaction_matrix 策略决定哪些 agent 响应哪些事件
export async function enqueueReactionsForEvent(
  eventId: number,
  eventKind: string,
): Promise<void> {
  const db = getDb();
  const matrix = await getPolicy<Record<string, ReactionRule[]>>('reaction_matrix', {});
  const rules = matrix[eventKind];
  if (!rules || rules.length === 0) return;

  for (const rule of rules) {
    await db.opsAgentReaction.create({
      data: {
        sourceAgent: null,
        targetAgent: rule.targetAgent,
        eventId,
        status: 'queued',
      },
    });
    logger.info(`Enqueued reaction for ${rule.targetAgent} on ${eventKind} event ${eventId}`);
  }
}
