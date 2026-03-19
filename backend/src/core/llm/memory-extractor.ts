import { getDb } from '../db/client';
import { llmGenerate } from './provider';
import { getLogger } from '../util/logger';
import { applyRelationshipDrifts, type RelationshipDrift } from '../ops/relationships';
import { createProposal } from '../ops/proposal-service';
import { STEP_AGENT_MAP, getAgentName } from './step-planner';
import { AGENTS } from '../ops/agents';
import { PLATFORMS } from '../ops/platforms';
import type { RoundtableFormat } from '../ops/roundtable';

const logger = getLogger('memory-extractor');

const MAX_MEMORIES_PER_AGENT = 200;

const DAY_MS = 86_400_000;

/**
 * 记忆有效分 = confidence × recency_factor
 * recency_factor: 7天内=1.0, 30天内=0.8, 30天+=0.5
 */
function memoryScore(confidence: number, createdAt: Date): number {
  const ageDays = (Date.now() - createdAt.getTime()) / DAY_MS;
  const recency = ageDays <= 7 ? 1.0 : ageDays <= 30 ? 0.8 : 0.5;
  return confidence * recency;
}

/**
 * 按衰减分数找出应淘汰的记忆 ID
 */
async function findMemoriesToTrim(db: ReturnType<typeof getDb>, agentId: string, excess: number): Promise<number[]> {
  const all = await db.opsAgentMemory.findMany({
    where: { agentId },
    select: { id: true, confidence: true, createdAt: true },
  });
  // 按有效分升序，分数最低的先淘汰
  all.sort((a, b) => memoryScore(a.confidence, a.createdAt) - memoryScore(b.confidence, b.createdAt));
  return all.slice(0, excess).map(r => r.id);
}

/** 平台关键词列表，用于判断记忆是否平台特定 */
const PLATFORM_KEYWORDS: Record<string, string[]> = {};
for (const [pid, cfg] of Object.entries(PLATFORMS)) {
  PLATFORM_KEYWORDS[pid] = [pid, cfg.name.toLowerCase()];
}

/**
 * 判断记忆应该存到哪个 agent。
 * 如果 agentId 是子智能体（有 parentId），检查内容是否平台特定：
 * - 提到具体平台 → 存子智能体
 * - 通用社媒经验 → 存父级
 */
function resolveMemoryAgent(agentId: string, content: string): string {
  const agent = AGENTS.find(a => a.id === agentId);
  if (!agent?.parentId) return agentId;

  const lower = content.toLowerCase();

  // 检查内容是否提到该子智能体对应的平台
  // 如 xalt_tweet → 'tweet', quill_wechat_mp → 'wechat_mp'
  const platformId = agentId.replace(/^(xalt|quill)_/, '');
  const keywords = PLATFORM_KEYWORDS[platformId];
  if (keywords && keywords.some(kw => lower.includes(kw))) {
    return agentId; // 平台特定 → 存子智能体
  }

  // 通用经验 → 存父级
  return agent.parentId;
}

interface ExtractedMemory {
  agentId: string;
  kind: string;
  content: string;
  confidence: number;
  tags: string[];
}

/**
 * 从步骤执行结果中提取记忆（analyze / write_article / draft_social / crawl 等）
 */
export async function extractMemoriesFromStepResult(
  agentId: string,
  stepKind: string,
  result: unknown,
): Promise<void> {
  const db = getDb();

  // 将 result 转为文本摘要
  let resultText = '';
  if (typeof result === 'string') {
    resultText = result;
  } else if (result && typeof result === 'object') {
    // 取前 2000 字符避免过长
    resultText = JSON.stringify(result, null, 2).slice(0, 2000);
  }
  if (!resultText || resultText.length < 20) return;

  // 加载该 agent 已有记忆（最近 10 条同类），用于语义去重
  const existingMemories = await db.opsAgentMemory.findMany({
    where: { agentId },
    orderBy: { id: 'desc' },
    take: 10,
    select: { kind: true, content: true },
  });
  const existingBlock = existingMemories.length > 0
    ? `\n以下是该智能体已有的记忆，不要提取与其语义重复的内容：\n${existingMemories.map(m => `[${m.kind}] ${m.content}`).join('\n')}\n`
    : '';

  const prompt = `以下是智能体 ${agentId} 执行 ${stepKind} 步骤后的产出结果。请从中提取 1-3 条记忆。
${existingBlock}

结果内容：
${resultText}

每条一行，格式：
MEMORY|kind|content|confidence|tags

kind 可选值：insight, pattern, strategy, preference, lesson
confidence 范围 0.5-1.0（只保留有价值的记忆）
tags 用逗号分隔

只输出 MEMORY 行，不要输出其他内容。如果没有值得记忆的内容，输出空。`;

  let text: string;
  try {
    text = (await llmGenerate({
      system: '你是一个结构化信息提取助手，负责从工作产出中提炼记忆。严格按格式输出。',
      prompt,
      maxTokens: 512,
    })).text;
  } catch (error) {
    logger.error(`Memory extraction from step failed for ${agentId}`, error);
    return;
  }

  const lines = text.split('\n').filter((l) => l.startsWith('MEMORY|'));
  const validKinds = ['insight', 'pattern', 'strategy', 'preference', 'lesson'];
  const extracted: ExtractedMemory[] = [];

  for (const line of lines) {
    const parts = line.slice(7).split('|').map((p) => p.trim());
    if (parts.length < 4) continue;

    const [kind, content, confStr, tagsStr] = parts;
    const confidence = parseFloat(confStr);
    if (!validKinds.includes(kind)) continue;
    if (isNaN(confidence) || confidence < 0.55) continue;

    const tags = (tagsStr || '').split(',').map((t) => t.trim()).filter(Boolean);
    const targetAgent = resolveMemoryAgent(agentId, content);
    extracted.push({ agentId: targetAgent, kind, content, confidence, tags });
  }

  // 去重
  const deduped: ExtractedMemory[] = [];
  for (const m of extracted) {
    const existing = await db.opsAgentMemory.findFirst({
      where: { agentId: m.agentId, content: m.content },
    });
    if (!existing) deduped.push(m);
  }

  if (deduped.length > 0) {
    await db.opsAgentMemory.createMany({
      data: deduped.map((m) => ({
        agentId: m.agentId, kind: m.kind, content: m.content,
        confidence: m.confidence, tags: m.tags,
      })),
    });
    logger.info(`Extracted ${deduped.length} memories from ${stepKind} step for ${agentId}`);

    // 上限检查（按衰减分数淘汰）
    const count = await db.opsAgentMemory.count({ where: { agentId } });
    if (count > MAX_MEMORIES_PER_AGENT) {
      const excess = count - MAX_MEMORIES_PER_AGENT;
      const toDelete = await findMemoriesToTrim(db, agentId, excess);
      await db.opsAgentMemory.deleteMany({
        where: { id: { in: toDelete } },
      });
      logger.info(`Trimmed ${excess} old memories for ${agentId}`);
    }
  }
}

/**
 * 从圆桌对话中提取记忆 + 亲密度漂移 + 行动项（一次 LLM 调用）
 */
export async function extractMemoriesFromTranscript(
  transcript: string,
  participants: string[],
  format?: RoundtableFormat,
): Promise<void> {
  const db = getDb();

  const actionItemBlock = (format === 'standup' || format === 'debate')
    ? `
## 行动项（仅从正式讨论中提取）
如果对话中有明确的行动建议，请提取（最多 3 条）：
ACTION|agentId|title|description|stepKind
stepKind 可选：analyze, write_article, draft_social, crawl

如果没有明确的行动建议，不要输出 ACTION 行。`
    : '';

  // 加载参与者已有记忆，用于语义去重
  const allExisting = await db.opsAgentMemory.findMany({
    where: { agentId: { in: participants } },
    orderBy: { id: 'desc' },
    take: 10,
    select: { agentId: true, kind: true, content: true },
  });
  const existingBlock = allExisting.length > 0
    ? `\n以下是各智能体已有的记忆，不要提取与其语义重复的内容：\n${allExisting.map(m => `[${m.agentId}|${m.kind}] ${m.content}`).join('\n')}\n`
    : '';

  const prompt = `以下是一段多人对话记录。请完成以下提取任务。
${existingBlock}

参与者：${participants.join(', ')}

对话记录：
${transcript}

## 记忆提取
为每位参与者提取 0-3 条记忆，每条一行，格式：
MEMORY|agentId|kind|content|confidence|tags

kind 可选值：insight, pattern, strategy, preference, lesson
confidence 范围 0.0-1.0（只保留有价值的记忆，低质量的不要输出）
tags 用逗号分隔（如 engagement,content,strategy）

## 关系漂移
如果对话中有明显的关系变化迹象（共识/分歧/支持/冲突），提取漂移建议：
DRIFT|agentA|agentB|drift|reason

drift 范围 -0.03 到 +0.03（正数=关系变好，负数=关系变差）
${actionItemBlock}

请直接输出，不要包裹代码块。每行以 MEMORY|、DRIFT| 或 ACTION| 开头。`;

  const { text } = await llmGenerate({
    system: '你是一个结构化信息提取助手，负责从对话中提炼记忆、关系变化和行动项。严格按照格式输出。',
    prompt,
  });

  const lines = text.split('\n').filter((l) => l.includes('|'));

  // ─── 提取记忆 ───
  const extracted: ExtractedMemory[] = [];
  const validKinds = ['insight', 'pattern', 'strategy', 'preference', 'lesson'];

  for (const line of lines) {
    if (!line.startsWith('MEMORY|')) continue;
    const parts = line.slice(7).split('|').map((p) => p.trim());
    if (parts.length < 5) continue;

    const [agentId, kind, content, confStr, tagsStr] = parts;
    const confidence = parseFloat(confStr);

    if (!participants.includes(agentId)) continue;
    if (!validKinds.includes(kind)) continue;
    if (isNaN(confidence) || confidence < 0.55) continue;

    const tags = (tagsStr || '').split(',').map((t) => t.trim()).filter(Boolean);
    const targetAgent = resolveMemoryAgent(agentId, content);
    extracted.push({ agentId: targetAgent, kind, content, confidence, tags });
  }

  // 幂等去重：检查是否已有相同内容的记忆
  const deduped: ExtractedMemory[] = [];
  for (const m of extracted) {
    const existing = await db.opsAgentMemory.findFirst({
      where: { agentId: m.agentId, content: m.content },
    });
    if (!existing) {
      deduped.push(m);
    }
  }

  if (deduped.length > 0) {
    await db.opsAgentMemory.createMany({
      data: deduped.map((m) => ({
        agentId: m.agentId,
        kind: m.kind,
        content: m.content,
        confidence: m.confidence,
        tags: m.tags,
      })),
    });
    logger.info(`Extracted ${deduped.length} memories (${extracted.length - deduped.length} duplicates skipped)`);

    // 每 agent 上限检查
    for (const agentId of participants) {
      const count = await db.opsAgentMemory.count({ where: { agentId } });
      if (count > MAX_MEMORIES_PER_AGENT) {
        const excess = count - MAX_MEMORIES_PER_AGENT;
        const toDelete = await findMemoriesToTrim(db, agentId, excess);
        await db.opsAgentMemory.deleteMany({
          where: { id: { in: toDelete } },
        });
        logger.info(`Trimmed ${excess} old memories for ${agentId} (over ${MAX_MEMORIES_PER_AGENT} limit)`);
      }
    }
  } else {
    logger.info('No memories extracted (all below threshold, empty, or duplicates)');
  }

  // ─── 提取亲密度漂移 ───
  const drifts: RelationshipDrift[] = [];
  for (const line of lines) {
    if (!line.startsWith('DRIFT|')) continue;
    const parts = line.slice(6).split('|').map((p) => p.trim());
    if (parts.length < 4) continue;

    const [agentA, agentB, driftStr, reason] = parts;
    const drift = parseFloat(driftStr);
    if (isNaN(drift)) continue;
    if (!participants.includes(agentA) || !participants.includes(agentB)) continue;

    drifts.push({ agentA, agentB, drift, reason: reason || '' });
  }

  if (drifts.length > 0) {
    await applyRelationshipDrifts(drifts);
    logger.info(`Applied ${drifts.length} relationship drifts`);
  }

  // ─── 提取行动项（仅 standup/debate）───
  if (format === 'standup' || format === 'debate') {
    let actionCount = 0;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // 检查今日已有多少自动行动项
    const todayActions = await db.opsMissionProposal.count({
      where: {
        source: 'reaction',
        createdAt: { gte: todayStart },
      },
    });

    for (const line of lines) {
      if (!line.startsWith('ACTION|')) continue;
      if (todayActions + actionCount >= 3) break;

      const parts = line.slice(7).split('|').map((p) => p.trim());
      if (parts.length < 4) continue;

      const [agentId, title, description, stepKind] = parts;
      if (!participants.includes(agentId)) continue;

      const validStepKinds = ['analyze', 'write_article', 'draft_social', 'crawl'];
      if (!validStepKinds.includes(stepKind)) continue;

      try {
        await createProposal({
          agentId,
          title,
          description,
          source: 'reaction',
          planResult: {
            steps: [{
              kind: stepKind,
              agent: STEP_AGENT_MAP[stepKind] || agentId,
              agentName: await getAgentName(STEP_AGENT_MAP[stepKind] || agentId),
              reason: '圆桌讨论行动项',
            }],
            confidence: 0.85,
            method: 'rule',
          },
        });
        actionCount++;
        logger.info(`Created action item proposal: "${title}" for ${agentId}`);
      } catch (error) {
        logger.error(`Failed to create action item proposal`, error);
      }
    }
  }
}
