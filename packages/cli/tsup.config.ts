import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  noExternal: ['@rex/core'],
  external: ['better-sqlite3'],
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
  onSuccess: 'mkdir -p dist/guards && cp src/guards/*.sh dist/guards/ && rm -rf dist/skills && cp -R skills dist/skills 2>/dev/null || true',
})
