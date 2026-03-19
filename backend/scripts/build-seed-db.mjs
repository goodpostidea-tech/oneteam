import { execSync } from 'child_process';
import { mkdirSync } from 'fs';

// Ensure bundle dir exists
mkdirSync('bundle', { recursive: true });

// Use db push to create tables from schema (no migrations needed)
execSync('npx prisma db push --skip-generate', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: 'file:../bundle/seed.db' },
});

console.log('Seed DB created → bundle/seed.db');
