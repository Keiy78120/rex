import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  noExternal: ['@rex/core'],
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
  onSuccess: 'mkdir -p dist/guards dist/hammerspoon && cp src/guards/*.sh dist/guards/ && cp src/hammerspoon/*.lua dist/hammerspoon/ 2>/dev/null || true && rm -rf dist/skills && cp -R skills dist/skills 2>/dev/null || true',
})
