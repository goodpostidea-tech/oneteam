import { getDb } from '../db/client';
import { getLogger } from '../util/logger';
import { PLATFORMS } from './platforms';

const logger = getLogger('outbox-writer');

/**
 * After a step succeeds, save publishable content to the outbox tables.
 * - write_article → OpsArticleDraft (with optional platform for quill sub-agents)
 * - draft_social → OpsTweetDraft (one row per post per platform)
 */
export async function saveToOutbox(
  step: { id: number; missionId: number; kind: string },
  result: any,
): Promise<void> {
  const db = getDb();

  try {
    if (step.kind === 'write_article' && result) {
      const title = result.title || result.headline || '未命名文章';
      const content = result.content || result.article || result.text || '';
      if (!content) return;

      const platform = result.platform || null;
      const platformName = platform ? (PLATFORMS[platform]?.name || platform) : null;

      await db.opsArticleDraft.create({
        data: {
          stepId: step.id,
          missionId: step.missionId,
          title,
          content,
          platform,
          status: 'draft',
        },
      });
      logger.info(`Article draft saved for step ${step.id}${platformName ? ` (${platformName})` : ''}`);
    }

    if ((step.kind === 'draft_tweet' || step.kind === 'draft_social') && result) {
      const platform = result?.platform || 'tweet';
      let posts: string[] = [];

      if (result.posts && Array.isArray(result.posts)) {
        posts = result.posts.map((t: any) => typeof t === 'string' ? t : t.content || t.text || '');
      } else if (result.tweets && Array.isArray(result.tweets)) {
        posts = result.tweets.map((t: any) => typeof t === 'string' ? t : t.content || t.text || '');
      } else if (Array.isArray(result)) {
        posts = result.map((t: any) => typeof t === 'string' ? t : t.content || t.text || '');
      } else if (typeof result === 'string') {
        posts = [result];
      } else if (result.content || result.text || result.tweet) {
        posts = [result.content || result.text || result.tweet];
      }

      posts = posts.filter(Boolean);

      for (const content of posts) {
        await db.opsTweetDraft.create({
          data: {
            stepId: step.id,
            missionId: step.missionId,
            platform,
            content,
            status: 'draft',
          },
        });
      }

      if (posts.length > 0) {
        logger.info(`${posts.length} ${platform} draft(s) saved for step ${step.id}`);
      }
    }
  } catch (err) {
    logger.error(`Failed to save outbox for step ${step.id}`, err);
  }
}
