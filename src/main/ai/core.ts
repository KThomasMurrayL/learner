import type { ProviderSettings } from '@shared/types'
import { truncate } from './text'

export type ChatRole = 'user' | 'assistant'

export interface ChatTurn {
  role: ChatRole
  content: string
}

export interface AiRequest {
  system: string
  messages: ChatTurn[]
  maxTokens?: number
  temperature?: number
  json?: boolean
  timeoutMs?: number
}

export type DeltaHandler = (text: string) => void

export interface AiRuntime {
  provider: ProviderSettings
  apiKey: string | null
}

export class AiError extends Error {
  readonly detail?: string

  constructor(message: string, detail?: string) {
    super(message)
    this.name = 'AiError'
    this.detail = detail
  }
}

export async function readHttpError(res: Response): Promise<AiError> {
  const body = await res.text().catch(() => '')
  let message = ''
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; type?: string } | string
      message?: string
    }
    if (typeof parsed.error === 'string') message = parsed.error
    else message = parsed.error?.message || parsed.message || ''
  } catch {
    message = body
  }

  const status = res.status
  if (status === 401 || status === 403) {
    return new AiError('The provider rejected the credentials.', message || 'Check your API key or sign-in.')
  }
  if (status === 429) {
    return new AiError('The provider is rate limiting right now.', message || 'Wait a moment and try again.')
  }
  if (status === 404) {
    return new AiError('The provider could not find that model or endpoint.', message || 'Check the model name and base URL.')
  }
  if (status >= 500) {
    return new AiError('The provider had a server error.', message || `HTTP ${status}`)
  }
  return new AiError(message ? truncate(message, 260) : `The provider returned HTTP ${status}.`, `HTTP ${status}`)
}

export function wrapFetchError(error: unknown): AiError {
  if (error instanceof AiError) return error
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return new AiError('The request timed out.', 'Try again, or choose a faster model.')
    }
    const cause = (error as Error & { cause?: { code?: string; message?: string } }).cause
    const detail = cause?.code || cause?.message || error.message
    if (/ENOTFOUND|ECONNREFUSED|fetch failed|network/i.test(detail)) {
      return new AiError('Could not reach the provider.', detail)
    }
    return new AiError(error.message, detail)
  }
  return new AiError('Something went wrong while talking to the provider.')
}

export function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

export function parseSseLines(onLine: (line: string) => void) {
  let buffer = ''
  return {
    feed(chunk: string) {
      buffer += chunk.replace(/\r\n/g, '\n')
      let index = buffer.indexOf('\n')
      while (index !== -1) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        onLine(line)
        index = buffer.indexOf('\n')
      }
    },
    flush() {
      if (buffer.trim()) onLine(buffer)
      buffer = ''
    }
  }
}
