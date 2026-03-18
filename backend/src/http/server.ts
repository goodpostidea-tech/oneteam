import express, { Request, Response } from 'express';
import cors from 'cors';
import { getDb } from '../core/db/client';
import { getLogger } from '../core/util/logger';
import { createProposal, createMissionFromProposal } from '../core/ops/proposal-service';
import { getAgents, renameAgent, getAgentConfig, getAgentConfigDetail, updateAgentConfig, resetAgentConfig } from '../core/ops/agents';
import { ensureDefaultRelationships, getAffinityScore } from '../core/ops/relationships';
import { getAllLlmConfigs, addLlmConfig, updateLlmConfig, deleteLlmConfig, setDefaultLlmConfig } from '../core/config/llm-config';
import { getAllToolConfigs, addToolConfig, updateToolConfig, deleteToolConfig, getToolConfigsByKind } from '../core/config/tool-config';
import { publish } from '../core/ops/publishers';
import { THEME_LIST, markdownToWechatHtml } from '../core/ops/publishers/wechat-html-themes';
import { getPolicy, setPolicy } from '../core/ops/policy';
import { enqueueReactionsForEvent } from '../core/ops/reactions';
import { planStepsForProposal } from '../core/llm/step-planner';
import { systemRouter } from './routes-system';

function parsePagination(query: Record<string, any>) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 30));
  const q = ((query.q as string) || '').trim();
  return { page, pageSize, q, skip: (page - 1) * pageSize };
}
import { getAllRssFeeds, addRssFeed, updateRssFeed, deleteRssFeed } from '../core/config/rss-config';
import { fetchAllRssFeeds } from '../core/ops/rss-fetcher';

const logger = getLogger('http-server');

export function createHttpServer(port: number) {
  const app = express();
  const db = getDb();

  app.use(cors());
  app.use(express.json());
  app.use(systemRouter());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/api/agents', async (_req: Request, res: Response) => {
    res.json(await getAgents());
  });

  app.patch('/api/agents/:id', async (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name || typeof name !== 'string') { res.status(400).json({ error: 'name is required' }); return; }
    const agent = await renameAgent(req.params.id, name.trim());
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    res.json(agent);
  });

  // ─── Settings: Agent configs ───

  app.get('/api/settings/agents', async (_req: Request, res: Response) => {
    try {
      res.json(await getAgents());
    } catch (error) {
      logger.error('Failed to fetch agent configs', error);
      res.status(500).json({ error: 'Failed to fetch agent configs' });
    }
  });

  app.get('/api/settings/agents/:id', async (req: Request, res: Response) => {
    try {
      const detail = await getAgentConfigDetail(req.params.id);
      if (!detail) { res.status(404).json({ error: 'Agent not found' }); return; }
      res.json(detail);
    } catch (error) {
      logger.error('Failed to fetch agent config', error);
      res.status(500).json({ error: 'Failed to fetch agent config' });
    }
  });

  app.put('/api/settings/agents/:id', async (req: Request, res: Response) => {
    try {
      const result = await updateAgentConfig(req.params.id, req.body);
      if (!result) { res.status(404).json({ error: 'Agent not found' }); return; }
      const detail = await getAgentConfigDetail(req.params.id);
      res.json(detail);
    } catch (error) {
      logger.error('Failed to update agent config', error);
      res.status(500).json({ error: 'Failed to update agent config' });
    }
  });

  app.delete('/api/settings/agents/:id', async (req: Request, res: Response) => {
    try {
      const ok = await resetAgentConfig(req.params.id);
      if (!ok) { res.status(404).json({ error: 'Agent not found' }); return; }
      const detail = await getAgentConfigDetail(req.params.id);
      res.json(detail);
    } catch (error) {
      logger.error('Failed to reset agent config', error);
      res.status(500).json({ error: 'Failed to reset agent config' });
    }
  });

  // ─── Proposals CRUD ───

  app.get('/api/proposals', async (req: Request, res: Response) => {
    try {
      const { page, pageSize, q, skip } = parsePagination(req.query);
      const status = req.query.status as string | undefined;
      const where: any = {};
      if (status) where.status = status;
      if (q) where.title = { contains: q };
      const [items, total] = await Promise.all([
        db.opsMissionProposal.findMany({
          where,
          orderBy: { id: 'desc' },
          skip,
          take: pageSize,
        }),
        db.opsMissionProposal.count({ where }),
      ]);
      res.json({ items, total, page, pageSize });
    } catch (error) {
      logger.error('Failed to fetch proposals', error);
      res.status(500).json({ error: 'Failed to fetch proposals' });
    }
  });

  app.post('/api/proposals', async (req: Request, res: Response) => {
    try {
      const { title, description, platforms, planResult: clientPlanResult } = req.body;
      if (!title) {
        res.status(400).json({ error: 'title is required' });
        return;
      }

      let planResult = clientPlanResult;
      if (!planResult || !Array.isArray(planResult?.steps) || planResult.steps.length === 0) {
        try {
          planResult = await planStepsForProposal(title, description, platforms);
        } catch (planError) {
          logger.error('Step planning failed, using default', planError);
          planResult = {
            steps: [{ kind: 'analyze', agent: 'sage', agentName: '分析师', reason: '默认分析' }],
            confidence: 0.5,
            method: 'rule' as const,
          };
        }
      }

      // 统一走 proposal-service（配额/门控/自动审批/mission 创建）
      const result = await createProposal({
        title,
        description: description || undefined,
        source: 'api',
        agentId: 'boss',  // 用户提交的提案，创建者是 boss
        planResult,
      });

      // 返回完整的 proposal 记录（前端需要）
      const proposal = await db.opsMissionProposal.findUnique({ where: { id: result.proposalId } });
      res.json({ ...proposal, _result: result });
    } catch (error) {
      logger.error('Failed to create proposal', error);
      res.status(500).json({ error: 'Failed to create proposal' });
    }
  });

  app.patch('/api/proposals/:id/approve', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const proposal = await db.opsMissionProposal.findUnique({ where: { id } });
      if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return; }
      if (proposal.status !== 'pending') { res.status(400).json({ error: `Proposal is already ${proposal.status}` }); return; }

      // 复用统一的 mission 创建逻辑
      const { mission } = await createMissionFromProposal(proposal.id);

      await db.opsMissionProposal.update({ where: { id }, data: { status: 'accepted' } });

      const event = await db.opsAgentEvent.create({
        data: {
          agentId: proposal.agentId,
          kind: 'mission_created',
          title: mission.title,
          summary: '手动审批通过',
          tags: ['mission', 'manual_approved'],
          payload: { missionId: mission.id, proposalId: proposal.id },
        },
      });

      await enqueueReactionsForEvent(event.id, 'mission_created');

      res.json({ proposal: { ...proposal, status: 'accepted' }, mission });
    } catch (error) {
      logger.error('Failed to approve proposal', error);
      res.status(500).json({ error: 'Failed to approve proposal' });
    }
  });

  app.patch('/api/proposals/:id/reject', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const proposal = await db.opsMissionProposal.findUnique({ where: { id } });
      if (!proposal) { res.status(404).json({ error: 'Proposal not found' }); return; }
      if (proposal.status !== 'pending') { res.status(400).json({ error: `Proposal is already ${proposal.status}` }); return; }

      await db.opsMissionProposal.update({ where: { id }, data: { status: 'rejected' } });
      res.json({ ok: true });
    } catch (error) {
      logger.error('Failed to reject proposal', error);
      res.status(500).json({ error: 'Failed to reject proposal' });
    }
  });

  // ─── Mission actions ───

  app.patch('/api/missions/:id/cancel', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const mission = await db.opsMission.findUnique({ where: { id } });
      if (!mission) { res.status(404).json({ error: 'Mission not found' }); return; }
      if (mission.status === 'succeeded' || mission.status === 'failed') {
        res.status(400).json({ error: `Mission is already ${mission.status}` }); return;
      }

      // Cancel all non-final steps
      await db.opsMissionStep.updateMany({
        where: { missionId: id, status: { in: ['pending', 'queued', 'running'] } },
        data: { status: 'cancelled', error: '任务被手动取消，步骤未执行' },
      });
      await db.opsMission.update({ where: { id }, data: { status: 'failed' } });

      await db.opsAgentEvent.create({
        data: {
          agentId: mission.createdBy,
          kind: 'mission_cancelled',
          title: mission.title,
          summary: '用户手动取消',
          tags: ['mission', 'cancelled'],
          payload: { missionId: id },
        },
      });

      res.json({ ok: true });
    } catch (error) {
      logger.error('Failed to cancel mission', error);
      res.status(500).json({ error: 'Failed to cancel mission' });
    }
  });

  // ─── Step retry ───

  app.patch('/api/steps/:id/retry', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const step = await db.opsMissionStep.findUnique({ where: { id } });
      if (!step) { res.status(404).json({ error: 'Step not found' }); return; }
      if (step.status !== 'failed') { res.status(400).json({ error: `Step is ${step.status}, only failed steps can be retried` }); return; }

      // 重置为 queued，清除错误
      await db.opsMissionStep.update({
        where: { id },
        data: { status: 'queued', error: null, result: undefined, startedAt: null, finishedAt: null },
      });

      // 如果 mission 已经 failed，重新激活为 running
      const mission = await db.opsMission.findUnique({ where: { id: step.missionId } });
      if (mission && mission.status === 'failed') {
        await db.opsMission.update({ where: { id: step.missionId }, data: { status: 'running' } });

        // 把该步骤之后被 cancelled 的步骤恢复为 pending
        await db.opsMissionStep.updateMany({
          where: {
            missionId: step.missionId,
            id: { gt: step.id },
            status: 'cancelled',
          },
          data: { status: 'pending', error: null },
        });
      }

      res.json({ ok: true });
    } catch (error) {
      logger.error('Failed to retry step', error);
      res.status(500).json({ error: 'Failed to retry step' });
    }
  });

  // ─── Plan preview (不创建提案，仅返回规划结果) ───

  app.post('/api/proposals/plan', async (req: Request, res: Response) => {
    try {
      const { title, description, platforms } = req.body;
      if (!title) { res.status(400).json({ error: 'title is required' }); return; }
      const planResult = await planStepsForProposal(title, description, platforms);
      res.json(planResult);
    } catch (error) {
      logger.error('Failed to plan steps', error);
      res.status(500).json({ error: 'Failed to plan steps' });
    }
  });

  // ─── Memory CRUD ───

  app.post('/api/memory/:agentId', async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const { kind = 'insight', content, tags = [], confidence = 0.8 } = req.body;
      if (!content) { res.status(400).json({ error: 'content is required' }); return; }
      const mem = await db.opsAgentMemory.create({
        data: { agentId, kind, content, tags, confidence },
      });
      res.json(mem);
    } catch (error) {
      logger.error('Failed to create memory', error);
      res.status(500).json({ error: 'Failed to create memory' });
    }
  });

  app.delete('/api/memory/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await db.opsAgentMemory.delete({ where: { id } });
      res.json({ ok: true });
    } catch (error) {
      logger.error('Failed to delete memory', error);
      res.status(500).json({ error: 'Failed to delete memory' });
    }
  });

  // ─── Roundtable creation ───

  app.post('/api/roundtable/sessions', async (req: Request, res: Response) => {
    try {
      const { title, format = 'standup', participants, description } = req.body;
      if (!title || !participants || !Array.isArray(participants)) {
        res.status(400).json({ error: 'title and participants[] are required' }); return;
      }
      const { startRoundtable } = await import('../core/ops/roundtable');
      const sessionId = await startRoundtable({ title, format, participants, description });
      res.json({ sessionId });
    } catch (error) {
      logger.error('Failed to create roundtable', error);
      res.status(500).json({ error: 'Failed to create roundtable' });
    }
  });

  // SSE stream for a roundtable session
  app.get('/api/roundtable/sessions/:id/stream', async (req: Request, res: Response) => {
    const sessionId = Number(req.params.id);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const send = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Check if session already finished — send existing transcript and done
    const session = await db.opsRoundtableSession.findUnique({ where: { id: sessionId } });
    if (session && session.status === 'finished') {
      // Replay transcript as turn_end events for late joiners
      const lines = (session.transcript || '').split('\n').filter(Boolean);
      lines.forEach((line, i) => {
        const ci = line.indexOf(':');
        const speakerName = ci > 0 ? line.slice(0, ci).trim() : '系统';
        const fullText = ci > 0 ? line.slice(ci + 1).trim() : line;
        send('turn_end', { sessionId, round: i, speakerId: '', speakerName, fullText });
      });
      send('done', { sessionId });
      res.end();
      return;
    }

    const { roundtableEmitter } = await import('../core/ops/roundtable');

    const onTurnStart = (d: any) => { if (d.sessionId === sessionId) send('turn_start', d); };
    const onToken = (d: any) => { if (d.sessionId === sessionId) send('token', d); };
    const onTurnEnd = (d: any) => { if (d.sessionId === sessionId) send('turn_end', d); };
    const onDone = (d: any) => {
      if (d.sessionId === sessionId) {
        send('done', d);
        cleanup();
        res.end();
      }
    };
    const onError = (d: any) => {
      if (d.sessionId === sessionId) {
        send('error', d);
        cleanup();
        res.end();
      }
    };

    const cleanup = () => {
      roundtableEmitter.off('turn_start', onTurnStart);
      roundtableEmitter.off('token', onToken);
      roundtableEmitter.off('turn_end', onTurnEnd);
      roundtableEmitter.off('done', onDone);
      roundtableEmitter.off('error', onError);
    };

    roundtableEmitter.on('turn_start', onTurnStart);
    roundtableEmitter.on('token', onToken);
    roundtableEmitter.on('turn_end', onTurnEnd);
    roundtableEmitter.on('done', onDone);
    roundtableEmitter.on('error', onError);

    req.on('close', cleanup);
  });

  // ─── Settings: LLM model configs (CRUD) ───

  const maskKey = (key: string) => key ? key.slice(0, 6) + '****' + key.slice(-4) : '';
  const maskConfig = (c: any) => ({ ...c, apiKey: maskKey(c.apiKey), hasKey: !!c.apiKey });

  app.get('/api/settings/llm', (_req: Request, res: Response) => {
    res.json(getAllLlmConfigs().map(maskConfig));
  });

  app.post('/api/settings/llm', (req: Request, res: Response) => {
    try {
      const { name, provider, model, apiKey, baseUrl, isDefault, type } = req.body;
      if (!provider || !model) { res.status(400).json({ error: 'provider and model are required' }); return; }
      const entry = addLlmConfig({
        name: name || `${provider} / ${model}`,
        provider, model, apiKey: apiKey || '', baseUrl: baseUrl || '',
        isDefault: !!isDefault,
        type: type || 'text',
      });
      res.json(maskConfig(entry));
    } catch (error) {
      logger.error('Failed to add LLM config', error);
      res.status(500).json({ error: 'Failed to add config' });
    }
  });

  app.put('/api/settings/llm/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const update: Record<string, any> = {};
      for (const key of ['name', 'provider', 'model', 'baseUrl', 'isDefault', 'type']) {
        if (req.body[key] !== undefined) update[key] = req.body[key];
      }
      // 只在用户真正输入新 key 时更新
      if (req.body.apiKey !== undefined && !req.body.apiKey.includes('****')) {
        update.apiKey = req.body.apiKey;
      }
      const result = updateLlmConfig(id, update);
      if (!result) { res.status(404).json({ error: 'Config not found' }); return; }
      res.json(maskConfig(result));
    } catch (error) {
      logger.error('Failed to update LLM config', error);
      res.status(500).json({ error: 'Failed to update config' });
    }
  });

  app.delete('/api/settings/llm/:id', (req: Request, res: Response) => {
    const ok = deleteLlmConfig(req.params.id);
    if (!ok) { res.status(404).json({ error: 'Config not found' }); return; }
    res.json({ ok: true });
  });

  app.patch('/api/settings/llm/:id/default', (req: Request, res: Response) => {
    const ok = setDefaultLlmConfig(req.params.id);
    if (!ok) { res.status(404).json({ error: 'Config not found' }); return; }
    res.json({ ok: true });
  });

  // ─── Settings: Tool configs (CRUD) ───

  app.get('/api/settings/tools', (_req: Request, res: Response) => {
    res.json(getAllToolConfigs().map(maskConfig));
  });

  app.post('/api/settings/tools', (req: Request, res: Response) => {
    try {
      const { kind, name, apiKey, baseUrl, enabled, priority } = req.body;
      if (!kind || !name) { res.status(400).json({ error: 'kind and name are required' }); return; }
      const entry = addToolConfig({ kind, name, apiKey: apiKey || '', baseUrl: baseUrl || '', enabled: enabled !== false, priority: priority ?? 10 });
      res.json(maskConfig(entry));
    } catch (error) {
      logger.error('Failed to add tool config', error);
      res.status(500).json({ error: 'Failed to add config' });
    }
  });

  app.put('/api/settings/tools/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const update: Record<string, any> = {};
      for (const key of ['kind', 'name', 'baseUrl', 'enabled', 'priority']) {
        if (req.body[key] !== undefined) update[key] = req.body[key];
      }
      if (req.body.apiKey !== undefined && !req.body.apiKey.includes('****')) {
        update.apiKey = req.body.apiKey;
      }
      const result = updateToolConfig(id, update);
      if (!result) { res.status(404).json({ error: 'Config not found' }); return; }
      res.json(maskConfig(result));
    } catch (error) {
      logger.error('Failed to update tool config', error);
      res.status(500).json({ error: 'Failed to update config' });
    }
  });

  app.delete('/api/settings/tools/:id', (req: Request, res: Response) => {
    const ok = deleteToolConfig(req.params.id);
    if (!ok) { res.status(404).json({ error: 'Config not found' }); return; }
    res.json({ ok: true });
  });

  // ─── RSS Feeds ───

  app.get('/api/rss/feeds', (_req: Request, res: Response) => {
    res.json(getAllRssFeeds());
  });

  app.post('/api/rss/feeds', (req: Request, res: Response) => {
    const { name, url } = req.body;
    if (!name || !url) { res.status(400).json({ error: 'name and url required' }); return; }
    res.json(addRssFeed({ name, url }));
  });

  app.put('/api/rss/feeds/:id', (req: Request, res: Response) => {
    const result = updateRssFeed(req.params.id, req.body);
    if (!result) { res.status(404).json({ error: 'Feed not found' }); return; }
    res.json(result);
  });

  app.delete('/api/rss/feeds/:id', (req: Request, res: Response) => {
    const ok = deleteRssFeed(req.params.id);
    if (!ok) { res.status(404).json({ error: 'Feed not found' }); return; }
    res.json({ ok: true });
  });

  app.post('/api/rss/fetch', async (_req: Request, res: Response) => {
    try {
      const fetched = await fetchAllRssFeeds();
      res.json({ fetched });
    } catch (error) {
      logger.error('RSS manual fetch failed', error);
      res.status(500).json({ error: 'RSS fetch failed' });
    }
  });

  // ─── Stats ───

  app.get('/api/stats/daily', async (req: Request, res: Response) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);

      const missions = await db.opsMission.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: { createdAt: true },
      });
      const steps = await db.opsMissionStep.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: { createdAt: true },
      });

      // Aggregate by date string
      const map: Record<string, { missions: number; steps: number }> = {};
      for (const m of missions) {
        const key = m.createdAt.toISOString().slice(0, 10);
        if (!map[key]) map[key] = { missions: 0, steps: 0 };
        map[key].missions++;
      }
      for (const s of steps) {
        const key = s.createdAt.toISOString().slice(0, 10);
        if (!map[key]) map[key] = { missions: 0, steps: 0 };
        map[key].steps++;
      }

      const result = Object.entries(map).map(([date, counts]) => ({ date, ...counts })).sort((a, b) => a.date.localeCompare(b.date));
      res.json(result);
    } catch (error) {
      logger.error('Failed to fetch daily stats', error);
      res.status(500).json({ error: 'Failed to fetch daily stats' });
    }
  });

  app.get('/api/stats/agents', async (_req: Request, res: Response) => {
    try {
      // Count steps per agent by looking at proposedSteps in proposals
      const proposals = await db.opsMissionProposal.findMany({
        where: { status: 'accepted' },
        select: { proposedSteps: true },
      });
      const agentCounts: Record<string, { total: number; running: number; succeeded: number; failed: number }> = {};
      for (const p of proposals) {
        const plan = p.proposedSteps as any;
        const planSteps: any[] = plan?.steps || (Array.isArray(plan) ? plan : []);
        for (const s of planSteps) {
          const agentId = s.agent || 'unknown';
          if (!agentCounts[agentId]) agentCounts[agentId] = { total: 0, running: 0, succeeded: 0, failed: 0 };
          agentCounts[agentId].total++;
        }
      }

      // Also count actual step statuses from mission steps
      const { PLATFORM_TO_AGENT } = await import('../core/ops/agents');
      const allSteps = await db.opsMissionStep.findMany({
        select: { kind: true, status: true, payload: true },
      });
      const kindToAgent: Record<string, string> = {
        analyze: 'sage', crawl: 'scout', write_article: 'quill',
        roundtable: 'minion',
      };
      // Reset and recount from actual steps
      for (const key of Object.keys(agentCounts)) {
        agentCounts[key] = { total: 0, running: 0, succeeded: 0, failed: 0 };
      }
      for (const s of allSteps) {
        const agentId = s.kind === 'draft_social'
          ? (PLATFORM_TO_AGENT[(s.payload as any)?.platform] || 'xalt')
          : kindToAgent[s.kind] || 'unknown';
        if (!agentCounts[agentId]) agentCounts[agentId] = { total: 0, running: 0, succeeded: 0, failed: 0 };
        agentCounts[agentId].total++;
        if (s.status === 'running' || s.status === 'queued') agentCounts[agentId].running++;
        else if (s.status === 'succeeded' || s.status === 'completed') agentCounts[agentId].succeeded++;
        else if (s.status === 'failed') agentCounts[agentId].failed++;
      }

      const result = Object.entries(agentCounts).map(([agentId, counts]) => ({ agentId, ...counts }));
      res.json(result);
    } catch (error) {
      logger.error('Failed to fetch agent stats', error);
      res.status(500).json({ error: 'Failed to fetch agent stats' });
    }
  });

  // ─── Materials ───

  app.get('/api/materials', async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
      const q = ((req.query.q as string) || '').trim();
      const where: any = {};
      if (status) where.status = status;
      if (q) {
        where.OR = [
          { title: { contains: q } },
          { content: { contains: q } },
          { url: { contains: q } },
        ];
      }
      const [materials, total] = await Promise.all([
        db.opsMaterial.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        db.opsMaterial.count({ where }),
      ]);
      res.json({ items: materials, total, page, pageSize });
    } catch (error) {
      logger.error('Failed to fetch materials', error);
      res.status(500).json({ error: 'Failed to fetch materials' });
    }
  });

  app.get('/api/materials/stats', async (_req: Request, res: Response) => {
    try {
      const all = await db.opsMaterial.findMany({ select: { status: true, source: true } });
      const counts: { total: number; new: number; used: number; archived: number; sources: string[] } = { total: 0, new: 0, used: 0, archived: 0, sources: [] };
      const sourceSet = new Set<string>();
      for (const m of all) {
        counts.total++;
        if (m.status === 'new') counts.new++;
        else if (m.status === 'used') counts.used++;
        else if (m.status === 'archived') counts.archived++;
        sourceSet.add(m.source);
      }
      counts.sources = [...sourceSet].sort();
      res.json(counts);
    } catch (error) {
      logger.error('Failed to fetch material stats', error);
      res.status(500).json({ error: 'Failed to fetch material stats' });
    }
  });

  app.post('/api/materials', async (req: Request, res: Response) => {
    try {
      const { url, text, content: pastedContent } = req.body;
      if (!url && !text) { res.status(400).json({ error: 'url or text is required' }); return; }

      let record: any;

      if (url) {
        let fetchedContent = pastedContent || '';
        let fetchedTitle = '';

        // Only auto-fetch if user didn't paste content
        if (!fetchedContent) {
          try {
            const { executeUrlFetch } = await import('../core/tools/url-fetch');
            const fetched = await executeUrlFetch(url);
            fetchedContent = fetched.content || '';
            fetchedTitle = fetched.title || '';
          } catch (e) {
            logger.error('Failed to fetch URL for material', e);
          }
        }
        if (!fetchedTitle) fetchedTitle = url;

        record = await db.opsMaterial.create({
          data: { kind: 'url', url, title: fetchedTitle, content: fetchedContent, source: 'manual', summaryStatus: 'pending', status: 'new' },
        });

        // Async: generate summary + tags via LLM
        const contentForLlm = fetchedContent;
        const titleForLlm = fetchedTitle;
        const recordId = record.id;
        (async () => {
          try {
            const { llmGenerate } = await import('../core/llm/provider');
            const textForSummary = contentForLlm.slice(0, 4000);
            if (!textForSummary) {
              await db.opsMaterial.update({ where: { id: recordId }, data: { summaryStatus: 'done' } });
              return;
            }
            const result = await llmGenerate({
              system: '你是一个内容摘要助手。请根据以下内容生成：1) 一句话中文摘要 2) 3-5个标签关键词。以JSON格式返回：{"summary":"...","tags":["...",...]}"',
              prompt: `标题: ${titleForLlm}\n\n内容:\n${textForSummary}`,
            });
            const text = typeof result === 'string' ? result : (result as any)?.text || '';
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              await db.opsMaterial.update({
                where: { id: recordId },
                data: { summary: parsed.summary || null, tags: parsed.tags || [], summaryStatus: 'done' },
              });
            } else {
              await db.opsMaterial.update({ where: { id: recordId }, data: { summaryStatus: 'failed' } });
            }
          } catch (e) {
            logger.error('Failed to generate material summary', e);
            await db.opsMaterial.update({ where: { id: recordId }, data: { summaryStatus: 'failed' } }).catch(() => {});
          }
        })();
      } else {
        // Note mode
        record = await db.opsMaterial.create({
          data: { kind: 'note', content: text, source: 'manual', summaryStatus: 'pending', status: 'new' },
        });

        // Async: generate title + tags via LLM
        const noteId = record.id;
        (async () => {
          try {
            const { llmGenerate } = await import('../core/llm/provider');
            const result = await llmGenerate({
              system: '你是一个内容整理助手。请根据以下笔记生成：1) 简短标题 2) 3-5个标签关键词。以JSON格式返回：{"title":"...","tags":["...",...]}"',
              prompt: text.slice(0, 2000),
            });
            const rText = typeof result === 'string' ? result : (result as any)?.text || '';
            const jsonMatch = rText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              await db.opsMaterial.update({
                where: { id: noteId },
                data: { title: parsed.title || null, tags: parsed.tags || [], summaryStatus: 'done' },
              });
            } else {
              await db.opsMaterial.update({ where: { id: noteId }, data: { summaryStatus: 'failed' } });
            }
          } catch (e) {
            logger.error('Failed to generate material title', e);
            await db.opsMaterial.update({ where: { id: noteId }, data: { summaryStatus: 'failed' } }).catch(() => {});
          }
        })();
      }

      res.json(record);
    } catch (error) {
      logger.error('Failed to create material', error);
      res.status(500).json({ error: 'Failed to create material' });
    }
  });

  app.put('/api/materials/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);

      // Handle resummarize request
      if (req.body.resummarize) {
        const record = await db.opsMaterial.findUnique({ where: { id } });
        if (!record) { res.status(404).json({ error: 'Not found' }); return; }
        await db.opsMaterial.update({ where: { id }, data: { summaryStatus: 'pending', summary: null } });
        // Async re-summarize
        (async () => {
          try {
            const { llmGenerate } = await import('../core/llm/provider');
            const textForSummary = record.content.slice(0, 4000);
            if (!textForSummary) {
              await db.opsMaterial.update({ where: { id }, data: { summaryStatus: 'done' } });
              return;
            }
            const result = await llmGenerate({
              system: '你是一个内容摘要助手。请根据以下内容生成：1) 一句话中文摘要 2) 3-5个标签关键词。以JSON格式返回：{"summary":"...","tags":["...",...]}"',
              prompt: `标题: ${record.title || ''}\n\n内容:\n${textForSummary}`,
            });
            const text = typeof result === 'string' ? result : (result as any)?.text || '';
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              await db.opsMaterial.update({ where: { id }, data: { summary: parsed.summary || null, tags: parsed.tags || [], summaryStatus: 'done' } });
            } else {
              await db.opsMaterial.update({ where: { id }, data: { summaryStatus: 'failed' } });
            }
          } catch (e) {
            logger.error('Re-summarize failed', e);
            await db.opsMaterial.update({ where: { id }, data: { summaryStatus: 'failed' } }).catch(() => {});
          }
        })();
        res.json({ ok: true });
        return;
      }

      const data: any = {};
      for (const key of ['title', 'summary', 'tags', 'status', 'summaryStatus']) {
        if (req.body[key] !== undefined) data[key] = req.body[key];
      }
      const updated = await db.opsMaterial.update({ where: { id }, data });
      res.json(updated);
    } catch (error) {
      logger.error('Failed to update material', error);
      res.status(500).json({ error: 'Failed to update material' });
    }
  });

  app.delete('/api/materials/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await db.opsMaterial.delete({ where: { id } });
      res.json({ ok: true });
    } catch (error) {
      logger.error('Failed to delete material', error);
      res.status(500).json({ error: 'Failed to delete material' });
    }
  });

  // ─── Outbox ───

  app.get('/api/outbox', async (req: Request, res: Response) => {
    try {
      const { page, pageSize, q, skip } = parsePagination(req.query);
      const kind = req.query.kind as string | undefined;
      const status = req.query.status as string | undefined;

      const tweetWhere: any = {};
      const articleWhere: any = {};
      if (status) { tweetWhere.status = status; articleWhere.status = status; }
      if (q) { tweetWhere.content = { contains: q }; articleWhere.title = { contains: q }; }

      const [tweets, articles, tweetCount, articleCount] = await Promise.all([
        (!kind || kind === 'tweet') ? db.opsTweetDraft.findMany({ where: tweetWhere, orderBy: { id: 'desc' }, take: 500 }) : Promise.resolve([]),
        (!kind || kind === 'article') ? db.opsArticleDraft.findMany({ where: articleWhere, orderBy: { id: 'desc' }, take: 500 }) : Promise.resolve([]),
        (!kind || kind === 'tweet') ? db.opsTweetDraft.count({ where: tweetWhere }) : Promise.resolve(0),
        (!kind || kind === 'article') ? db.opsArticleDraft.count({ where: articleWhere }) : Promise.resolve(0),
      ]);

      const merged = [
        ...tweets.map((t: any) => ({ ...t, kind: 'tweet' as const })),
        ...articles.map((a: any) => ({ ...a, kind: 'article' as const })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const total = tweetCount + articleCount;
      const items = merged.slice(skip, skip + pageSize);
      res.json({ items, total, page, pageSize });
    } catch (error) {
      logger.error('Failed to fetch outbox', error);
      res.status(500).json({ error: 'Failed to fetch outbox' });
    }
  });

  app.get('/api/outbox/stats', async (_req: Request, res: Response) => {
    try {
      const [tweets, articles] = await Promise.all([
        db.opsTweetDraft.findMany({ select: { status: true } }),
        db.opsArticleDraft.findMany({ select: { status: true } }),
      ]);

      const counts: Record<string, number> = { total: 0, draft: 0, approved: 0, exported: 0, archived: 0, tweet: 0, article: 0 };
      for (const t of tweets) {
        counts.total++; counts.tweet++; counts[t.status] = (counts[t.status] || 0) + 1;
      }
      for (const a of articles) {
        counts.total++; counts.article++; counts[a.status] = (counts[a.status] || 0) + 1;
      }

      res.json(counts);
    } catch (error) {
      logger.error('Failed to fetch outbox stats', error);
      res.status(500).json({ error: 'Failed to fetch outbox stats' });
    }
  });

  app.put('/api/outbox/tweet/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { content, status } = req.body;
      const data: any = {};
      if (content !== undefined) data.content = content;
      if (status !== undefined) {
        data.status = status;
        if (status === 'exported') data.exportedAt = new Date();
      }
      const updated = await db.opsTweetDraft.update({ where: { id }, data });
      res.json(updated);
    } catch (error) {
      logger.error('Failed to update tweet draft', error);
      res.status(500).json({ error: 'Failed to update tweet draft' });
    }
  });

  app.put('/api/outbox/article/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { title, content, status } = req.body;
      const data: any = {};
      if (title !== undefined) data.title = title;
      if (content !== undefined) data.content = content;
      if (status !== undefined) {
        data.status = status;
        if (status === 'exported') data.exportedAt = new Date();
      }
      const updated = await db.opsArticleDraft.update({ where: { id }, data });
      res.json(updated);
    } catch (error) {
      logger.error('Failed to update article draft', error);
      res.status(500).json({ error: 'Failed to update article draft' });
    }
  });

  app.delete('/api/outbox/:kind/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { kind } = req.params;
      if (kind === 'tweet') {
        await db.opsTweetDraft.delete({ where: { id } });
      } else if (kind === 'article') {
        await db.opsArticleDraft.delete({ where: { id } });
      } else {
        res.status(400).json({ error: 'Invalid kind' }); return;
      }
      res.json({ ok: true });
    } catch (error) {
      logger.error('Failed to delete outbox item', error);
      res.status(500).json({ error: 'Failed to delete outbox item' });
    }
  });

  // Backfill outbox from existing succeeded steps
  app.post('/api/outbox/backfill', async (_req: Request, res: Response) => {
    try {
      const steps = await db.opsMissionStep.findMany({
        where: { status: 'succeeded', kind: { in: ['write_article', 'draft_social'] } },
        orderBy: { id: 'asc' },
      });

      let created = 0;
      for (const step of steps) {
        const result = step.result as any;
        if (!result) continue;

        if (step.kind === 'write_article') {
          const title = result.title || result.headline || '未命名文章';
          const content = result.content || result.article || result.text || '';
          if (!content) continue;
          // Skip if already exists
          const exists = await db.opsArticleDraft.findFirst({ where: { stepId: step.id } });
          if (exists) continue;
          await db.opsArticleDraft.create({
            data: { stepId: step.id, missionId: step.missionId, title, content, status: 'draft' },
          });
          created++;
        }

        if (step.kind === 'draft_social') {
          const exists = await db.opsTweetDraft.findFirst({ where: { stepId: step.id } });
          if (exists) continue;

          const platform = result.platform || 'tweet';
          let tweets: string[] = [];
          if (result.posts && Array.isArray(result.posts)) {
            tweets = result.posts.map((t: any) => typeof t === 'string' ? t : t.content || t.text || '');
          } else if (Array.isArray(result)) {
            tweets = result.map((t: any) => typeof t === 'string' ? t : t.content || t.text || '');
          } else if (result.tweets && Array.isArray(result.tweets)) {
            tweets = result.tweets.map((t: any) => typeof t === 'string' ? t : t.content || t.text || '');
          } else if (typeof result === 'string') {
            tweets = [result];
          } else if (result.content || result.text || result.tweet) {
            tweets = [result.content || result.text || result.tweet];
          }
          tweets = tweets.filter(Boolean);

          for (const content of tweets) {
            await db.opsTweetDraft.create({
              data: { stepId: step.id, missionId: step.missionId, content, status: 'draft', platform },
            });
            created++;
          }
        }
      }

      res.json({ ok: true, scanned: steps.length, created });
    } catch (error) {
      logger.error('Failed to backfill outbox', error);
      res.status(500).json({ error: 'Failed to backfill outbox' });
    }
  });

  // ─── WeChat themes ───

  app.get('/api/settings/wechat-themes', (_req: Request, res: Response) => {
    res.json(THEME_LIST);
  });

  app.post('/api/wechat-preview', (req: Request, res: Response) => {
    const { markdown, theme } = req.body;
    if (!markdown) { res.status(400).json({ error: 'markdown is required' }); return; }
    const html = markdownToWechatHtml(markdown, theme || undefined);
    res.json({ html });
  });

  // ─── Publishers ───

  app.get('/api/publishers', (_req: Request, res: Response) => {
    const publishers = getAllToolConfigs()
      .filter(c => c.kind === 'publisher' && c.enabled)
      .map(c => ({ id: c.id, name: c.name, ready: c.id === 'browser-wechat-mp' || !!c.baseUrl }));
    res.json(publishers);
  });

  app.post('/api/outbox/:kind/:id/publish', async (req: Request, res: Response) => {
    try {
      const { kind, id } = req.params;
      const { publisherId, theme: bodyTheme, styledHtml } = req.body;
      if (!publisherId) { res.status(400).json({ error: 'publisherId is required' }); return; }

      const numId = Number(id);

      // Find the outbox item
      let item: any;
      if (kind === 'tweet') {
        item = await db.opsTweetDraft.findUnique({ where: { id: numId } });
      } else if (kind === 'article') {
        item = await db.opsArticleDraft.findUnique({ where: { id: numId } });
      } else {
        res.status(400).json({ error: 'Invalid kind' }); return;
      }
      if (!item) { res.status(404).json({ error: 'Item not found' }); return; }
      if (item.status !== 'approved' && item.status !== 'exported') { res.status(400).json({ error: `Item status is "${item.status}", must be "approved" or "exported"` }); return; }

      // Find publisher config
      const config = getAllToolConfigs().find(c => c.id === publisherId && c.kind === 'publisher');
      if (!config) { res.status(404).json({ error: 'Publisher not found' }); return; }
      if (!config.enabled) { res.status(400).json({ error: 'Publisher is not enabled' }); return; }

      const publishItem = {
        kind,
        title: item.title || undefined,
        content: item.content,
        status: item.status,
        createdAt: item.createdAt.toISOString ? item.createdAt.toISOString() : String(item.createdAt),
      };

      // Resolve theme: body > policy > undefined
      let theme = bodyTheme;
      if (!theme) {
        try { theme = await getPolicy('wechat_article_theme', '') || undefined; } catch {}
      }

      const result = await publish(publishItem, config, theme, styledHtml || undefined);
      if (!result.ok) {
        res.status(502).json({ error: result.error || 'Publish failed' }); return;
      }

      // Mark as exported
      if (kind === 'tweet') {
        await db.opsTweetDraft.update({ where: { id: numId }, data: { status: 'exported', exportedAt: new Date() } });
      } else {
        await db.opsArticleDraft.update({ where: { id: numId }, data: { status: 'exported', exportedAt: new Date() } });
      }

      res.json({ ok: true });
    } catch (error) {
      logger.error('Failed to publish outbox item', error);
      res.status(500).json({ error: 'Failed to publish' });
    }
  });

  // ─── Browser WeChat MP SSE status ───

  app.get('/api/publishers/browser-wechat-mp/status', async (_req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const { browserWechatEmitter } = await import('../core/ops/publishers/browser-wechat-mp');

    const onStatus = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (data.state === 'done' || data.state === 'error') {
        cleanup();
        res.end();
      }
    };

    const cleanup = () => {
      browserWechatEmitter.off('status', onStatus);
    };

    browserWechatEmitter.on('status', onStatus);
    _req.on('close', cleanup);
  });

  // ─── Legacy test endpoints ───

  // 创建一个测试用提案，方便桌面端触发
  app.post('/api/proposals/test', async (_req: Request, res: Response) => {
    try {
      const result = await createProposal({
        agentId: 'test-agent',
        title: 'Test mission from HTTP',
        description: 'A simple test mission with one step',
        source: 'api',
        planResult: {
          steps: [{ kind: 'analyze', agent: 'sage', agentName: '分析师', reason: '测试分析' }],
          confidence: 0.9,
          method: 'rule',
        },
      });

      res.json(result);
    } catch (error) {
      logger.error('Failed to create test proposal', error);
      res.status(500).json({ error: 'Failed to create test proposal' });
    }
  });

  app.get('/api/missions', async (req: Request, res: Response) => {
    try {
      const { page, pageSize, q, skip } = parsePagination(req.query);
      const status = req.query.status as string | undefined;
      const where: any = {};
      if (q) where.title = { contains: q };
      if (status) where.status = status;
      const [items, total] = await Promise.all([
        db.opsMission.findMany({
          where,
          orderBy: { id: 'desc' },
          skip,
          take: pageSize,
          include: { steps: true },
        }),
        db.opsMission.count({ where }),
      ]);
      res.json({ items, total, page, pageSize });
    } catch (error) {
      logger.error('Failed to fetch missions', error);
      res.status(500).json({ error: 'Failed to fetch missions' });
    }
  });

  app.get('/api/events', async (req: Request, res: Response) => {
    try {
      const { page, pageSize, skip } = parsePagination(req.query);
      const kind = (req.query.kind as string) || undefined;
      const where = kind ? { kind } : {};
      const [items, total] = await Promise.all([
        db.opsAgentEvent.findMany({ where, orderBy: { id: 'desc' }, skip, take: pageSize }),
        db.opsAgentEvent.count({ where }),
      ]);
      res.json({ items, total, page, pageSize });
    } catch (error) {
      logger.error('Failed to fetch events', error);
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  });

  app.get('/api/agents/stage', async (_req: Request, res: Response) => {
    try {
      const agentList = await getAgents();
      const result = await Promise.all(agentList.map(async (agent) => {
        // Map agent to step kinds they own
        const kindMap: Record<string, string[]> = {
          sage: ['analyze'], scout: ['crawl'], quill: ['write_article'], xalt: ['draft_social'], minion: ['roundtable'],
        };
        // For sub-agents like xalt_tweet, parent is xalt
        const baseId = agent.parentId || agent.id;
        const kinds = kindMap[baseId] || [];

        const [runningSteps, memoryCount, recentEvent, relationships] = await Promise.all([
          kinds.length > 0
            ? db.opsMissionStep.count({ where: { kind: { in: kinds }, status: { in: ['running', 'queued'] } } })
            : Promise.resolve(0),
          db.opsAgentMemory.count({ where: { agentId: agent.id } }),
          db.opsAgentEvent.findFirst({ where: { agentId: agent.id }, orderBy: { id: 'desc' }, select: { title: true, createdAt: true } }),
          db.opsAgentRelationship.findMany({
            where: { OR: [{ agentA: agent.id }, { agentB: agent.id }] },
            orderBy: { score: 'desc' },
            take: 3,
          }),
        ]);
        return {
          ...agent,
          runningSteps,
          memoryCount,
          recentEvent: recentEvent ? { title: recentEvent.title, createdAt: recentEvent.createdAt } : null,
          topRelationships: relationships.map(r => ({
            otherId: r.agentA === agent.id ? r.agentB : r.agentA,
            score: r.score,
          })),
        };
      }));
      res.json(result);
    } catch (error) {
      logger.error('Failed to fetch agent stage', error);
      res.status(500).json({ error: 'Failed to fetch agent stage' });
    }
  });

  app.get('/api/steps', async (_req: Request, res: Response) => {
    try {
      const steps = await db.opsMissionStep.findMany({
        orderBy: { id: 'desc' },
        take: 100,
      });
      res.json(steps);
    } catch (error) {
      logger.error('Failed to fetch steps', error);
      res.status(500).json({ error: 'Failed to fetch steps' });
    }
  });

  app.get('/api/relationships', async (_req: Request, res: Response) => {
    try {
      await ensureDefaultRelationships();
      const rels = await db.opsAgentRelationship.findMany({
        orderBy: { id: 'asc' },
      });
      res.json(rels);
    } catch (error) {
      logger.error('Failed to fetch relationships', error);
      res.status(500).json({ error: 'Failed to fetch relationships' });
    }
  });

  app.get('/api/memory/:agentId', async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const mems = await db.opsAgentMemory.findMany({
        where: { agentId },
        orderBy: { id: 'desc' },
        take: 50,
      });
      res.json(mems);
    } catch (error) {
      logger.error('Failed to fetch memory', error);
      res.status(500).json({ error: 'Failed to fetch memory' });
    }
  });

  // 简单测试：为某个智能体写入一条记忆
  app.post('/api/memory/:agentId/test', async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const { kind = 'insight', content = 'Test memory from API' } = req.body ?? {};
      const mem = await db.opsAgentMemory.create({
        data: {
          agentId,
          kind,
          content,
          tags: ['test'],
          confidence: 0.8,
        },
      });
      res.json(mem);
    } catch (error) {
      logger.error('Failed to create test memory', error);
      res.status(500).json({ error: 'Failed to create test memory' });
    }
  });

  // 创建一场测试圆桌会话
  app.post('/api/roundtable/test', async (_req: Request, res: Response) => {
    try {
      const { enqueueRoundtable } = await import('../core/ops/roundtable');
      await enqueueRoundtable({
        title: '测试圆桌：今日回顾',
        format: 'standup',
        participants: ['minion', 'sage', 'quill'],
      });
      res.json({ ok: true });
    } catch (error) {
      logger.error('Failed to enqueue test roundtable', error);
      res.status(500).json({ error: 'Failed to enqueue test roundtable' });
    }
  });

  app.get('/api/roundtable/sessions', async (req: Request, res: Response) => {
    try {
      const { page, pageSize, q, skip } = parsePagination(req.query);
      const where = q ? { title: { contains: q } } : {};
      const [items, total] = await Promise.all([
        db.opsRoundtableSession.findMany({
          where,
          orderBy: { id: 'desc' },
          skip,
          take: pageSize,
        }),
        db.opsRoundtableSession.count({ where }),
      ]);
      res.json({ items, total, page, pageSize });
    } catch (error) {
      logger.error('Failed to fetch roundtable sessions', error);
      res.status(500).json({ error: 'Failed to fetch roundtable sessions' });
    }
  });

  // ─── Settings: Policy (key-value) ───

  app.get('/api/settings/policy', async (_req: Request, res: Response) => {
    try {
      const policies = await db.opsPolicy.findMany({ orderBy: { key: 'asc' } });
      res.json(policies);
    } catch (error) {
      logger.error('Failed to fetch policies', error);
      res.status(500).json({ error: 'Failed to fetch policies' });
    }
  });

  app.put('/api/settings/policy/:key', async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      if (value === undefined) { res.status(400).json({ error: 'value is required' }); return; }
      await setPolicy(key, value);
      res.json({ ok: true, key, value });
    } catch (error) {
      logger.error('Failed to update policy', error);
      res.status(500).json({ error: 'Failed to update policy' });
    }
  });

  app.listen(port, () => {
    logger.info(`HTTP server listening on http://localhost:${port}`);
  });

  return app;
}

