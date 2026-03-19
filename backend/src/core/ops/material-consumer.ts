import { getDb } from '../db/client';
import { getLogger } from '../util/logger';
import { getPolicy } from './policy';
import { llmGenerate } from '../llm/provider';
import { createProposal } from './proposal-service';
import { STEP_AGENT_MAP, getAgentName } from '../llm/step-planner';

const logger = getLogger('material-consumer');

/**
 * 素材消费者：心跳子系统
 * 拾取 status='new' & summaryStatus='done' 的素材，
 * 调 LLM 判断该做什么，创建提案，标记素材 used。
 */
export async function consumeMaterials(): Promise<void> {
  const db = getDb();

  const policy = await getPolicy('material_consumer', {
    enabled: true,
    batch_size: 3,
  });

  if (!policy.enabled) return;

  // 查找可消费的素材：有摘要、状态为 new
  const materials = await db.opsMaterial.findMany({
    where: {
      status: 'new',
      summaryStatus: 'done',
      summary: { not: null },
    },
    orderBy: { createdAt: 'asc' },
    take: policy.batch_size || 3,
  });

  if (materials.length === 0) return;

  logger.info(`Material consumer: ${materials.length} materials to process`);

  for (const mat of materials) {
    try {
      // 检查是否已有基于此素材的提案（避免重复）
      const existing = await db.opsMissionProposal.findFirst({
        where: { materialId: mat.id },
      });
      if (existing) {
        // 已有提案，只标记 used
        await db.opsMaterial.update({ where: { id: mat.id }, data: { status: 'used' } });
        continue;
      }

      // 调 LLM 判断应该做什么
      const context = [
        `标题: ${mat.title || '无标题'}`,
        mat.url ? `链接: ${mat.url}` : '',
        `摘要: ${mat.summary}`,
        mat.tags && (mat.tags as string[]).length > 0 ? `标签: ${(mat.tags as string[]).join(', ')}` : '',
      ].filter(Boolean).join('\n');

      const { text } = await llmGenerate({
        system: `你是一个内容运营助手。根据素材内容，判断最适合的处理方式并输出提案。

可选的步骤类型：
- analyze: 深度分析（适合数据、趋势、策略类内容）
- write_article: 撰写文章（适合有深度、有观点的内容）
- draft_social: 生成社交媒体内容（适合热点、新闻、短资讯）
- crawl: 扩展搜索（适合线索类信息，需要搜集更多资料）

输出格式（严格遵循）：
TITLE|基于素材的提案标题（10-30字）
DESC|为什么要做这件事（1-2句话）
KIND|步骤类型
AGENT|最适合的智能体（sage/scout/quill/xalt）`,
        prompt: context,
        maxTokens: 300,
      });

      const titleMatch = text.match(/TITLE\|(.+)/);
      const descMatch = text.match(/DESC\|(.+)/);
      const kindMatch = text.match(/KIND\|(.+)/);
      const agentMatch = text.match(/AGENT\|(.+)/);

      const title = titleMatch?.[1]?.trim();
      const description = descMatch?.[1]?.trim();
      const kind = kindMatch?.[1]?.trim();
      const agentId = agentMatch?.[1]?.trim();

      const validKinds = ['analyze', 'write_article', 'draft_social', 'crawl'];
      const validAgents = ['sage', 'scout', 'quill', 'xalt', 'minion'];

      if (!title || !validKinds.includes(kind || '')) {
        logger.warn(`Material consumer: invalid LLM output for material ${mat.id}, skipping`);
        continue;
      }

      const finalAgent = validAgents.includes(agentId || '') ? agentId! : STEP_AGENT_MAP[kind!] || 'sage';
      const stepKind = kind!;

      const result = await createProposal({
        agentId: finalAgent,
        title: `[素材] ${title}`,
        description: description || undefined,
        source: 'material',
        materialId: mat.id,
        planResult: {
          steps: [{
            kind: stepKind,
            agent: STEP_AGENT_MAP[stepKind] || finalAgent,
            agentName: await getAgentName(STEP_AGENT_MAP[stepKind] || finalAgent),
            reason: `基于素材: ${mat.title || mat.url || ''}`,
          }],
          confidence: 0.85,
          method: 'rule',
        },
      });

      // 标记素材为 used
      await db.opsMaterial.update({
        where: { id: mat.id },
        data: { status: 'used' },
      });

      logger.info(
        `Material ${mat.id} → proposal ${result.proposalId} (${result.status}) by ${finalAgent}, kind=${stepKind}`,
      );
    } catch (error) {
      logger.error(`Material consumer failed for material ${mat.id}`, error);
    }
  }
}
