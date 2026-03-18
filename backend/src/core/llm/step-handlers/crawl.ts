import type { OpsMissionStep, OpsAgentMemory } from '@prisma/client';
import type { AgentDefinition } from '../../ops/agents';
import { llmGenerate } from '../provider';
import { buildAgentSystemPrompt } from '../agent-prompt';
import { formatPriorContext, formatRecentHistory } from './utils';
import { buildTools } from '../../tools/registry';
import { TOOL_ROUTES } from '../../tools/tool-routes';

export async function handleCrawl(
  step: OpsMissionStep,
  agent: AgentDefinition,
  memories: OpsAgentMemory[],
) {
  const payload = (step.payload as Record<string, unknown>) ?? {};
  const topic = (payload.topic as string) || (payload.url as string) || '未指定目标';

  const recentCtx = formatRecentHistory(payload);

  const tools = buildTools(TOOL_ROUTES['crawl'] || []);
  const hasTools = Object.keys(tools).length > 0;

  const system = await buildAgentSystemPrompt(agent, memories);

  // 提取前序步骤已知信息，用于差异化搜索
  const priorCtx = formatPriorContext(payload);
  const priorResults = (payload._priorResults as Record<string, any>) || {};
  const priorSummaries = Object.entries(priorResults)
    .map(([k, v]) => {
      const s = typeof v === 'object' && v ? (v as any).summary || JSON.stringify(v).slice(0, 300) : String(v).slice(0, 300);
      return `[${k}] ${s}`;
    })
    .join('\n');

  const intro = hasTools
    ? `请使用搜索和网页抓取工具，为以下话题采集真实的网络信息。

如果工具不可用或返回错误，请基于你的知识生成情报摘要。`
    : `（注意：当前为模拟爬虫模式，后续将接入真实爬虫）

请基于你的知识，为以下话题生成一份情报摘要，模拟网络信息采集结果。`;

  const dedupeHint = priorSummaries
    ? `\n以下信息已由前序分析步骤获取：\n${priorSummaries}\n请搜索除此之外的补充信息，扩展信息广度和多样性。避免重复搜索相同关键词。`
    : '';

  const prompt = `${intro}

目标：${topic}
${payload.description ? `说明：${payload.description}` : ''}
${dedupeHint}
${priorCtx}
${recentCtx}

请输出：
1. 一段 200 字以内的摘要
2. 3-5 个信息来源（可模拟合理的 URL 或来源名称）

格式：
摘要：...

来源：
- 来源名称1
- 来源名称2`;

  const { text, toolCalls } = await llmGenerate({ system, prompt, modelId: agent.modelId, tools, maxSteps: 5 });

  const summaryMatch = text.match(/摘要[：:]\s*([\s\S]*?)(?=来源|$)/);
  const summary = summaryMatch?.[1]?.trim() || text.slice(0, 300);

  const sourcesMatch = text.match(/来源[：:]\s*([\s\S]*)/);
  const sources = sourcesMatch
    ? sourcesMatch[1]
        .split('\n')
        .map((l) => l.replace(/^[-\d.\s]+/, '').trim())
        .filter(Boolean)
    : [];

  return { summary, sources, ...(toolCalls.length > 0 ? { _toolCalls: toolCalls } : {}) };
}
