import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { 'src/xray': 'src/xray.ts', 'src/report': 'src/report.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node22',
  },
  {
    entry: { 'bin/xray': 'bin/xray.ts' },
    format: ['esm'],
    sourcemap: true,
    target: 'node22',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
