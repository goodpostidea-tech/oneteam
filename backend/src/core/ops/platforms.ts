export interface PlatformConfig {
  name: string;
  maxLen: number;
  tags: boolean;
  emoji: boolean;
  format: 'short' | 'note' | 'hook' | 'answer' | 'article';
  count: number;
  /** 归属哪个父智能体：短内容→xalt，长内容→quill */
  owner: 'xalt' | 'quill';
}

export const PLATFORMS: Record<string, PlatformConfig> = {
  // ── 短内容平台 → xalt ──
  tweet:       { name: '推特/X',     maxLen: 280,   tags: true,  emoji: true,  format: 'short',   count: 3, owner: 'xalt' },
  weibo:       { name: '微博',       maxLen: 1000,  tags: true,  emoji: true,  format: 'short',   count: 3, owner: 'xalt' },
  xiaohongshu: { name: '小红书',     maxLen: 1000,  tags: true,  emoji: true,  format: 'note',    count: 1, owner: 'xalt' },
  douyin:      { name: '抖音',       maxLen: 300,   tags: true,  emoji: true,  format: 'hook',    count: 3, owner: 'xalt' },
  // ── 长内容平台 → quill ──
  zhihu:       { name: '知乎',       maxLen: 5000,  tags: false, emoji: false, format: 'answer',  count: 1, owner: 'quill' },
  toutiao:     { name: '今日头条',    maxLen: 5000,  tags: true,  emoji: false, format: 'article', count: 1, owner: 'quill' },
  wechat_mp:   { name: '微信公众号',  maxLen: 10000, tags: false, emoji: false, format: 'article', count: 1, owner: 'quill' },
};

export type PlatformId = keyof typeof PLATFORMS;

export const PLATFORM_LIST = Object.entries(PLATFORMS).map(([id, cfg]) => ({ id, ...cfg }));

/** 短内容平台 ID 列表（归属 xalt） */
export const SHORT_PLATFORMS = Object.entries(PLATFORMS).filter(([, c]) => c.owner === 'xalt').map(([id]) => id);
/** 长内容平台 ID 列表（归属 quill） */
export const LONG_PLATFORMS = Object.entries(PLATFORMS).filter(([, c]) => c.owner === 'quill').map(([id]) => id);

/** 判断平台归属 */
export function getPlatformOwner(platformId: string): 'xalt' | 'quill' {
  return PLATFORMS[platformId]?.owner || 'xalt';
}

const FORMAT_TEMPLATES: Record<string, (topic: string, cfg: PlatformConfig) => string> = {
  short: (topic, cfg) => `请为以下话题生成 ${cfg.count} 条${cfg.name}文案。

话题：${topic}

要求：
- 每条独立一行
- 每条不超过 ${cfg.maxLen} 字符
- 风格适合${cfg.name}传播
${cfg.emoji ? '- 可适当使用 emoji' : '- 不使用 emoji'}
${cfg.tags ? '- 末尾加 2-3 个标签（如 #AI #科技）' : ''}
- 不要编号，直接输出内容`,

  note: (topic, cfg) => `请为以下话题撰写一篇${cfg.name}种草笔记。

话题：${topic}

要求：
- 标题吸引眼球，善用 emoji
- 正文 300-800 字，口语化、有感染力
- 分段清晰，每段 2-3 句
- 善用 emoji 作为段落装饰
- 末尾加 5-8 个相关标签（如 #AI工具推荐 #效率提升）
- 输出格式：第一行为标题，空一行后为正文`,

  hook: (topic, cfg) => `请为以下话题生成 ${cfg.count} 条${cfg.name}短视频文案。

话题：${topic}

要求：
- 每条独立用 --- 分隔
- 每条包含：开头hook（吸引停留的第一句话）+ 正文（2-3 句核心内容）+ 结尾引导（引导评论/关注）
- 总长度不超过 ${cfg.maxLen} 字
- 口语化、节奏快
${cfg.emoji ? '- 适当使用 emoji' : ''}
${cfg.tags ? '- 每条末尾加 3-5 个标签' : ''}`,

  answer: (topic, cfg) => `请为以下话题撰写一篇${cfg.name}风格的深度回答。

话题：${topic}

要求：
- 开头直接给出核心观点（不要"谢邀"等套话）
- 正文 800-2000 字，逻辑严密、有论据支撑
- 分 3-5 个要点展开，每个要点有小标题
- 语气专业但不晦涩，适当加入个人见解
- 结尾总结观点
- 不使用 emoji`,

  article: (topic, cfg) => `请为以下话题撰写一篇适合${cfg.name}发布的文章。

话题：${topic}

要求：
- 标题简洁有力
- 正文 1000-3000 字
- 结构清晰：引言、正文（3-5 个章节）、结语
- 每个章节有小标题
- 语气正式、信息密度高
${cfg.tags ? '- 末尾加 3-5 个关键词标签' : ''}
- 不使用 emoji
- 输出格式：第一行为标题，空一行后为正文`,
};

/**
 * Build platform-specific content generation prompt
 */
export function buildPlatformPrompt(
  platformId: string,
  topic: string,
  extras?: { description?: string; style?: string; priorContext?: string },
): string {
  const cfg = PLATFORMS[platformId];
  if (!cfg) return `请为以下话题生成社交媒体内容：${topic}`;

  const template = FORMAT_TEMPLATES[cfg.format];
  if (!template) return `请为以下话题生成${cfg.name}内容：${topic}`;

  let prompt = template(topic, cfg);

  if (extras?.description) prompt += `\n\n补充说明：${extras.description}`;
  if (extras?.style) prompt += `\n风格要求：${extras.style}`;
  if (extras?.priorContext) prompt += `\n\n参考资料：\n${extras.priorContext}`;

  return prompt;
}
