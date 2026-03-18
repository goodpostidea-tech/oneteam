import type { OpsMissionStep, OpsAgentMemory } from '@prisma/client';
import type { AgentDefinition } from '../../ops/agents';
import { llmGenerate } from '../provider';
import { buildAgentSystemPrompt } from '../agent-prompt';
import { formatPriorContext, formatRecentHistory } from './utils';
import { buildTools } from '../../tools/registry';
import { TOOL_ROUTES } from '../../tools/tool-routes';
import { PLATFORMS, buildPlatformPrompt } from '../../ops/platforms';

export async function handleWriteArticle(
  step: OpsMissionStep,
  agent: AgentDefinition,
  memories: OpsAgentMemory[],
) {
  const payload = (step.payload as Record<string, unknown>) ?? {};
  const topic = (payload.topic as string) || '未指定主题';
  const description = (payload.description as string) || '';
  const platform = payload.platform as string | undefined;
  const priorCtx = formatPriorContext(payload);
  const recentCtx = formatRecentHistory(payload);

  let system: string;
  let prompt: string;

  if (platform && PLATFORMS[platform]) {
    // 平台特定文章：使用平台 prompt 模板
    system = await buildAgentSystemPrompt(agent, memories);
    prompt = buildPlatformPrompt(platform, topic, {
      description,
      priorContext: [priorCtx, recentCtx].filter(Boolean).join('\n') || undefined,
    });
  } else {
    // 通用文章
    system = `你是一位专业的内容创作者。请以作者身份撰写面向读者的文章。
注意：文章标题和正文是给读者看的最终成品，不要使用角色扮演的口头禅、台词或对话式语气。`;
    prompt = `请撰写一篇 Markdown 格式的文章。

主题：${topic}
${description ? `要求：${description}` : ''}
${payload.outline ? `大纲：${payload.outline}` : ''}
${priorCtx}
${recentCtx}

要求：
- 第一行输出文章标题（不带 # 号），标题要吸引读者、概括主题
- 第二行空行
- 之后是正文，使用 Markdown 格式（## 小标题、段落、列表等）
- 字数 800-1500 字
- 风格专业但易读
- 重要：这是给读者看的正式文章，不要使用任何角色扮演的口头禅或对话式开头`;
  }

  const tools = buildTools(TOOL_ROUTES['write_article'] || []);
  const { text, toolCalls } = await llmGenerate({ system, prompt, maxTokens: 4096, modelId: agent.modelId, tools, maxSteps: 3 });

  const lines = text.split('\n');
  const title = lines[0]?.replace(/^#*\s*/, '').trim() || topic;
  const content = lines.slice(1).join('\n').trim();

  return {
    title,
    content,
    ...(platform ? { platform, platformName: PLATFORMS[platform]?.name || platform } : {}),
    ...(toolCalls.length > 0 ? { _toolCalls: toolCalls } : {}),
  };
}
