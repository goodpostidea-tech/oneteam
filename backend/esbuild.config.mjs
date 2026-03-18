import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'bundle/server.js',
  format: 'cjs',
  sourcemap: true,
  external: [
    '@prisma/client',
    'playwright',
  ],
});

console.log('Backend bundled → bundle/server.js');
