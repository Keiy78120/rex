/**
 * Unit tests for metrics.ts — toPrometheus (pure function).
 * Tests Prometheus text format output without network/daemon calls.
 * @module HQ
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-metrics-test',
  ensureRexDirs: vi.fn(),
  INGEST_STATE_PATH: '/tmp/rex-metrics-test/ingest-state.json',
  MEMORY_DB_PATH: '/tmp/rex-metrics-test/memory.sqlite',
  CONFIG_PATH: '/tmp/rex-metrics-test/config.json',
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: () => false, readFileSync: actual.readFileSync }
})

import { toPrometheus, type RexMetrics } from '../../src/metrics.js'

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<RexMetrics> = {}): RexMetrics {
  return {
    timestamp: new Date().toISOString(),
    system: { uptimeSec: 3600, cpuCount: 8, ramTotalGb: 16, ramFreeGb: 8, ramUsedPct: 50 },
    memory: { pendingChunks: 5, dbSizeBytes: 1024 * 1024, lockfileActive: false },
    ingest: {
      pendingDir: '/tmp/pending',
      pendingCount: 10,
      lockActive: false,
      lastEmbedAt: null,
      chunksPerMin: 0,
      estimatedClearMin: null,
    },
    daemon: { pidFileExists: true, logSizeBytes: 2048 },
    hub: { reachable: true, nodeCount: 3, healthyNodes: 3 },
    ...overrides,
  }
}

// ── toPrometheus ──────────────────────────────────────────────────────────────

describe('toPrometheus', () => {
  it('returns a string', () => {
    expect(typeof toPrometheus(makeMetrics())).toBe('string')
  })

  it('ends with a newline', () => {
    expect(toPrometheus(makeMetrics()).endsWith('\n')).toBe(true)
  })

  it('contains rex_system_uptime_seconds', () => {
    const out = toPrometheus(makeMetrics())
    expect(out).toContain('rex_system_uptime_seconds')
  })

  it('reflects uptimeSec value', () => {
    const out = toPrometheus(makeMetrics({ system: { uptimeSec: 7200, cpuCount: 8, ramTotalGb: 16, ramFreeGb: 8, ramUsedPct: 50 } }))
    expect(out).toContain('rex_system_uptime_seconds 7200')
  })

  it('contains rex_system_ram_used_pct', () => {
    const out = toPrometheus(makeMetrics())
    expect(out).toContain('rex_system_ram_used_pct')
  })

  it('reflects ramUsedPct value', () => {
    const out = toPrometheus(makeMetrics({ system: { uptimeSec: 3600, cpuCount: 8, ramTotalGb: 16, ramFreeGb: 8, ramUsedPct: 75 } }))
    expect(out).toContain('rex_system_ram_used_pct 75')
  })

  it('contains rex_ingest_pending_chunks', () => {
    const out = toPrometheus(makeMetrics())
    expect(out).toContain('rex_ingest_pending_chunks')
  })

  it('reflects pendingCount value', () => {
    const ingest = { pendingDir: '/tmp', pendingCount: 42, lockActive: false, lastEmbedAt: null, chunksPerMin: 0, estimatedClearMin: null }
    const out = toPrometheus(makeMetrics({ ingest }))
    expect(out).toContain('rex_ingest_pending_chunks 42')
  })

  it('contains rex_hub_reachable', () => {
    const out = toPrometheus(makeMetrics())
    expect(out).toContain('rex_hub_reachable')
  })

  it('hub reachable=true → 1', () => {
    const out = toPrometheus(makeMetrics({ hub: { reachable: true, nodeCount: 2, healthyNodes: 2 } }))
    expect(out).toContain('rex_hub_reachable 1')
  })

  it('hub reachable=false → 0', () => {
    const out = toPrometheus(makeMetrics({ hub: { reachable: false, nodeCount: 0, healthyNodes: 0 } }))
    expect(out).toContain('rex_hub_reachable 0')
  })

  it('contains rex_hub_nodes_total', () => {
    const out = toPrometheus(makeMetrics())
    expect(out).toContain('rex_hub_nodes_total')
  })

  it('reflects nodeCount', () => {
    const out = toPrometheus(makeMetrics({ hub: { reachable: true, nodeCount: 5, healthyNodes: 4 } }))
    expect(out).toContain('rex_hub_nodes_total 5')
  })

  it('contains rex_hub_nodes_healthy', () => {
    const out = toPrometheus(makeMetrics())
    expect(out).toContain('rex_hub_nodes_healthy')
  })

  it('reflects healthyNodes', () => {
    const out = toPrometheus(makeMetrics({ hub: { reachable: true, nodeCount: 5, healthyNodes: 3 } }))
    expect(out).toContain('rex_hub_nodes_healthy 3')
  })

  it('contains rex_memory_db_bytes', () => {
    const out = toPrometheus(makeMetrics())
    expect(out).toContain('rex_memory_db_bytes')
  })

  it('includes HELP and TYPE comments', () => {
    const out = toPrometheus(makeMetrics())
    expect(out).toContain('# HELP')
    expect(out).toContain('# TYPE')
  })
})
