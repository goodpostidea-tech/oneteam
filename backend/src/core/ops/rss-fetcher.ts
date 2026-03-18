import RssParser from 'rss-parser';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseStringPromise } = require('xml2js');
import { getDb } from '../db/client';
import { getLogger } from '../util/logger';
import { getAllRssFeeds, updateRssFeed } from '../config/rss-config';

const logger = getLogger('rss-fetcher');
const parser = new RssParser({ timeout: 15000 });

/** 有些 feed 的 XML 不合规，先 fetch 文本用宽松解析提取 items */
async function safeParseFeed(url: string): Promise<{ items: Array<{ title?: string; link?: string; pubDate?: string; contentSnippet?: string; content?: string }> }> {
  try {
    return await parser.parseURL(url);
  } catch {
    // fallback: fetch + lenient xml2js
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OneTeam/1.0)' },
    });
    let text = await res.text();
    text = text.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/g, '&amp;');

    const xml = await parseStringPromise(text, { strict: false, normalizeTags: false, explicitArray: false });

    // Navigate RSS 2.0 structure: rss > channel > item
    const channel = xml?.rss?.channel || xml?.RSS?.channel || xml?.rss?.CHANNEL || xml?.RSS?.CHANNEL;
    if (!channel) return { items: [] };

    const rawItems = Array.isArray(channel.item) ? channel.item : (channel.item ? [channel.item] : []);
    const items = rawItems.map((it: any) => ({
      title: it.title || it.TITLE || '',
      link: it.link || it.LINK || '',
      pubDate: it.pubDate || it.PUBDATE || it.pubdate || '',
      contentSnippet: (it.description || it.DESCRIPTION || '').replace(/<[^>]*>/g, '').slice(0, 2000),
    }));

    logger.info(`RSS fallback parser extracted ${items.length} items from ${url}`);
    return { items };
  }
}

export async function fetchAllRssFeeds(): Promise<number> {
  const feeds = getAllRssFeeds().filter(f => f.enabled);
  let totalCreated = 0;

  for (const feed of feeds) {
    try {
      const parsed = await safeParseFeed(feed.url);
      let created = 0;

      for (const item of parsed.items || []) {
        const pubDate = item.pubDate ? new Date(item.pubDate) : null;
        if (feed.lastFetchedAt && pubDate) {
          if (pubDate <= new Date(feed.lastFetchedAt)) continue;
        }

        const itemUrl = item.link;
        if (!itemUrl) continue;

        const db = getDb();
        const existing = await db.opsMaterial.findFirst({ where: { url: itemUrl } });
        if (existing) continue;

        const snippet = (item.contentSnippet || item.content || '').slice(0, 2000);
        const title = item.title || itemUrl;

        const record = await db.opsMaterial.create({
          data: {
            kind: 'url',
            url: itemUrl,
            title,
            content: snippet,
            source: feed.name,
            summaryStatus: 'pending',
            status: 'new',
          },
        });

        // Async: fetch full content then summarize
        fetchFullContentAndSummarize(record.id, itemUrl, title).catch(() => {});

        created++;
      }

      updateRssFeed(feed.id, { lastFetchedAt: new Date().toISOString() });
      totalCreated += created;

      if (created > 0) {
        logger.info(`RSS "${feed.name}": ${created} new items`);
      }
    } catch (e) {
      logger.error(`RSS fetch failed for "${feed.name}"`, e);
    }
  }

  return totalCreated;
}

async function fetchFullContentAndSummarize(materialId: number, url: string, title: string): Promise<void> {
  const db = getDb();

  // Step 1: try to fetch full content
  let fullContent = '';
  try {
    const { executeUrlFetch } = await import('../tools/url-fetch');
    const fetched = await executeUrlFetch(url);
    fullContent = fetched.content || '';
    if (fetched.title) title = fetched.title;

    // Update material with full content + better title
    if (fullContent) {
      await db.opsMaterial.update({
        where: { id: materialId },
        data: { content: fullContent, ...(fetched.title ? { title: fetched.title } : {}) },
      });
    }
  } catch (e) {
    logger.error(`RSS url-fetch failed for ${url}`, e);
    // Fall through — still try to summarize with snippet
  }

  // Step 2: generate summary
  const record = await db.opsMaterial.findUnique({ where: { id: materialId } });
  if (!record) return;

  const textForSummary = (fullContent || record.content).slice(0, 4000);
  if (!textForSummary) {
    await db.opsMaterial.update({ where: { id: materialId }, data: { summaryStatus: 'done' } });
    return;
  }

  try {
    const { llmGenerate } = await import('../llm/provider');
    const result = await llmGenerate({
      system: '你是一个内容摘要助手。请根据以下内容生成：1) 一句话中文摘要 2) 3-5个标签关键词。以JSON格式返回：{"summary":"...","tags":["...",...]}"',
      prompt: `标题: ${title}\n\n内容:\n${textForSummary}`,
    });
    const text = typeof result === 'string' ? result : (result as any)?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      await db.opsMaterial.update({
        where: { id: materialId },
        data: {
          summary: parsed.summary || null,
          tags: parsed.tags || [],
          summaryStatus: 'done',
        },
      });
    } else {
      await db.opsMaterial.update({ where: { id: materialId }, data: { summaryStatus: 'failed' } });
    }
  } catch (e) {
    logger.error('Failed to generate RSS material summary', e);
    await db.opsMaterial.update({ where: { id: materialId }, data: { summaryStatus: 'failed' } });
  }
}
