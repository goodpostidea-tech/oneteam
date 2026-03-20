import 'dotenv/config';
import { initPaths } from './core/config/paths';
import { runHeartbeatCycle } from './core/ops/heartbeat';
import { getDb } from './core/db/client';
import { getLogger } from './core/util/logger';
import { createHttpServer } from './http/server';
import { processOneQueuedStep } from './core/ops/worker-runner';
import { processInitiativeQueue } from './core/ops/initiative';
import { ensureDefaultPolicies, getPolicy } from './core/ops/policy';
import { ensureDefaultRelationships } from './core/ops/relationships';
import { ensureDefaultTriggers } from './core/ops/triggers';
import { isLlmReady } from './core/config/llm-config';

const logger = getLogger('main');

async function main() {
  initPaths();

  await getDb().$connect();
  logger.info('Database connected');

  // 确保默认策略和关系数据存在
  await ensureDefaultPolicies();
  await ensureDefaultRelationships();
  await ensureDefaultTriggers();

  // 启动 HTTP API，供桌面端调用
  const port = Number(process.env.OPC_BACKEND_PORT ?? 4173);
  createHttpServer(port);

  // 启动时立即执行一次心跳
  runHeartbeatCycle().catch((error) => {
    logger.error('Initial heartbeat failed', error);
  });

  // 动态读取心跳间隔：每次触发后重新读 policy，改配置无需重启
  const scheduleNextHeartbeat = () => {
    getPolicy<{ minutes: number }>('heartbeat_interval', { minutes: 30 }).then((cfg) => {
      const ms = Math.max(1, cfg.minutes) * 60 * 1000;
      setTimeout(() => {
        runHeartbeatCycle()
          .catch((error) => logger.error('Scheduled heartbeat failed', error))
          .finally(scheduleNextHeartbeat);
      }, ms);
      logger.info(`Next heartbeat in ${cfg.minutes} minutes`);
    });
  };
  scheduleNextHeartbeat();

  // Worker 循环：每 1 秒尝试处理一个步骤
  setInterval(() => {
    if (!isLlmReady()) return;
    processOneQueuedStep().catch((error) => {
      logger.error('Worker tick failed', error);
    });
  }, 1000);

  // Initiative worker：每 30 秒消费主动提案队列
  setInterval(() => {
    if (!isLlmReady()) return;
    processInitiativeQueue().catch((error) => {
      logger.error('Initiative worker tick failed', error);
    });
  }, 30_000);
}

main().catch((error) => {
  logger.error('Fatal error in main', error);
  process.exit(1);
});
