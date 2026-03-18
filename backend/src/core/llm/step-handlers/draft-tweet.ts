import type { OpsMissionStep, OpsAgentMemory } from '@prisma/client';
import type { AgentDefinition } from '../../ops/agents';
import { llmGenerate } from '../provider';
import { buildAgentSystemPrompt } from '../agent-prompt';
import { formatPriorContext, formatRecentHistory } from './utils';
import { buildTools } from '../../tools/registry';
import { TOOL_ROUTES } from '../../tools/tool-routes';

export async function handleDraftTweet(
  step: OpsMissionStep,
  agent: AgentDefinition,
  memories: OpsAgentMemory[],
) {
  const payload = (step.payload as Record<string, unknown>) ?? {};
  const topic = (payload.topic as string) || (payload.title as string) || '未指定主题';

  const recentCtx = formatRecentHistory(payload);

  const system = await buildAgentSystemPrompt(agent, memories);
  const prompt = `请为以下话题生成 3 条推文文案。

话题：${topic}
${payload.description ? `说明：${payload.description}` : ''}
${payload.style ? `风格：${payload.style}` : ''}
${formatPriorContext(payload)}
${recentCtx}

要求：
- 每条推文独立一行
- 每条 140-280 字符
- 风格适合社交媒体传播
- 可适当使用 emoji
- 不要编号，直接输出推文内容`;

  const tools = buildTools(TOOL_ROUTES['draft_tweet'] || []);
  const { text, toolCalls } = await llmGenerate({ system, prompt, modelId: agent.modelId, tools, maxSteps: 3 });

  const tweets = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 10);

  return { tweets, ...(toolCalls.length > 0 ? { _toolCalls: toolCalls } : {}) };
}
