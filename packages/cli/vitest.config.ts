import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],  // CLI entry not unit-testable
    },
    testTimeout: 15000,
  },
  resolve: {
    // Handle .js extensions in ESM imports (tsup output)
    extensions: ['.ts', '.js'],
  },
})
