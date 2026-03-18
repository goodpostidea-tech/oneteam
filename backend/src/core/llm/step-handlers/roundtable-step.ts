import type { OpsMissionStep, OpsAgentMemory } from '@prisma/client';
import type { AgentDefinition } from '../../ops/agents';
import { runRoundtable } from '../../ops/roundtable';
import { formatPriorContext } from './utils';

export async function handleRoundtableStep(
  step: OpsMissionStep,
  _agent: AgentDefinition,
  _memories: OpsAgentMemory[],
) {
  const payload = (step.payload as Record<string, unknown>) ?? {};
  const topic = (payload.topic as string) || '';
  const description = (payload.description as string) || '';

  // 将前序步骤结果格式化为上下文
  const priorContext = formatPriorContext(payload);

  const result = await runRoundtable({
    title: (payload.title as string) || (topic ? `圆桌讨论：${topic}` : `圆桌讨论 - Step ${step.id}`),
    format: (payload.format as 'standup' | 'debate' | 'chat') || 'chat',
    participants: (payload.participants as string[]) || ['minion', 'scout', 'sage'],
    description: description || (topic ? `围绕「${topic}」展开讨论` : undefined),
    priorContext: priorContext || undefined,
  });

  return {
    sessionId: result.sessionId,
    rounds: result.rounds,
    transcript: result.transcript,
  };
}
