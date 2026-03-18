import { getDb } from '../db/client';
import { AGENTS } from '../ops/agents';

interface MemoryStats {
  insight_count: number;
  pattern_count: number;
  strategy_count: number;
  preference_count: number;
  lesson_count: number;
  top_tags: string[];
}

async function aggregateMemoryStats(agentId: string): Promise<MemoryStats> {
  const db = getDb();
  const agent = AGENTS.find(a => a.id === agentId);

  // 子智能体合并父级记忆统计
  const agentIds = agent?.parentId ? [agentId, agent.parentId] : [agentId];

  const memories = await db.opsAgentMemory.findMany({
    where: { agentId: { in: agentIds } },
    select: { kind: true, tags: true },
  });

  const counts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};

  for (const m of memories) {
    counts[m.kind] = (counts[m.kind] || 0) + 1;
    const tags = (Array.isArray(m.tags) ? m.tags : JSON.parse(m.tags as string)) as string[];
    for (const tag of tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  return {
    insight_count: counts['insight'] || 0,
    pattern_count: counts['pattern'] || 0,
    strategy_count: counts['strategy'] || 0,
    preference_count: counts['preference'] || 0,
    lesson_count: counts['lesson'] || 0,
    top_tags: sortedTags.slice(0, 5),
  };
}

/**
 * 从 agent 的记忆统计中派生声音修饰词（规则驱动，不用 LLM）。
 * 最多返回 3 条，注入到 system prompt 中。
 */
export async function deriveVoiceModifiers(agentId: string): Promise<string[]> {
  const stats = await aggregateMemoryStats(agentId);
  const modifiers: string[] = [];

  if (stats.lesson_count > 10 && stats.top_tags.includes('engagement')) {
    modifiers.push('你在互动运营方面积累了丰富经验，提到互动策略时请自然地引用你的经验教训。');
  }

  if (stats.pattern_count > 5 && stats.top_tags[0] === 'content') {
    modifiers.push('你在内容策略方面已经形成了专业知识体系，讨论内容时展现专业性。');
  }

  if (stats.strategy_count > 8) {
    modifiers.push('你会习惯性地从长远战略视角来思考问题，而不只是关注眼前。');
  }

  if (stats.insight_count > 15) {
    modifiers.push('你善于发现隐藏的趋势和规律，经常能指出别人忽略的联系。');
  }

  if (stats.lesson_count > 8 && stats.top_tags.includes('failure')) {
    modifiers.push('你经历过不少失败教训，对风险有天然的警觉性。');
  }

  if (stats.preference_count > 5) {
    modifiers.push('你已经形成了明确的工作偏好和方法论。');
  }

  return modifiers.slice(0, 3);
}
