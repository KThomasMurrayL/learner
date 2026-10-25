import { AiError, combineSignals, parseSseLines, readHttpError, wrapFetchError } from './core'
import type { AiRequest, AiRuntime, DeltaHandler } from './core'

function endpoint(baseUrl: string): string {
  const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
  if (base.endsWith('/chat/completions')) return base
  return `${base}/chat/completions`
}

interface OpenAiChoice {
  message?: { content?: string | Array<{ type: string; text?: string }> }
  delta?: { content?: string }
  finish_reason?: string
}

interface OpenAiResponse {
  choices?: OpenAiChoice[]
  error?: { message?: string }
}

function contentToText(choice: OpenAiChoice | undefined): string {
  const value = choice?.message?.content
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
  }
  return ''
}

export async function openAiChat(
  runtime: AiRuntime,
  request: AiRequest,
  signal?: AbortSignal,
  onDelta?: DeltaHandler
): Promise<string> {
  const streaming = Boolean(onDelta)
  const base = (runtime.provider.baseUrl || 'https://api.openai.com/v1').trim()
  const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(base)

  if (!runtime.apiKey && !isLocal) {
    throw new AiError('No API key set for this provider.', 'Add a key in Settings. Local servers such as Ollama do not need one.')
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (runtime.apiKey) headers.authorization = `Bearer ${runtime.apiKey}`

  const send = async (jsonMode: boolean, includeTemperature = true): Promise<Response> => {
    const body: Record<string, unknown> = {
      model: runtime.provider.model,
      messages: [
        { role: 'system', content: request.system },
        ...request.messages.map((m) => ({ role: m.role, content: m.content }))
      ]
    }
    if (includeTemperature) body.temperature = request.temperature ?? 0.7
    if (streaming) body.stream = true
    if (jsonMode) body.response_format = { type: 'json_object' }

    try {
      return await fetch(endpoint(base), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: combineSignals(signal, request.timeoutMs ?? 240_000)
      })
    } catch (error) {
      throw wrapFetchError(error)
    }
  }

  let res = await send(request.json === true)
  // Some OpenAI-compatible servers reject response_format or temperature.
  if (!res.ok && res.status === 400) {
    const detail = await res.clone().text().catch(() => '')
    if (/response_format|json_object/i.test(detail)) {
      res = await send(false)
    } else if (/temperature|unsupported value|does not support/i.test(detail)) {
      res = await send(request.json === true, false)
    }
    if (!res.ok && res.status === 400) {
      res = await send(false, false)
    }
  }
  if (!res.ok) throw await readHttpError(res)

  if (!streaming) {
    const data = (await res.json()) as OpenAiResponse
    const text = contentToText(data.choices?.[0])
    if (!text.trim()) throw new AiError(data.error?.message || 'The model returned an empty response.')
    return text
  }

  const reader = res.body?.getReader()
  if (!reader) throw new AiError('The provider did not return a stream.')
  const decoder = new TextDecoder()
  let text = ''
  const sse = parseSseLines((line) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    try {
      const event = JSON.parse(payload) as OpenAiResponse
      const delta = event.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta) {
        text += delta
        onDelta?.(delta)
      }
      if (event.error?.message) throw new AiError(event.error.message)
    } catch (error) {
      if (error instanceof AiError) throw error
    }
  })

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      sse.feed(decoder.decode(value, { stream: true }))
    }
  } catch (error) {
    throw wrapFetchError(error)
  }

  if (!text.trim()) throw new AiError('The model returned an empty response.')
  return text
}
