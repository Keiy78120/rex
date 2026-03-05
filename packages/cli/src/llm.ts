const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

const PREFERRED_MODELS = ['qwen3.5:9b', 'qwen3.5:4b', 'qwen2.5:1.5b', 'llama3.2', 'mistral']

export async function detectModel(): Promise<string> {
  if (process.env.REX_LLM_MODEL) return process.env.REX_LLM_MODEL
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`)
    const data = await res.json() as { models: Array<{ name: string }> }
    const available = data.models.map((m: any) => m.name)
    for (const pref of PREFERRED_MODELS) {
      const base = pref.split(':')[0]
      const match = available.find((a: string) => a.includes(base))
      if (match) return match
    }
    return available.find((a: string) => !a.includes('embed')) || available[0]
  } catch {
    return 'qwen3.5:4b'
  }
}

export async function llm(prompt: string, system?: string, model?: string): Promise<string> {
  const useModel = model || await detectModel()
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: useModel,
      prompt,
      system,
      stream: false,
    }),
  })

  if (!res.ok) throw new Error(`Ollama generate failed: ${res.status}`)
  const data = await res.json() as { response: string }
  return data.response
}
