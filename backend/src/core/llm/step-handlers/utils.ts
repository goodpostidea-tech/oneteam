/**
 * 将前序步骤的结果格式化为 prompt 上下文
 */
export function formatPriorContext(payload: Record<string, unknown>): string {
  const prior = payload._priorResults as Array<{ kind: string; result: Record<string, unknown> }> | undefined;
  if (!prior || prior.length === 0) return '';

  const parts = prior.map((p) => {
    const resultStr = Object.entries(p.result)
      .map(([k, v]) => {
        if (typeof v === 'string') return `${k}: ${v}`;
        if (Array.isArray(v)) return `${k}: ${v.join('; ')}`;
        return `${k}: ${JSON.stringify(v)}`;
      })
      .join('\n');
    return `[${p.kind} 步骤结果]\n${resultStr}`;
  });

  return `\n前序步骤的分析结果（请参考）：\n${parts.join('\n\n')}`;
}

/**
 * 将该 agent 近期同类步骤的产出格式化为"避免重复"上下文
 */
export function formatRecentHistory(payload: Record<string, unknown>): string {
  const history = payload._recentHistory as Array<{
    missionTitle: string;
    result: Record<string, unknown>;
    finishedAt?: string;
  }> | undefined;
  if (!history || history.length === 0) return '';

  const summaries = history.map((h, i) => {
    // 从 result 中提取摘要性字段，限制长度
    const fields = Object.entries(h.result)
      .map(([k, v]) => {
        if (typeof v === 'string') return `${k}: ${v.slice(0, 150)}`;
        if (Array.isArray(v)) return `${k}: ${v.slice(0, 3).join('; ')}`;
        return null;
      })
      .filter(Boolean);
    return `${i + 1}. 「${h.missionTitle}」\n   ${fields.join('\n   ')}`;
  });

  return `\n⚠️ 你最近已完成的同类工作（请务必换一个全新的角度、话题或切入点，不要重复这些内容）：\n${summaries.join('\n')}`;
}
