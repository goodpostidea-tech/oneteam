import type { OpsMissionStep, OpsAgentMemory } from '@prisma/client';
import type { AgentDefinition } from '../../ops/agents';
import { llmGenerate } from '../provider';
import { buildAgentSystemPrompt } from '../agent-prompt';
import { formatPriorContext, formatRecentHistory } from './utils';
import { buildTools } from '../../tools/registry';
import { TOOL_ROUTES } from '../../tools/tool-routes';
import { buildPlatformPrompt, PLATFORMS } from '../../ops/platforms';

export async function handleDraftSocial(
  step: OpsMissionStep,
  agent: AgentDefinition,
  memories: OpsAgentMemory[],
) {
  const payload = (step.payload as Record<string, unknown>) ?? {};
  const topic = (payload.topic as string) || (payload.title as string) || '未指定主题';
  const platform = (payload.platform as string) || 'tweet';
  const cfg = PLATFORMS[platform];

  const recentCtx = formatRecentHistory(payload);
  const priorCtx = formatPriorContext(payload);

  const system = await buildAgentSystemPrompt(agent, memories);
  const prompt = buildPlatformPrompt(platform, topic, {
    description: payload.description as string | undefined,
    style: payload.style as string | undefined,
    priorContext: [priorCtx, recentCtx].filter(Boolean).join('\n') || undefined,
  });

  const tools = buildTools(TOOL_ROUTES['draft_social'] || TOOL_ROUTES['draft_tweet'] || []);
  const { text, toolCalls } = await llmGenerate({ system, prompt, modelId: agent.modelId, tools, maxSteps: 3 });

  const isLongFormat = cfg && (cfg.format === 'note' || cfg.format === 'answer' || cfg.format === 'article');

  let posts: string[];
  if (isLongFormat) {
    posts = [text.trim()];
  } else if (cfg?.format === 'hook') {
    posts = text.split('---').map(s => s.trim()).filter(s => s.length > 10);
  } else {
    posts = text.split('\n').map(l => l.trim()).filter(l => l.length > 10);
  }

  return {
    platform,
    platformName: cfg?.name || platform,
    posts,
    ...(toolCalls.length > 0 ? { _toolCalls: toolCalls } : {}),
  };
}
