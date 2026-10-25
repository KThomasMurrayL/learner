import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { AiError } from './core'
import type { AiRequest, AiRuntime, ChatTurn, DeltaHandler } from './core'
import { truncate } from './text'

const binaryCache = new Map<string, string | null>()

/** GUI apps on macOS often miss the Homebrew PATH, so look in the usual places. */
export function resolveBinary(name: string): string | null {
  if (binaryCache.has(name)) return binaryCache.get(name) ?? null

  const dirs = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(homedir(), '.local', 'bin'),
    join(homedir(), '.npm-global', 'bin'),
    join(homedir(), '.bun', 'bin'),
    '/usr/bin',
    '/bin'
  ]

  for (const dir of dirs) {
    const candidate = join(dir, name)
    if (existsSync(candidate)) {
      binaryCache.set(name, candidate)
      return candidate
    }
  }

  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (!dir) continue
    const candidate = join(dir, name)
    if (existsSync(candidate)) {
      binaryCache.set(name, candidate)
      return candidate
    }
  }

  try {
    const shell = process.env.SHELL || '/bin/zsh'
    const found = execFileSync(shell, ['-lc', `command -v ${name}`], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .trim()
      .split('\n')
      .filter(Boolean)
      .pop()
    if (found && existsSync(found)) {
      binaryCache.set(name, found)
      return found
    }
  } catch {
    // ignore — the CLI simply is not installed
  }

  binaryCache.set(name, null)
  return null
}

function formatPrompt(messages: ChatTurn[]): string {
  return messages
    .map((turn) => (turn.role === 'assistant' ? `ASSISTANT:\n${turn.content}` : turn.content))
    .join('\n\n')
}

interface RunOptions {
  signal?: AbortSignal
  timeoutMs: number
  onLine: (line: string) => void
  cwd?: string
}

function runProcess(bin: string, args: string[], input: string, options: RunOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: options.cwd || tmpdir(),
      env: {
        ...process.env,
        TERM: 'dumb',
        NO_COLOR: '1',
        FORCE_COLOR: '0'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stderr = ''
    let stdoutRest = ''
    let settled = false
    let killedByTimeout = false

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve()
    }

    const abort = (): void => {
      if (!settled) {
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 1500)
        finish(new AiError('Generation cancelled.'))
      }
    }

    const timer = setTimeout(() => {
      killedByTimeout = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 1500)
    }, options.timeoutMs)

    if (options.signal) {
      if (options.signal.aborted) {
        abort()
        return
      }
      options.signal.addEventListener('abort', abort, { once: true })
    }

    const flushLine = (line: string): void => {
      if (line.trim()) options.onLine(line)
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdoutRest += chunk
      let index = stdoutRest.indexOf('\n')
      while (index !== -1) {
        flushLine(stdoutRest.slice(0, index))
        stdoutRest = stdoutRest.slice(index + 1)
        index = stdoutRest.indexOf('\n')
      }
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000)
    })

    child.on('error', (error) => {
      finish(new AiError('Could not start the local CLI.', error.message))
    })

    child.on('close', (code) => {
      if (stdoutRest.trim()) flushLine(stdoutRest)
      if (killedByTimeout) {
        finish(new AiError('The local CLI timed out.', 'Try a faster model, or ask for a shorter lesson.'))
        return
      }
      if (settled) return
      if (code !== 0) {
        finish(
          new AiError(
            'The local CLI returned an error.',
            truncate(stderr || `Exit code ${code}`, 320)
          )
        )
        return
      }
      finish()
    })

    child.stdin.on('error', () => {
      // A CLI that exits early can close stdin; the close handler reports the real issue.
    })
    child.stdin.end(input)
  })
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function claudeCliChat(
  runtime: AiRuntime,
  request: AiRequest,
  signal?: AbortSignal,
  onDelta?: DeltaHandler
): Promise<string> {
  const bin = resolveBinary('claude')
  if (!bin) {
    throw new AiError(
      'The Claude Code CLI was not found.',
      'Install it with `npm i -g @anthropic-ai/claude-code`, or pick another provider in Settings.'
    )
  }

  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--system-prompt',
    request.system
  ]
  const model = (runtime.provider.cliModel || runtime.provider.model || '').trim()
  if (model) args.push('--model', model)

  let streamed = ''
  let assistant = ''
  let sawDelta = false
  let result = ''
  let reportedError = ''

  await runProcess(bin, args, formatPrompt(request.messages), {
    signal,
    timeoutMs: request.timeoutMs ?? 600_000,
    onLine: (line) => {
      const event = parseJsonLine(line)
      if (!event) return
      const type = event.type as string

      if (type === 'stream_event') {
        const inner = event.event as
          | { type?: string; delta?: { type?: string; text?: string } }
          | undefined
        if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta' && inner.delta.text) {
          sawDelta = true
          streamed += inner.delta.text
          onDelta?.(inner.delta.text)
        }
        return
      }

      if (type === 'assistant') {
        const message = event.message as { content?: Array<{ type?: string; text?: string }> } | undefined
        const text = (message?.content ?? [])
          .filter((block) => block.type === 'text')
          .map((block) => block.text ?? '')
          .join('')
        if (text) assistant += text
        return
      }

      if (type === 'result') {
        const value = event.result
        if (typeof value === 'string') result = value
        if (event.is_error) {
          reportedError = typeof value === 'string' ? value : 'The CLI reported an error.'
        }
      }
    }
  })

  if (reportedError && !streamed && !assistant) throw new AiError(reportedError)
  const text = (sawDelta ? streamed : assistant || result).trim()
  if (!text) throw new AiError('The Claude CLI returned an empty response.', truncate(result, 200))
  return text
}

export async function opencodeCliChat(
  runtime: AiRuntime,
  request: AiRequest,
  signal?: AbortSignal,
  onDelta?: DeltaHandler
): Promise<string> {
  const bin = resolveBinary('opencode')
  if (!bin) {
    throw new AiError(
      'The OpenCode CLI was not found.',
      'Install OpenCode, or pick another provider in Settings.'
    )
  }

  const args = ['run', '--format', 'json']
  const model = (runtime.provider.cliModel || '').trim()
  if (model) args.push('-m', model)
  args.push(formatPrompt(request.messages))

  const parts = new Map<string, string>()
  const order: string[] = []
  let errorMessage = ''

  await runProcess(bin, args, '', {
    signal,
    timeoutMs: request.timeoutMs ?? 600_000,
    onLine: (line) => {
      const event = parseJsonLine(line)
      if (!event) return
      if (event.type === 'error') {
        const err = event.error as { message?: string; data?: { message?: string } } | undefined
        errorMessage = err?.data?.message || err?.message || 'The OpenCode CLI reported an error.'
        return
      }
      if (event.type === 'text') {
        const part = event.part as { id?: string; text?: string } | undefined
        if (!part?.id || typeof part.text !== 'string') return
        const previous = parts.get(part.id) ?? ''
        if (!order.includes(part.id)) order.push(part.id)
        if (part.text.length > previous.length) {
          const delta = part.text.slice(previous.length)
          parts.set(part.id, part.text)
          onDelta?.(delta)
        }
      }
    }
  })

  if (errorMessage) throw new AiError(errorMessage)
  const text = order
    .map((id) => parts.get(id) ?? '')
    .join('\n\n')
    .trim()
  if (!text) throw new AiError('The OpenCode CLI returned an empty response.')
  return text
}

export async function cliChat(
  runtime: AiRuntime,
  request: AiRequest,
  signal?: AbortSignal,
  onDelta?: DeltaHandler
): Promise<string> {
  return runtime.provider.cliKind === 'opencode'
    ? opencodeCliChat(runtime, request, signal, onDelta)
    : claudeCliChat(runtime, request, signal, onDelta)
}
