import type { AgentDefinition } from '../ops/agents';
import { getAgentConfig, AGENTS } from '../ops/agents';
import type { OpsAgentMemory } from '@prisma/client';
import { deriveVoiceModifiers } from './voice-evolution';
import { getDb } from '../db/client';

/**
 * 获取 agent 的记忆（包含父级继承）
 * 子智能体同时读取自己的记忆 + 父级记忆
 */
export async function getAgentMemoriesWithInheritance(agentId: string): Promise<OpsAgentMemory[]> {
  const db = getDb();
  const agent = AGENTS.find(a => a.id === agentId);

  const ownMemories = await db.opsAgentMemory.findMany({
    where: { agentId },
    orderBy: { confidence: 'desc' },
    take: 10,
  });

  if (!agent?.parentId) return ownMemories;

  // 子智能体：拉取父级记忆，去重后合并
  const parentMemories = await db.opsAgentMemory.findMany({
    where: { agentId: agent.parentId },
    orderBy: { confidence: 'desc' },
    take: 8,
  });

  // 用 content 去重，子级优先
  const seen = new Set(ownMemories.map(m => m.content));
  const inherited = parentMemories.filter(m => !seen.has(m.content));

  return [...ownMemories, ...inherited];
}

export async function buildAgentSystemPrompt(
  agent: AgentDefinition,
  memories: OpsAgentMemory[],
): Promise<string> {
  // 声音演化：从记忆统计派生的修饰词（限制 2 条）
  const voiceModifiers = (await deriveVoiceModifiers(agent.id)).slice(0, 2);
  const voiceBlock = voiceModifiers.length > 0
    ? voiceModifiers.map((m) => `- ${m}`).join('\n')
    : '';

  // 记忆块（每条截断 120 字符，总上限 1200 字符）
  const MEMORY_CHAR_LIMIT = 1200;
  const priority = ['strategy', 'lesson'];
  const secondary = ['insight', 'pattern', 'preference'];
  const sorted = [...memories].sort((a, b) => {
    const aP = priority.includes(a.kind) ? 0 : secondary.includes(a.kind) ? 1 : 2;
    const bP = priority.includes(b.kind) ? 0 : secondary.includes(b.kind) ? 1 : 2;
    return aP - bP;
  });
  let memoryCharCount = 0;
  const memoryLines: string[] = [];
  for (const m of sorted) {
    const line = `[${m.kind}] ${m.content.slice(0, 120)}`;
    if (memoryCharCount + line.length > MEMORY_CHAR_LIMIT) break;
    memoryLines.push(line);
    memoryCharCount += line.length;
  }
  const memoryBlock = memoryLines.join('\n');

  // 查 DB 自定义 prompt
  const config = await getAgentConfig(agent.id);
  const customPrompt = config?.customSystemPrompt;

  if (customPrompt) {
    // 模板变量替换
    return customPrompt
      .replace(/\{\{name\}\}/g, agent.name)
      .replace(/\{\{role\}\}/g, agent.role)
      .replace(/\{\{style\}\}/g, agent.style)
      .replace(/\{\{catchphrase\}\}/g, agent.catchphrase)
      .replace(/\{\{perspective\}\}/g, agent.perspective)
      .replace(/\{\{memories\}\}/g, memoryBlock || '（暂无记忆）')
      .replace(/\{\{voice\}\}/g, voiceBlock || '（暂无经验沉淀）');
  }

  // 默认组装逻辑
  const persona = [
    `你是 ${agent.name}，角色：${agent.role}。`,
    `风格：${agent.style}`,
    `口头禅（仅偶尔使用，不要每次都说）："${agent.catchphrase}"`,
    `性格特点：${agent.perspective}`,
    '请始终以该角色身份回复，保持人设一致。口头禅只在特别契合的场景下偶尔流露，大部分时候用自己的话表达。',
  ].join('\n');

  const voiceSection = voiceBlock ? `\n\n## 你的经验沉淀\n${voiceBlock}` : '';
  const memorySection = memoryBlock ? `\n\n## 你的记忆\n${memoryBlock}` : '';

  return `${persona}${voiceSection}${memorySection}\n\n注意：当具体任务的 prompt 对风格有明确要求时，以任务要求为准，角色风格作为底色而非硬性约束。`;
}
