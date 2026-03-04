import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  noExternal: ['@rex/core'],
  banner: { js: '#!/usr/bin/env node' },
  onSuccess: 'cp -r src/guards dist/guards',
})
