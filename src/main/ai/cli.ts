import { execFileSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import crossSpawn from 'cross-spawn'
import { AiError } from './core'
import type { AiRequest, AiRuntime, ChatTurn, DeltaHandler } from './core'
import { truncate } from './text'

const isWindows = process.platform === 'win32'
const binaryCache = new Map<string, string | null>()

/**
 * GUI apps inherit a very different PATH from a terminal. Look in the usual
 * install locations first, then the inherited PATH, then the login shell.
 */
export function resolveBinary(name: string): string | null {
  if (binaryCache.has(name)) return binaryCache.get(name) ?? null

  if (isWindows) {
    const found = findOnWindows(name)
    binaryCache.set(name, found)
    return found
  }

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

  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
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

/** Windows finds CLI shims through PATH/PATHEXT; npm installs them as .cmd files. */
function findOnWindows(name: string): string | null {
  const extensions = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
    .split(';')
    .map((extension) => extension.trim())
    .filter(Boolean)

  const fileNames = [
    `${name}.exe`,
    `${name}.cmd`,
    `${name}.bat`,
    name,
    ...extensions.map((extension) => `${name}${extension.toLowerCase()}`)
  ]

  const dirs = [
    ...(process.env.PATH ?? '').split(delimiter),
    process.env.APPDATA ? join(process.env.APPDATA, 'npm') : '',
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs') : '',
    join(homedir(), 'AppData', 'Roaming', 'npm'),
    join(homedir(), '.local', 'bin')
  ].filter(Boolean)

  const found: string[] = []
  for (const dir of dirs) {
    for (const fileName of fileNames) {
      const candidate = join(dir, fileName)
      if (existsSync(candidate) && !found.includes(candidate)) found.push(candidate)
    }
  }

  const preferred =
    found.find((candidate) => /\.exe$/i.test(candidate)) ??
    found.find((candidate) => /\.cmd$/i.test(candidate)) ??
    found[0]
  if (preferred) return preferred

  try {
    const output = execFileSync('where', [name], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    return lines.find((line) => /\.exe$/i.test(line)) ?? lines[0] ?? null
  } catch {
    return null
  }
}

function formatPrompt(messages: ChatTurn[]): string {
  return messages
    .map((turn) => (turn.role === 'assistant' ? `ASSISTANT:\n${turn.content}` : turn.content))
    .join('\n\n')
}

function cliPrompt(request: AiRequest, includeSystem: boolean): string {
  const body = formatPrompt(request.messages)
  const system = request.system.trim()
  return includeSystem && system ? `${system}\n\n---\n\n${body}` : body
}

/** Model IDs are passed as an argument, so keep them to a harmless character set. */
function safeModel(value: string): string {
  const model = value.trim()
  if (model && !/^[A-Za-z0-9._:#/@+-]+$/.test(model)) {
    throw new AiError(
      'That model name contains characters the CLI cannot accept.',
      'Use letters, numbers, dots, dashes, slashes, colons or @.'
    )
  }
  return model
}

function killTree(child: ChildProcess): void {
  if (!child.pid) return
  if (isWindows) {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      })
    } catch {
      // already gone
    }
    return
  }
  try {
    child.kill('SIGTERM')
    setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // already gone
      }
    }, 2000)
  } catch {
    // already gone
  }
}

interface RunOptions {
  signal?: AbortSignal
  timeoutMs: number
  onLine: (line: string) => void
  cwd?: string
}

function runProcess(bin: string, args: string[], input: string, options: RunOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = crossSpawn(bin, args, {
      cwd: options.cwd || tmpdir(),
      env: {
        ...process.env,
        TERM: 'dumb',
        NO_COLOR: '1',
        FORCE_COLOR: '0'
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    let stderr = ''
    let stdoutRest = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve()
    }

    const abort = (): void => {
      if (settled) return
      killTree(child)
      finish(new AiError('Generation cancelled.'))
    }

    timer = setTimeout(() => {
      killTree(child)
      finish(
        new AiError(
          'The local CLI timed out.',
          'Try a faster model, or ask for a shorter lesson.'
        )
      )
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

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdoutRest += chunk
      let index = stdoutRest.indexOf('\n')
      while (index !== -1) {
        flushLine(stdoutRest.slice(0, index))
        stdoutRest = stdoutRest.slice(index + 1)
        index = stdoutRest.indexOf('\n')
      }
    })

    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000)
    })

    child.on('error', (error) => {
      finish(new AiError('Could not start the local CLI.', error.message))
    })

    child.on('close', (code) => {
      if (stdoutRest.trim()) flushLine(stdoutRest)
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

    child.stdin?.on('error', () => {
      // A CLI that exits early can close stdin; the close handler reports the real issue.
    })
    child.stdin?.end(input)
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

  const model = safeModel(runtime.provider.cliModel || runtime.provider.model || '')
  const systemFile = join(tmpdir(), `learner-system-${randomUUID()}.md`)
  writeFileSync(systemFile, request.system, { encoding: 'utf8', mode: 0o600 })

  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--system-prompt-file',
    systemFile
  ]
  if (model) args.push('--model', model)

  let streamed = ''
  let assistant = ''
  let sawDelta = false
  let result = ''
  let reportedError = ''

  try {
    await runProcess(bin, args, cliPrompt(request, false), {
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
          if (
            inner?.type === 'content_block_delta' &&
            inner.delta?.type === 'text_delta' &&
            inner.delta.text
          ) {
            sawDelta = true
            streamed += inner.delta.text
            onDelta?.(inner.delta.text)
          }
          return
        }

        if (type === 'assistant') {
          const message = event.message as
            | { content?: Array<{ type?: string; text?: string }> }
            | undefined
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
  } finally {
    try {
      unlinkSync(systemFile)
    } catch {
      // best effort
    }
  }

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
  const model = safeModel(runtime.provider.cliModel || '')
  if (model) args.push('-m', model)

  const parts = new Map<string, string>()
  const order: string[] = []
  let errorMessage = ''

  await runProcess(bin, args, cliPrompt(request, true), {
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

export async function listOpencodeModels(): Promise<string[]> {
  const bin = resolveBinary('opencode')
  if (!bin) throw new AiError('The OpenCode CLI was not found.')

  const output = await new Promise<string>((resolve, reject) => {
    const child = crossSpawn(bin, ['models'], {
      cwd: tmpdir(),
      env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      killTree(child)
      reject(new AiError('Timed out listing OpenCode models.'))
    }, 20_000)

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(stdout)
    }

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000)
    })
    child.on('error', (error) => finish(new AiError('Could not run the OpenCode CLI.', error.message)))
    child.on('close', (code) => {
      if (code === 0) finish()
      else finish(new AiError('Could not list OpenCode models.', truncate(stderr, 240)))
    })
  })

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes('/'))
    .slice(0, 400)
}
