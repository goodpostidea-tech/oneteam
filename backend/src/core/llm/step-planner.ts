import { llmGenerate } from './provider';
import { getLogger } from '../util/logger';
import { PLATFORM_TO_AGENT } from '../ops/agents';
import { PLATFORMS, getPlatformOwner, SHORT_PLATFORMS, LONG_PLATFORMS } from '../ops/platforms';

const logger = getLogger('step-planner');

// ─── 步骤类型与 agent 映射（draft_social 由 platform 决定子智能体）───

const STEP_AGENT_MAP: Record<string, string> = {
  analyze: 'sage',
  crawl: 'scout',
  roundtable: 'minion',
  write_article: 'quill',
  draft_social: 'xalt',
};

const STEP_LABELS: Record<string, string> = {
  analyze: '分析研究',
  crawl: '信息采集',
  roundtable: '圆桌讨论',
  write_article: '撰写文章',
  draft_social: '生成社交内容',
};

export interface PlannedStep {
  kind: string;
  agent: string;
  agentName: string;
  reason: string;
  platform?: string;
}

export interface PlanResult {
  steps: PlannedStep[];
  confidence: number;  // 0-1, 规则匹配 ≥0.9, LLM 规划看情况
  method: 'rule' | 'llm';
}

// ─── 方案 A：规则模板匹配 ───

interface RuleTemplate {
  keywords: string[];
  steps: string[];
  reasons: string[];
}

const TEMPLATES: RuleTemplate[] = [
  {
    keywords: ['写文章', '写一篇', '小红书', '博客', '公众号', '文章'],
    steps: ['analyze', 'roundtable', 'write_article'],
    reasons: [
      '分析主题热度与目标受众',
      '多角度讨论内容方向和切入点',
      '基于分析和讨论撰写成稿',
    ],
  },
  {
    keywords: ['推文', '发推', '写推', 'tweet', '社交媒体', '微博', '小红书', '抖音', '知乎', '头条'],
    steps: ['analyze', 'draft_social'],
    reasons: [
      '分析话题要点和传播角度',
      '生成社交媒体内容',
    ],
  },
  {
    keywords: ['热点', '趋势', '扫描', '情报', '调研', '市场'],
    steps: ['crawl', 'analyze'],
    reasons: [
      '采集相关领域的最新信息',
      '对采集结果进行深度分析',
    ],
  },
  {
    keywords: ['分析', '研究', '评估', '复盘', '总结'],
    steps: ['analyze'],
    reasons: [
      '对主题进行结构化分析',
    ],
  },
  {
    keywords: ['讨论', '头脑风暴', '圆桌', '辩论', '碰撞'],
    steps: ['roundtable'],
    reasons: [
      '多智能体圆桌讨论，碰撞观点',
    ],
  },
  {
    keywords: ['内容策划', '内容规划', '选题'],
    steps: ['crawl', 'analyze', 'roundtable'],
    reasons: [
      '采集行业热点和竞品内容',
      '分析数据，提炼可行选题',
      '团队讨论确定最终方向',
    ],
  },
  {
    keywords: ['深度报告', '白皮书', '研报', '报告'],
    steps: ['crawl', 'analyze', 'roundtable', 'write_article'],
    reasons: [
      '大范围信息采集',
      '数据整理与深度分析',
      '多角度讨论报告框架',
      '撰写完整报告',
    ],
  },
  {
    keywords: ['推广', '营销', '传播', '运营方案'],
    steps: ['analyze', 'roundtable', 'draft_social', 'write_article'],
    reasons: [
      '分析目标受众和传播策略',
      '讨论推广方案和内容角度',
      '生成社交媒体传播文案',
      '撰写配套长文内容',
    ],
  },
];

function matchTemplate(input: string): { template: RuleTemplate; score: number } | null {
  const text = input.toLowerCase();
  let best: { template: RuleTemplate; score: number } | null = null;

  for (const tpl of TEMPLATES) {
    const hits = tpl.keywords.filter((k) => text.includes(k)).length;
    if (hits === 0) continue;

    // 匹配到的关键词数 / 总关键词数 = 匹配度
    const score = hits / Math.min(tpl.keywords.length, 3);
    if (!best || score > best.score) {
      best = { template: tpl, score: Math.min(score, 1) };
    }
  }

  return best;
}

async function templateToSteps(tpl: RuleTemplate): Promise<PlannedStep[]> {
  return Promise.all(tpl.steps.map(async (kind, i) => ({
    kind,
    agent: STEP_AGENT_MAP[kind] || 'minion',
    agentName: await getAgentName(STEP_AGENT_MAP[kind] || 'minion'),
    reason: tpl.reasons[i] || STEP_LABELS[kind] || kind,
  })));
}

export async function getAgentName(agentId: string): Promise<string> {
  const { getAgentConfig, AGENTS } = await import('../ops/agents');
  const config = await getAgentConfig(agentId);
  if (config) return config.name;
  const base = AGENTS.find(a => a.id === agentId);
  return base?.name || agentId;
}

// ─── 方案 B：LLM 规划 ───

const VALID_KINDS = ['analyze', 'crawl', 'roundtable', 'write_article', 'draft_social'];

async function llmPlanSteps(title: string, description?: string): Promise<PlannedStep[]> {
  const prompt = `你是一个任务规划器。根据用户的提案，决定需要哪些执行步骤、按什么顺序执行。

提案标题：${title}
${description ? `提案描述：${description}` : ''}

可用的步骤类型：
- analyze：分析研究（执行者：Sage 策略师）
- crawl：信息采集（执行者：Scout 情报员）
- roundtable：圆桌讨论（执行者：全体智能体）
- write_article：撰写文章（执行者：Quill 创作者）
- draft_social：生成社交媒体内容（执行者：Xalt 社媒运营及平台子智能体，支持：推特/微博/小红书/抖音/知乎/头条/公众号）

规则：
- 最少 1 步，最多 4 步
- 步骤顺序重要：后面的步骤会参考前面的结果
- 写文章类任务通常先 analyze 再 write_article
- 需要多角度意见时加 roundtable
- 需要外部信息时加 crawl

输出格式（每行一步）：
kind|一句话说明这步的目的

直接输出，不要其他内容。`;

  const { text } = await llmGenerate({
    system: '你是任务规划助手。输出简洁，严格按格式。',
    prompt,
    maxTokens: 256,
  });

  const steps: PlannedStep[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('|')) continue;

    const [kind, ...reasonParts] = trimmed.split('|');
    const cleanKind = kind.trim();
    const reason = reasonParts.join('|').trim();

    if (VALID_KINDS.includes(cleanKind)) {
      steps.push({
        kind: cleanKind,
        agent: STEP_AGENT_MAP[cleanKind] || 'minion',
        agentName: await getAgentName(STEP_AGENT_MAP[cleanKind] || 'minion'),
        reason: reason || STEP_LABELS[cleanKind] || cleanKind,
      });
    }
  }

  return steps.slice(0, 4);
}

// ─── 方案 C：规则兜底 + LLM 增强 ───

/**
 * Expand platform steps: split platforms by owner.
 * - short-form platforms → draft_social steps (xalt sub-agents)
 * - long-form platforms → write_article steps (quill sub-agents)
 * If platforms is empty, keep original steps unchanged.
 */
export async function expandPlatformSteps(steps: PlannedStep[], platforms?: string[]): Promise<PlannedStep[]> {
  if (!platforms || platforms.length === 0) return steps;

  const shortPlatforms = platforms.filter(p => getPlatformOwner(p) === 'xalt');
  const longPlatforms = platforms.filter(p => getPlatformOwner(p) === 'quill');

  const expanded: PlannedStep[] = [];

  for (const step of steps) {
    if (step.kind === 'draft_social') {
      // 展开短内容平台为 draft_social 子步骤
      for (const p of shortPlatforms) {
        const cfg = PLATFORMS[p];
        const agentId = PLATFORM_TO_AGENT[p] || `xalt_${p}`;
        expanded.push({
          kind: 'draft_social',
          agent: agentId,
          agentName: await getAgentName(agentId),
          reason: `为${cfg?.name || p}生成内容`,
          platform: p,
        });
      }
    } else if (step.kind === 'write_article') {
      if (longPlatforms.length > 0) {
        // 展开长内容平台为 write_article 子步骤
        for (const p of longPlatforms) {
          const cfg = PLATFORMS[p];
          const agentId = PLATFORM_TO_AGENT[p] || `quill_${p}`;
          expanded.push({
            kind: 'write_article',
            agent: agentId,
            agentName: await getAgentName(agentId),
            reason: `为${cfg?.name || p}撰写文章`,
            platform: p,
          });
        }
      } else {
        // 没有长内容平台，保留原始 write_article 步骤
        expanded.push(step);
      }
    } else {
      expanded.push(step);
    }
  }

  return expanded;
}

/**
 * 确保选了平台时步骤中包含对应类型的步骤。
 * - 选了短内容平台但没有 draft_social → 追加
 * - 选了长内容平台但没有 write_article → 追加
 */
async function ensureStepsForPlatforms(steps: PlannedStep[], platforms?: string[]): Promise<PlannedStep[]> {
  if (!platforms || platforms.length === 0) return steps;

  const hasShort = platforms.some(p => getPlatformOwner(p) === 'xalt');
  const hasLong = platforms.some(p => getPlatformOwner(p) === 'quill');

  if (hasShort && !steps.some(s => s.kind === 'draft_social')) {
    steps.push({
      kind: 'draft_social',
      agent: 'xalt',
      agentName: await getAgentName('xalt'),
      reason: '为目标平台生成社交内容',
    });
  }

  if (hasLong && !steps.some(s => s.kind === 'write_article')) {
    steps.push({
      kind: 'write_article',
      agent: 'quill',
      agentName: await getAgentName('quill'),
      reason: '为目标平台撰写长文内容',
    });
  }

  return steps;
}

export async function planStepsForProposal(
  title: string,
  description?: string,
  platforms?: string[],
): Promise<PlanResult> {
  const fullInput = `${title} ${description || ''}`;

  // 第一步：规则匹配
  const ruleMatch = matchTemplate(fullInput);

  if (ruleMatch && ruleMatch.score >= 0.5) {
    let steps = await templateToSteps(ruleMatch.template);
    steps = await ensureStepsForPlatforms(steps, platforms);
    steps = await expandPlatformSteps(steps, platforms);
    const confidence = 0.85 + ruleMatch.score * 0.1;
    logger.info(`Rule matched for "${title}": ${steps.map((s) => s.kind).join(' → ')} (confidence=${confidence.toFixed(2)})`);
    return { steps, confidence: Math.min(confidence, 0.95), method: 'rule' };
  }

  // 第二步：LLM 规划（加 15 秒超时）
  try {
    const llmPromise = llmPlanSteps(title, description);
    const timeoutPromise = new Promise<PlannedStep[]>((_, reject) =>
      setTimeout(() => reject(new Error('LLM planning timeout')), 15000),
    );
    let steps = await Promise.race([llmPromise, timeoutPromise]);
    if (steps.length > 0) {
      steps = await ensureStepsForPlatforms(steps, platforms);
      steps = await expandPlatformSteps(steps, platforms);
      logger.info(`LLM planned for "${title}": ${steps.map((s) => s.kind).join(' → ')}`);
      return { steps, confidence: 0.7, method: 'llm' };
    }
  } catch (error) {
    logger.error('LLM planning failed, using fallback', error);
  }

  // 兜底
  logger.info(`Fallback plan for "${title}": analyze`);
  let fallbackSteps: PlannedStep[] = [{
    kind: 'analyze',
    agent: 'sage',
    agentName: await getAgentName('sage'),
    reason: '对主题进行分析',
  }];
  fallbackSteps = await ensureStepsForPlatforms(fallbackSteps, platforms);
  fallbackSteps = await expandPlatformSteps(fallbackSteps, platforms);
  return {
    steps: fallbackSteps,
    confidence: 0.5,
    method: 'rule',
  };
}

/**
 * 父智能体决策：当用户未指定平台或内容类型时，分析提案内容决定内容形式和平台。
 * 规则优先（关键词匹配），LLM 兜底。
 * 返回推荐的平台列表，空数组表示不需要额外平台分发。
 */
export async function decideContentPlatforms(
  title: string,
  description?: string,
): Promise<{ platforms: string[]; reasoning: string }> {
  const text = `${title} ${description || ''}`.toLowerCase();

  // ── 规则匹配：关键词 → 平台 ──
  const SHORT_KEYWORDS: Record<string, string[]> = {
    tweet:       ['推特', 'twitter', 'x平台', '发推'],
    weibo:       ['微博', 'weibo'],
    xiaohongshu: ['小红书', '种草', '笔记'],
    douyin:      ['抖音', '短视频', 'tiktok'],
  };
  const LONG_KEYWORDS: Record<string, string[]> = {
    wechat_mp:   ['公众号', '微信', 'wechat'],
    zhihu:       ['知乎', '回答', '问答'],
    toutiao:     ['头条', '今日头条'],
  };
  const GENERIC_SHORT = ['推文', '文案', '社交', '传播', '短文'];
  const GENERIC_LONG = ['文章', '博客', '长文', '深度', '报告', '白皮书'];

  const matched: string[] = [];
  for (const [pid, kws] of Object.entries(SHORT_KEYWORDS)) {
    if (kws.some(k => text.includes(k))) matched.push(pid);
  }
  for (const [pid, kws] of Object.entries(LONG_KEYWORDS)) {
    if (kws.some(k => text.includes(k))) matched.push(pid);
  }

  if (matched.length > 0) {
    return { platforms: matched, reasoning: `关键词匹配到平台: ${matched.join(', ')}` };
  }

  // 泛指短内容 / 长内容
  const wantShort = GENERIC_SHORT.some(k => text.includes(k));
  const wantLong = GENERIC_LONG.some(k => text.includes(k));

  if (wantShort && !wantLong) {
    return { platforms: SHORT_PLATFORMS.slice(0, 3), reasoning: '检测到短内容意图，推荐主流短内容平台' };
  }
  if (wantLong && !wantShort) {
    return { platforms: ['wechat_mp'], reasoning: '检测到长文意图，推荐公众号' };
  }
  if (wantShort && wantLong) {
    return { platforms: ['wechat_mp', ...SHORT_PLATFORMS.slice(0, 2)], reasoning: '同时包含长短内容意图，推荐组合分发' };
  }

  // 无法判断 → 不自动分发，由基础步骤处理
  return { platforms: [], reasoning: '未检测到明确的平台或内容类型意图' };
}

// 导出给 dispatcher 使用
export { STEP_AGENT_MAP };
