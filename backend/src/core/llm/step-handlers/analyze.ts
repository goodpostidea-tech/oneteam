import type { OpsMissionStep, OpsAgentMemory } from '@prisma/client';
import type { AgentDefinition } from '../../ops/agents';
import { llmGenerate } from '../provider';
import { buildAgentSystemPrompt } from '../agent-prompt';
import { formatPriorContext, formatRecentHistory } from './utils';
import { buildTools } from '../../tools/registry';
import { TOOL_ROUTES } from '../../tools/tool-routes';

export async function handleAnalyze(
  step: OpsMissionStep,
  agent: AgentDefinition,
  memories: OpsAgentMemory[],
) {
  const payload = (step.payload as Record<string, unknown>) ?? {};
  const topic = (payload.topic as string) || '当前任务';
  const description = (payload.description as string) || '';
  const priorCtx = formatPriorContext(payload);

  // 如果有前序 crawl 结果，指示基于已有数据分析
  const priorResults = (payload._priorResults as Record<string, any>) || {};
  const hasCrawlData = Object.keys(priorResults).some(k => k.includes('crawl'));
  const analyzeHint = hasCrawlData
    ? '\n注意：前序爬虫步骤已采集了相关信息（见上方前序结果），请基于已有数据进行深度分析，侧重洞察提炼而非重复搜索相同内容。'
    : '';

  const recentCtx = formatRecentHistory(payload);

  const system = await buildAgentSystemPrompt(agent, memories);
  const prompt = `请分析以下话题/情报，输出结构化的洞察摘要。

话题：${topic}
${description ? `背景说明：${description}` : ''}
${priorCtx}${analyzeHint}
${recentCtx}

请按以下格式输出：
1. 一段简明摘要（2-3句话）
2. 3-5条具体洞察，每条一行

请直接输出内容，不要包裹代码块。`;

  const tools = buildTools(TOOL_ROUTES['analyze'] || []);
  const { text, toolCalls } = await llmGenerate({ system, prompt, modelId: agent.modelId, tools, maxSteps: 3 });

  const lines = text.split('\n').filter((l) => l.trim());
  const summary = lines[0] || text.slice(0, 200);
  const insights = lines.slice(1).map((l) => l.replace(/^\d+[\.\、]\s*/, '').trim()).filter(Boolean);

  return { summary, insights, ...(toolCalls.length > 0 ? { _toolCalls: toolCalls } : {}) };
}
