import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/project-intent.js', () => ({
  detectIntent: vi.fn(() => ({
    intent: 'feature', confidence: 0.5, signals: [], actions: [], missing: {},
  })),
}))

vi.mock('../../src/router.js', () => ({
  pickModel: vi.fn(async () => 'qwen2.5:7b'),
}))

vi.mock('../../src/tool-adapter.js', () => ({
  getRexTools: vi.fn(() => []),
  getToolsSummary: vi.fn(() => 'No tools'),
  executeToolCall: vi.fn(async () => 'tool result'),
}))

vi.mock('../../src/rex-identity.js', () => ({
  REX_SYSTEM_PROMPT: 'You are REX.',
}))

import { applyTokenPreflight, type AgentMessage } from '../../src/agent-runtime.js'

describe('applyTokenPreflight', () => {
  it('keeps messages when estimate fits model budget', () => {
    const messages: AgentMessage[] = [
      { role: 'system', content: 'You are REX.' },
      { role: 'user', content: 'hello' },
    ]

    const result = applyTokenPreflight(messages, 'qwen2.5:1.5b')

    expect(result.compacted).toBe(false)
    expect(result.messages).toEqual(messages)
  })

  it('drops older context when estimate exceeds model budget', () => {
    const messages: AgentMessage[] = [
      { role: 'system', content: 'You are REX.' },
      { role: 'system', content: 'x'.repeat(20_000) },
      { role: 'user', content: 'latest question' },
    ]

    const result = applyTokenPreflight(messages, 'qwen2.5:1.5b')

    expect(result.compacted).toBe(true)
    expect(result.estimatedTokens).toBeLessThanOrEqual(4096)
    expect(result.messages).toEqual([
      { role: 'system', content: 'You are REX.' },
      { role: 'user', content: 'latest question' },
    ])
  })
})
