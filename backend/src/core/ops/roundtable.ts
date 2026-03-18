import { getDb } from '../db/client';
import { getLogger } from '../util/logger';
import { getAgents } from './agents';
import type { AgentDefinition } from './agents';
import { getAffinityScore } from './relationships';
import { getPolicy } from './policy';
import { llmGenerate, llmStream } from '../llm/provider';
import { buildAgentSystemPrompt } from '../llm/agent-prompt';
import { buildTools } from '../tools/registry';
import { TOOL_ROUTES } from '../tools/tool-routes';
import { extractMemoriesFromTranscript } from '../llm/memory-extractor';
import { EventEmitter } from 'events';

const logger = getLogger('roundtable');

export const roundtableEmitter = new EventEmitter();
roundtableEmitter.setMaxListeners(50);

export type RoundtableFormat = 'standup' | 'debate' | 'chat';

export interface RoundtableConfig {
  title: string;
  format: RoundtableFormat;
  participants: string[];
  description?: string;   // 讨论背景/说明
  priorContext?: string;   // 前序步骤的分析结果
}

export interface RoundtableResult {
  sessionId: number;
  transcript: string;
  rounds: number;
}

const FORMAT_PROMPTS: Record<RoundtableFormat, string> = {
  standup: '这是一场站会（standup），每人简要汇报进展、计划和阻碍。语气简洁高效，聚焦行动项。',
  debate: '这是一场辩论（debate），参与者对议题持不同观点，深入讨论利弊。允许反驳和质疑，鼓励观点碰撞。',
  chat: '这是一场自由闲聊（watercooler），氛围轻松，鼓励发散思维和创意碰撞。不需要太正式。',
};

const FORMAT_BOOST: Record<RoundtableFormat, number> = {
  debate: 1.3,
  standup: 0.7,
  chat: 1.0,
};

/** Tutorial Ch2: format-specific round limits and temperature */
const FORMAT_PARAMS: Record<RoundtableFormat, { minRounds: number; maxRounds: number; temperature: number }> = {
  standup: { minRounds: 6, maxRounds: 12, temperature: 0.7 },
  debate:  { minRounds: 6, maxRounds: 10, temperature: 0.8 },
  chat:    { minRounds: 2, maxRounds: 5,  temperature: 0.9 },
};

const REACTION_THRESHOLD = 0.5;

// ─── 回应意愿分（纯规则，零 LLM 开销） ───

async function computeReactionScore(
  agentId: string,
  lastSpeaker: string,
  recentSpeakers: string[],
  format: RoundtableFormat,
  participantCount: number,
): Promise<number> {
  if (agentId === lastSpeaker) return 0;

  const affinity = await getAffinityScore(agentId, lastSpeaker);
  const affinityFactor = Math.abs(affinity - 0.5) * 2 + 0.3;

  const lastIdx = recentSpeakers.lastIndexOf(agentId);
  let recencyDecay: number;
  if (lastIdx === -1) {
    recencyDecay = 3.0;
  } else {
    const distance = recentSpeakers.length - lastIdx;
    recencyDecay = Math.max(0.3, distance / participantCount);
  }

  const formatBoost = FORMAT_BOOST[format];
  const jitter = 1 + 0.2 * (Math.random() * 2 - 1);

  return affinityFactor * recencyDecay * formatBoost * jitter;
}

// ─── 主持人判断（仅冷场时调用一次轻量 LLM） ───

async function moderatorDecide(
  transcriptLines: string[],
  participants: string[],
  format: RoundtableFormat,
): Promise<{ next: string | null; topic_hint?: string }> {
  const recent = transcriptLines.slice(-3).join('\n');
  const prompt = `你是圆桌会议主持人。根据当前讨论判断：
- 如果还有值得展开的观点/分歧，指定下一位发言者，返回 JSON: {"next":"agent_id","topic_hint":"建议讨论方向"}
- 如果讨论已充分或陷入重复，返回: {"next":null}

参与者 ID 列表: ${participants.join(', ')}
会议格式: ${format}
最近 3 条发言:
${recent}

只返回 JSON，不要其他内容。`;

  const { text: moderatorText } = await llmGenerate({ system: '你是一个简洁的 JSON 生成器。', prompt, maxTokens: 128 });
  try {
    const cleaned = moderatorText.replace(/```json?\s*|\s*```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    logger.warn('Moderator returned non-JSON, ending session');
    return { next: null };
  }
}

function getToneHint(score: number, speakerName: string, lastSpeakerName: string): string {
  if (score > 0.7) {
    return `你和 ${lastSpeakerName} 关系不错，语气可以友好、支持性的。`;
  }
  if (score < 0.4) {
    return `你和 ${lastSpeakerName} 观点经常不合，可以直接质疑和挑战对方的观点。`;
  }
  return `你和 ${lastSpeakerName} 关系一般，保持中立专业。`;
}

// ─── 单次发言执行 ───

interface SpeakContext {
  sessionId: number;
  round: number;
  speakerId: string;
  agent: AgentDefinition;
  allAgents: AgentDefinition[];
  memories: any[];
  transcriptLines: string[];
  recentSpeakers: string[];
  lastSpeaker: string | null;
  participants: string[];
  format: RoundtableFormat;
  title: string;
  backgroundBlock: string;
  topicHint?: string;
}

async function executeTurn(ctx: SpeakContext): Promise<string> {
  const { sessionId, round, speakerId, agent, allAgents, memories,
    transcriptLines, recentSpeakers, lastSpeaker, participants,
    format, title, backgroundBlock, topicHint } = ctx;

  const db = getDb();
  const system = await buildAgentSystemPrompt(agent, memories);
  const conversationContext = transcriptLines.length > 0
    ? `\n\n之前的对话：\n${transcriptLines.join('\n')}`
    : '';

  let toneHint = '';
  if (lastSpeaker && lastSpeaker !== speakerId) {
    const score = await getAffinityScore(speakerId, lastSpeaker);
    const lastAgent = allAgents.find((a) => a.id === lastSpeaker);
    if (lastAgent) {
      toneHint = `\n${getToneHint(score, agent.name, lastAgent.name)}`;
    }
  }

  const participantNames = participants.map((p) => {
    const a = allAgents.find(ag => ag.id === p);
    return a ? a.name : p;
  }).join(', ');

  const hintLine = topicHint ? `\n主持人建议方向：${topicHint}` : '';

  const prompt = `${FORMAT_PROMPTS[format]}

讨论主题：${title}
${backgroundBlock ? `${backgroundBlock}\n` : ''}参与者：${participantNames}
第 ${round + 1} 条发言
${conversationContext}
${toneHint}${hintLine}
现在轮到你（${agent.name}）发言。
重要要求：
- 必须紧扣上面的「讨论主题」和「背景说明」，不要偏离到其他话题
- 用 1-3 句话回应，保持人设风格
- 直接输出发言内容，不要加前缀`;

  roundtableEmitter.emit('turn_start', {
    sessionId, round, speakerId, speakerName: agent.name,
  });

  const tools = buildTools(TOOL_ROUTES['roundtable'] || []);
  const formatTemp = FORMAT_PARAMS[format]?.temperature;
  let fullText = '';
  const stream = llmStream({ system, prompt, maxTokens: 256, modelId: agent.modelId, tools, maxSteps: 2, temperature: formatTemp });
  for await (const chunk of stream.textStream) {
    fullText += chunk;
    roundtableEmitter.emit('token', { sessionId, token: chunk });
  }
  fullText = fullText.trim();

  roundtableEmitter.emit('turn_end', {
    sessionId, round, speakerId, speakerName: agent.name, fullText,
  });

  const line = `${agent.name}: ${fullText}`;
  transcriptLines.push(line);
  recentSpeakers.push(speakerId);

  await db.opsRoundtableSession.update({
    where: { id: sessionId },
    data: { transcript: transcriptLines.join('\n'), totalRounds: round + 1 },
  });

  logger.info(`Turn ${round + 1}: ${agent.name} spoke (session ${sessionId})`);

  return speakerId;
}

// ─── 核心反应驱动循环 ───

async function runReactionLoop(
  sessionId: number,
  config: RoundtableConfig,
  maxRounds: number,
): Promise<{ transcriptLines: string[]; totalTurns: number }> {
  const db = getDb();
  const { title, format, participants, description, priorContext } = config;

  const backgroundBlock = [
    description ? `背景说明：${description}` : '',
    priorContext || '',
  ].filter(Boolean).join('\n');

  const transcriptLines: string[] = [];
  const recentSpeakers: string[] = [];
  let lastSpeaker: string | null = null;
  let turnCount = 0;

  const allAgents = await getAgents();
  const findAgent = (id: string): AgentDefinition => allAgents.find(a => a.id === id) || allAgents[0];

  // 预加载记忆
  const agentMemories = new Map<string, any[]>();
  for (const pid of participants) {
    const mems = await db.opsAgentMemory.findMany({
      where: { agentId: pid },
      orderBy: { id: 'desc' },
      take: 20,
    });
    agentMemories.set(pid, mems);
  }

  const makeCtx = (speakerId: string, topicHint?: string): SpeakContext => ({
    sessionId,
    round: turnCount,
    speakerId,
    agent: findAgent(speakerId),
    allAgents,
    memories: agentMemories.get(speakerId) || [],
    transcriptLines,
    recentSpeakers,
    lastSpeaker,
    participants,
    format,
    title,
    backgroundBlock,
    topicHint,
  });

  // ─── Phase 1: 开场轮，每人按序说一句 ───
  logger.info(`Session ${sessionId} Phase 1: opening round (${participants.length} participants)`);
  for (const pid of participants) {
    if (turnCount >= maxRounds) break;
    lastSpeaker = await executeTurn(makeCtx(pid));
    turnCount++;
  }

  // ─── Phase 2: 反应循环 ───
  logger.info(`Session ${sessionId} Phase 2: reaction loop`);
  while (turnCount < maxRounds) {
    // 1. 计算所有人的回应意愿分
    const scores: { agentId: string; score: number }[] = [];
    for (const pid of participants) {
      if (pid === lastSpeaker) continue;
      const score = await computeReactionScore(pid, lastSpeaker!, recentSpeakers, format, participants.length);
      if (score > REACTION_THRESHOLD) {
        scores.push({ agentId: pid, score });
      }
    }
    scores.sort((a, b) => b.score - a.score);

    if (scores.length > 0) {
      // 3. 取队首发言
      const next = scores[0].agentId;
      logger.info(`Reaction: ${next} (score ${scores[0].score.toFixed(2)})`);
      lastSpeaker = await executeTurn(makeCtx(next));
      turnCount++;
      continue;
    }

    // 4. 队列为空 → 主持人判断
    logger.info(`Session ${sessionId}: reaction queue empty, asking moderator`);
    const decision = await moderatorDecide(transcriptLines, participants, format);

    if (!decision.next || !participants.includes(decision.next)) {
      logger.info(`Session ${sessionId}: moderator says end`);
      break;
    }

    logger.info(`Session ${sessionId}: moderator picks ${decision.next}`);
    lastSpeaker = await executeTurn(makeCtx(decision.next, decision.topic_hint));
    turnCount++;
  }

  if (turnCount >= maxRounds) {
    logger.info(`Session ${sessionId}: hit cap gate (${maxRounds} rounds)`);
  }

  return { transcriptLines, totalTurns: turnCount };
}

// ─── 核心：执行圆桌对话（同步，等待完成） ───

/** 超时包装器 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

const ROUNDTABLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 分钟

export async function runRoundtable(config: RoundtableConfig): Promise<RoundtableResult> {
  const db = getDb();
  const { title, format, participants } = config;

  const capGates = await getPolicy<Record<string, number>>('cap_gates', {});
  const formatMax = FORMAT_PARAMS[format]?.maxRounds ?? 20;
  const maxRounds = Math.min(capGates.roundtable_max_rounds ?? 20, formatMax);

  logger.info(`Running roundtable "${title}" (${format}, max ${maxRounds} rounds, temp ${FORMAT_PARAMS[format]?.temperature ?? 'default'}, ${participants.length} participants)`);

  const session = await db.opsRoundtableSession.create({
    data: {
      title,
      format,
      participants: participants.join(','),
      transcript: '',
      status: 'running',
      totalRounds: 0,
    },
  });

  logger.info(`Created roundtable session ${session.id}`);

  let transcriptLines: string[] = [];
  let totalTurns = 0;
  let timedOut = false;

  try {
    const result = await withTimeout(
      runReactionLoop(session.id, config, maxRounds),
      ROUNDTABLE_TIMEOUT_MS,
      `roundtable "${title}"`,
    );
    transcriptLines = result.transcriptLines;
    totalTurns = result.totalTurns;
  } catch (err) {
    timedOut = true;
    logger.warn(`Roundtable "${title}" (session ${session.id}) timed out, saving partial transcript`);
    // 从 DB 读取已有的 transcript（executeTurn 每轮都会写入）
    const current = await db.opsRoundtableSession.findUnique({ where: { id: session.id } });
    if (current?.transcript) {
      transcriptLines = current.transcript.split('\n');
      totalTurns = current.totalRounds;
    }
  }

  const transcript = transcriptLines.join('\n');

  await db.opsRoundtableSession.update({
    where: { id: session.id },
    data: { status: 'finished', transcript, totalRounds: totalTurns },
  });

  logger.info(`Roundtable "${title}" ${timedOut ? 'timed out and saved' : 'finished'} (session ${session.id}), extracting memories...`);
  if (transcriptLines.length > 0) {
    await extractMemoriesFromTranscript(transcript, participants, format);
    logger.info(`Roundtable "${title}" memory extraction done`);
  }

  roundtableEmitter.emit('done', { sessionId: session.id });

  return { sessionId: session.id, transcript, rounds: totalTurns };
}

/**
 * 创建 session 后 fire-and-forget 执行圆桌，返回 sessionId 供 SSE 订阅。
 */
export async function startRoundtable(config: RoundtableConfig): Promise<number> {
  const db = getDb();

  const session = await db.opsRoundtableSession.create({
    data: {
      title: config.title,
      format: config.format,
      participants: config.participants.join(','),
      transcript: '',
      status: 'running',
      totalRounds: 0,
    },
  });

  // fire-and-forget — 在后台运行
  runRoundtableForSession(session.id, config).catch(err => {
    logger.error(`startRoundtable session ${session.id} failed`, err);
    roundtableEmitter.emit('error', { sessionId: session.id, error: String(err) });
    db.opsRoundtableSession.update({
      where: { id: session.id },
      data: { status: 'failed' },
    }).catch(() => {});
  });

  return session.id;
}

/**
 * 内部：用已有的 sessionId 执行圆桌对话（跳过 session 创建）
 */
async function runRoundtableForSession(sessionId: number, config: RoundtableConfig): Promise<void> {
  const db = getDb();
  const { title, format, participants } = config;

  const capGates = await getPolicy<Record<string, number>>('cap_gates', {});
  const maxRounds = capGates.roundtable_max_rounds ?? 20;

  logger.info(`Running roundtable "${title}" for session ${sessionId} (${format}, max ${maxRounds} rounds, ${participants.length} participants)`);

  let transcriptLines: string[] = [];
  let totalTurns = 0;
  let timedOut = false;

  try {
    const result = await withTimeout(
      runReactionLoop(sessionId, config, maxRounds),
      ROUNDTABLE_TIMEOUT_MS,
      `roundtable "${title}" (session ${sessionId})`,
    );
    transcriptLines = result.transcriptLines;
    totalTurns = result.totalTurns;
  } catch {
    timedOut = true;
    logger.warn(`Roundtable "${title}" (session ${sessionId}) timed out, saving partial transcript`);
    const current = await db.opsRoundtableSession.findUnique({ where: { id: sessionId } });
    if (current?.transcript) {
      transcriptLines = current.transcript.split('\n');
      totalTurns = current.totalRounds;
    }
  }

  const transcript = transcriptLines.join('\n');

  await db.opsRoundtableSession.update({
    where: { id: sessionId },
    data: { status: 'finished', transcript, totalRounds: totalTurns },
  });

  logger.info(`Roundtable "${title}" ${timedOut ? 'timed out and saved' : 'finished'} (session ${sessionId})`);
  if (transcriptLines.length > 0) {
    await extractMemoriesFromTranscript(transcript, participants, format);
    logger.info(`Roundtable "${title}" memory extraction done`);
  }

  roundtableEmitter.emit('done', { sessionId });
}

// ─── 队列模式（用于心跳异步处理） ───

export async function enqueueRoundtable(config: RoundtableConfig): Promise<void> {
  const db = getDb();

  await db.opsRoundtableQueue.create({
    data: {
      sessionTitle: config.title,
      format: config.format,
      participants: config.participants.join(','),
      status: 'queued',
    },
  });

  logger.info(`Enqueued roundtable "${config.title}"`);
}

export async function processRoundtableQueue(): Promise<void> {
  const db = getDb();

  const item = await db.opsRoundtableQueue.findFirst({
    where: { status: 'queued' },
    orderBy: { id: 'asc' },
  });

  if (!item) return;

  await db.opsRoundtableQueue.update({
    where: { id: item.id },
    data: { status: 'running' },
  });

  try {
    const participants = item.participants.split(',');
    const format = item.format as RoundtableFormat;

    await runRoundtable({
      title: item.sessionTitle,
      format,
      participants,
    });

    await db.opsRoundtableQueue.update({
      where: { id: item.id },
      data: { status: 'finished' },
    });
  } catch (error) {
    logger.error(`Roundtable queue item ${item.id} failed`, error);
    await db.opsRoundtableQueue.update({
      where: { id: item.id },
      data: { status: 'failed' },
    });
  }
}
