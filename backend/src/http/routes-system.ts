/**
 * System routes: heartbeat status, trigger rules CRUD
 */
import { Router, Request, Response } from 'express';
import { getDb } from '../core/db/client';
import { getLogger } from '../core/util/logger';
import { getHeartbeatStatus } from '../core/ops/heartbeat';

const logger = getLogger('routes-system');

export function systemRouter(): Router {
  const r = Router();
  const db = getDb();

  // ─── Heartbeat status ───

  r.get('/api/heartbeat/status', (_req: Request, res: Response) => {
    res.json(getHeartbeatStatus());
  });

  // ─── Trigger rules ───

  r.get('/api/triggers', async (_req: Request, res: Response) => {
    try {
      const rules = await db.opsTriggerRule.findMany({ orderBy: { id: 'asc' } });
      res.json(rules);
    } catch (error) {
      logger.error('Failed to fetch triggers', error);
      res.status(500).json({ error: 'Failed to fetch triggers' });
    }
  });

  r.patch('/api/triggers/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { enabled, cooldownSec } = req.body;
      const data: Record<string, any> = {};
      if (typeof enabled === 'boolean') data.enabled = enabled;
      if (typeof cooldownSec === 'number' && cooldownSec > 0) data.cooldownSec = cooldownSec;
      if (Object.keys(data).length === 0) {
        res.status(400).json({ error: 'No valid fields to update' }); return;
      }
      const updated = await db.opsTriggerRule.update({ where: { id }, data });
      res.json(updated);
    } catch (error) {
      logger.error('Failed to update trigger', error);
      res.status(500).json({ error: 'Failed to update trigger' });
    }
  });

  return r;
}
