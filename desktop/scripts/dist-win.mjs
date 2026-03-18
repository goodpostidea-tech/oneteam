import { execSync } from 'child_process';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('node scripts/build-all.mjs');
run('npx electron-builder --win');
