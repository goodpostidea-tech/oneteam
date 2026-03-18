import { execSync } from 'child_process';

const run = (cmd, cwd) => execSync(cmd, { stdio: 'inherit', cwd });

console.log('=== Building frontend ===');
run('npx vite build', '.');

console.log('=== Building backend bundle ===');
run('node esbuild.config.mjs', '../backend');

console.log('=== Creating seed DB ===');
run('node scripts/build-seed-db.mjs', '../backend');

console.log('=== All builds complete ===');
