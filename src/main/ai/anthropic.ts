import { AiError, combineSignals, parseSseLines, readHttpError, wrapFetchError } from './core'
import type { AiRequest, AiRuntime, DeltaHandler } from './core'

function endpoint(baseUrl: string): string {
  const base = (baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
  if (base.endsWith('/messages')) return base
  if (base.endsWith('/v1')) return `${base}/messages`
  return `${base}/v1/messages`
}

export async function anthropicChat(
  runtime: AiRuntime,
  request: AiRequest,
  signal?: AbortSignal,
  onDelta?: DeltaHandler
): Promise<string> {
  if (!runtime.apiKey) {
    throw new AiError('No Anthropic API key set.', 'Add a key in Settings, or switch to the Claude subscription option.')
  }

  const streaming = Boolean(onDelta)
  const body: Record<string, unknown> = {
    model: runtime.provider.model || 'claude-sonnet-4-5',
    max_tokens: request.maxTokens ?? 8192,
    system: request.system,
    messages: request.messages,
    temperature: request.temperature ?? 0.7
  }
  if (streaming) body.stream = true
  if (request.json) {
    // Prefill nudges the model into JSON without a fence.
    body.messages = [...request.messages, { role: 'assistant', content: '{' }]
  }

  let res: Response
  try {
    res = await fetch(endpoint(runtime.provider.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': runtime.apiKey,
        'anthropic-version': '2023-06-01',
        accept: streaming ? 'text/event-stream' : 'application/json'
      },
      body: JSON.stringify(body),
      signal: combineSignals(signal, request.timeoutMs ?? 240_000)
    })
  } catch (error) {
    throw wrapFetchError(error)
  }

  if (!res.ok) throw await readHttpError(res)

  if (!streaming) {
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; error?: { message: string } }
    const text = (data.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
    const prefix = request.json ? '{' : ''
    if (!text.trim()) throw new AiError(data.error?.message || 'The model returned an empty response.')
    return prefix + text
  }

  const reader = res.body?.getReader()
  if (!reader) throw new AiError('The provider did not return a stream.')
  const decoder = new TextDecoder()
  let text = ''
  let eventName = ''
  let dataLines: string[] = []

  const dispatch = () => {
    if (!dataLines.length) return
    const payload = dataLines.join('\n')
    dataLines = []
    if (!payload.trim()) return
    let event: Record<string, unknown>
    try {
      event = JSON.parse(payload)
    } catch {
      return
    }
    const type = (event.type as string) || eventName
    if (type === 'content_block_delta') {
      const delta = event.delta as { type?: string; text?: string } | undefined
      if (delta?.type === 'text_delta' && delta.text) {
        text += delta.text
        onDelta?.(delta.text)
      }
    } else if (type === 'error') {
      const err = event.error as { message?: string } | undefined
      throw new AiError(err?.message || 'The provider reported an error mid-stream.')
    }
    eventName = ''
  }

  const sse = parseSseLines((line) => {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    } else if (line.trim() === '') {
      dispatch()
    }
  })

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      sse.feed(decoder.decode(value, { stream: true }))
    }
    sse.flush()
    dispatch()
  } catch (error) {
    throw wrapFetchError(error)
  }

  const prefix = request.json ? '{' : ''
  return prefix + text
}
