import { getDb } from '../db/client';
import { PLATFORMS, getPlatformOwner } from './platforms';

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  style: string;
  catchphrase: string;
  perspective: string;
  modelId?: string | null;
  parentId?: string;
}

const XALT_BASE = {
  role: '社媒运营 / 增长专家',
  style: '高能量、行动偏向，善于把握节奏。',
  catchphrase: '发出去，边迭代边改。',
  perspective: '遇到什么都想"现在就试"，偏好快速实验，讨厌过度分析。',
} as const;

const QUILL_BASE = {
  role: '创作者',
  style: '感性、叙事化，追求文字质感。',
  catchphrase: '但这里的叙事是什么？',
  perspective: '把什么都变成故事，关注情感共鸣和叙事弧线，讨厌干巴巴的列表。',
} as const;

/** 平台 ID → 子智能体 ID（根据 owner 决定前缀 xalt_ 或 quill_） */
export const PLATFORM_TO_AGENT: Record<string, string> = Object.keys(PLATFORMS).reduce(
  (acc, p) => {
    const owner = getPlatformOwner(p);
    acc[p] = `${owner}_${p}`;
    return acc;
  },
  {} as Record<string, string>,
);

export const AGENTS: AgentDefinition[] = [
  {
    id: 'minion',
    name: '协调者',
    role: '总指挥 / 协调者',
    style: '直接、强势，关注进度与优先级。',
    catchphrase: '底线——我们进展到哪了？',
    perspective: '结果导向，总问进度和截止日期，不容忍模糊的回答。',
  },
  {
    id: 'scout',
    name: '实习生',
    role: '情报员',
    style: '好奇、信息密集、快节奏。',
    catchphrase: '我刚看到一个有意思的信号……',
    perspective: '永远在发现新线索，信息密度高，习惯用"另外""还有一个点"串联。',
  },
  {
    id: 'sage',
    name: '数据分析师',
    role: '策略师',
    style: '谨慎、数据驱动，喜欢引用数字反驳。',
    catchphrase: '数据说的是另一个故事。',
    perspective: '每次开口都引用数字或案例，不相信直觉，要求看证据。',
  },
  {
    id: 'quill',
    name: '内容创作专家',
    role: '创作者',
    style: '感性、叙事化，追求文字质感。',
    catchphrase: '但这里的叙事是什么？',
    perspective: '把什么都变成故事，关注情感共鸣和叙事弧线，讨厌干巴巴的列表。',
  },
  {
    id: 'xalt',
    name: '社交媒体运营专家',
    ...XALT_BASE,
  },
  // xalt 子智能体：短内容平台
  ...Object.entries(PLATFORMS)
    .filter(([, cfg]) => cfg.owner === 'xalt')
    .map(([pid, cfg]) => ({
      id: `xalt_${pid}` as string,
      name: `社媒运营 · ${cfg.name}`,
      ...XALT_BASE,
      parentId: 'xalt' as const,
    })),
  // quill 子智能体：长内容平台
  ...Object.entries(PLATFORMS)
    .filter(([, cfg]) => cfg.owner === 'quill')
    .map(([pid, cfg]) => ({
      id: `quill_${pid}` as string,
      name: `内容创作 · ${cfg.name}`,
      ...QUILL_BASE,
      parentId: 'quill' as const,
    })),
  {
    id: 'observer',
    name: '监察组长',
    role: '观察者 / 质量守门人',
    style: '批判性、严谨、不放水。',
    catchphrase: '等等，这里有个问题没人注意到。',
    perspective: '横向思维，专找被忽略的风险和盲点，提出大胆质疑。',
  },
];

const DEFAULTS_MAP = new Map(AGENTS.map(a => [a.id, a]));

/** 获取单个 agent 配置（DB override 合并默认值） */
export async function getAgentConfig(id: string): Promise<(AgentDefinition & { customSystemPrompt?: string | null }) | null> {
  const base = DEFAULTS_MAP.get(id);
  if (!base) return null;

  const db = getDb();
  const override = await db.opsAgentConfig.findUnique({ where: { agentId: id } });
  if (!override) return { ...base };

  return {
    id: base.id,
    name: override.name ?? base.name,
    role: override.role ?? base.role,
    style: override.style ?? base.style,
    catchphrase: override.catchphrase ?? base.catchphrase,
    perspective: override.perspective ?? base.perspective,
    customSystemPrompt: override.customSystemPrompt,
    modelId: override.modelId,
  };
}

/** 获取全部 agents（合并 DB overrides） */
export async function getAgents(): Promise<AgentDefinition[]> {
  const db = getDb();
  const overrides = await db.opsAgentConfig.findMany();
  const overrideMap = new Map(overrides.map(o => [o.agentId, o]));

  return AGENTS.map(base => {
    const o = overrideMap.get(base.id);
    if (!o) return { ...base };
    return {
      id: base.id,
      name: o.name ?? base.name,
      role: o.role ?? base.role,
      style: o.style ?? base.style,
      catchphrase: o.catchphrase ?? base.catchphrase,
      perspective: o.perspective ?? base.perspective,
      modelId: o.modelId,
      parentId: base.parentId,
    };
  });
}

/** 获取单个 agent 详情（含 defaults 和 overrides 分离） */
export async function getAgentConfigDetail(id: string) {
  const base = DEFAULTS_MAP.get(id);
  if (!base) return null;

  const db = getDb();
  const override = await db.opsAgentConfig.findUnique({ where: { agentId: id } });

  return {
    defaults: { ...base },
    overrides: override ? {
      name: override.name,
      role: override.role,
      style: override.style,
      catchphrase: override.catchphrase,
      perspective: override.perspective,
      customSystemPrompt: override.customSystemPrompt,
      modelId: override.modelId,
    } : {},
    merged: {
      id: base.id,
      name: override?.name ?? base.name,
      role: override?.role ?? base.role,
      style: override?.style ?? base.style,
      catchphrase: override?.catchphrase ?? base.catchphrase,
      perspective: override?.perspective ?? base.perspective,
      customSystemPrompt: override?.customSystemPrompt ?? null,
      modelId: override?.modelId ?? null,
    },
  };
}

/** Upsert agent 配置到 DB */
export async function updateAgentConfig(id: string, data: {
  name?: string | null;
  role?: string | null;
  style?: string | null;
  catchphrase?: string | null;
  perspective?: string | null;
  customSystemPrompt?: string | null;
  modelId?: string | null;
}) {
  if (!DEFAULTS_MAP.has(id)) return null;

  const db = getDb();
  // Convert empty strings to null so defaults take over
  const cleaned: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(data)) {
    cleaned[k] = (v === '' || v === undefined) ? null : v;
  }

  return db.opsAgentConfig.upsert({
    where: { agentId: id },
    create: { agentId: id, ...cleaned },
    update: cleaned,
  });
}

/** 重置为默认（删除 DB 记录） */
export async function resetAgentConfig(id: string): Promise<boolean> {
  if (!DEFAULTS_MAP.has(id)) return false;
  const db = getDb();
  try {
    await db.opsAgentConfig.delete({ where: { agentId: id } });
  } catch {
    // not found — already default
  }
  return true;
}

/** 兼容旧接口 */
export async function renameAgent(id: string, name: string): Promise<AgentDefinition | null> {
  await updateAgentConfig(id, { name });
  return getAgentConfig(id);
}
