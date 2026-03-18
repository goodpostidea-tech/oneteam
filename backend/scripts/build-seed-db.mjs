import { execSync } from 'child_process';
import { mkdirSync } from 'fs';

// Ensure bundle dir exists
mkdirSync('bundle', { recursive: true });

// Run prisma migrate deploy against the seed DB
execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: 'file:../bundle/seed.db' },
});

console.log('Seed DB created → bundle/seed.db');
