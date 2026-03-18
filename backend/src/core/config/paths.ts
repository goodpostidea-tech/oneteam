import path from 'path';
import fs from 'fs';

const isProduction = !!process.env.ONETEAM_USER_DATA_DIR;

/**
 * Dynamic paths for config and DB.
 * In production, Electron sets ONETEAM_USER_DATA_DIR to app.getPath('userData').
 * In dev, falls back to process.cwd().
 */
export const CONFIG_DIR = process.env.ONETEAM_USER_DATA_DIR || process.cwd();
export const DB_PATH = isProduction
  ? path.join(CONFIG_DIR, 'oneteam.db')
  : path.join(process.cwd(), 'prisma', 'dev.db');

export function initPaths(): void {
  // Ensure config dir exists (production)
  if (isProduction && !fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  // Set DATABASE_URL for Prisma
  process.env.DATABASE_URL = `file:${DB_PATH}`;
}
