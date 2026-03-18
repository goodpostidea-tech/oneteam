import 'dotenv/config';
import cron from 'node-cron';
import { runHeartbeatCycle } from './core/ops/heartbeat';
import { getDb } from './core/db/client';
import { getLogger } from './core/util/logger';
import { createHttpServer } from './http/server';
import { processOneQueuedStep } from './core/ops/worker-runner';
import { processInitiativeQueue } from './core/ops/initiative';
import { ensureDefaultPolicies } from './core/ops/policy';
import { ensureDefaultRelationships } from './core/ops/relationships';
import { ensureDefaultTriggers } from './core/ops/triggers';

const logger = getLogger('main');

async function main() {
  await getDb().$connect();
  logger.info('Database connected');

  // 确保默认策略和关系数据存在
  await ensureDefaultPolicies();
  await ensureDefaultRelationships();
  await ensureDefaultTriggers();

  // 启动 HTTP API，供桌面端调用
  const port = Number(process.env.OPC_BACKEND_PORT ?? 4173);
  createHttpServer(port);

  // 启动时先跑一次心跳
  runHeartbeatCycle().catch((error) => {
    logger.error('Initial heartbeat failed', error);
  });

  // 每 5 分钟跑一次心跳
  cron.schedule('*/5 * * * *', () => {
    runHeartbeatCycle().catch((error) => {
      logger.error('Scheduled heartbeat failed', error);
    });
  });

  logger.info('Heartbeat scheduled every 5 minutes');

  // Worker 循环：每 1 秒尝试处理一个步骤
  setInterval(() => {
    processOneQueuedStep().catch((error) => {
      logger.error('Worker tick failed', error);
    });
  }, 1000);

  // Initiative worker：每 30 秒消费主动提案队列
  setInterval(() => {
    processInitiativeQueue().catch((error) => {
      logger.error('Initiative worker tick failed', error);
    });
  }, 30_000);
}

main().catch((error) => {
  logger.error('Fatal error in main', error);
  process.exit(1);
});
