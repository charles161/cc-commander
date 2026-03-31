import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node22',
  },
  {
    entry: { 'bin/cli': 'bin/cli.ts' },
    format: ['esm'],
    sourcemap: true,
    target: 'node22',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
