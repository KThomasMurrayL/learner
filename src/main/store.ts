import { app, safeStorage } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  AppSettings,
  AppState,
  CliKind,
  ProviderKind,
  ProviderPatch,
  ProviderSettings,
  Session,
  ThemeMode
} from '@shared/types'
import type { AiRuntime } from './ai/core'

interface StoredProvider extends Omit<ProviderSettings, 'hasKey' | 'keyHint'> {
  apiKeyCipher?: string
  keys?: Partial<Record<'anthropic' | 'openai', string>>
}

interface DiskData {
  version: 1
  settings: {
    provider: StoredProvider
    theme: ThemeMode
  }
  sessions: Session[]
}

const DEFAULT_PROVIDER: StoredProvider = {
  kind: 'cli',
  model: '',
  baseUrl: 'https://api.openai.com/v1',
  cliKind: 'claude',
  cliModel: ''
}

let cache: DiskData | null = null

function dataFile(): string {
  return join(app.getPath('userData'), 'learner-data.json')
}

function defaults(): DiskData {
  return {
    version: 1,
    settings: {
      provider: { ...DEFAULT_PROVIDER },
      theme: 'system'
    },
    sessions: []
  }
}

function sanitize(input: unknown): DiskData {
  const base = defaults()
  if (!input || typeof input !== 'object') return base
  const data = input as Partial<DiskData>

  const stored = (data.settings?.provider ?? {}) as Partial<StoredProvider>
  const provider: StoredProvider = {
    ...DEFAULT_PROVIDER,
    ...stored,
    kind: (['cli', 'anthropic', 'openai', 'demo'] as ProviderKind[]).includes(stored.kind as ProviderKind)
      ? (stored.kind as ProviderKind)
      : 'cli',
    cliKind: (['claude', 'opencode'] as CliKind[]).includes(stored.cliKind as CliKind)
      ? (stored.cliKind as CliKind)
      : 'claude',
    model: typeof stored.model === 'string' ? stored.model : '',
    baseUrl: typeof stored.baseUrl === 'string' && stored.baseUrl.trim() ? stored.baseUrl : DEFAULT_PROVIDER.baseUrl,
    cliModel: typeof stored.cliModel === 'string' ? stored.cliModel : ''
  }
  if (typeof stored.apiKeyCipher === 'string' && stored.apiKeyCipher) {
    const kind = provider.kind === 'anthropic' || provider.kind === 'openai' ? provider.kind : null
    if (kind) {
      provider.keys = { ...(stored.keys ?? {}), [kind]: stored.apiKeyCipher }
    }
  } else if (stored.keys && typeof stored.keys === 'object') {
    provider.keys = stored.keys
  }
  const keys: Partial<Record<'anthropic' | 'openai', string>> = {}
  for (const kind of ['anthropic', 'openai'] as const) {
    const value = provider.keys?.[kind]
    if (typeof value === 'string' && value) keys[kind] = value
  }
  provider.keys = keys
  delete provider.apiKeyCipher

  const theme: ThemeMode = (['light', 'dark', 'system'] as ThemeMode[]).includes(data.settings?.theme as ThemeMode)
    ? (data.settings?.theme as ThemeMode)
    : 'system'

  const sessions = Array.isArray(data.sessions)
    ? data.sessions
        .filter(
          (session): session is Session =>
            Boolean(
              session &&
                typeof session === 'object' &&
                typeof session.id === 'string' &&
                session.quiz &&
                Array.isArray(session.quiz.questions)
            )
        )
        .map((session) => ({
          ...session,
          answers: Array.isArray(session.answers) ? session.answers : [],
          lessons: (Array.isArray(session.lessons) ? session.lessons : []).map((lesson) => {
            if (lesson.status === 'streaming') {
              return { ...lesson, status: 'error' as const, error: 'Generation was interrupted when the app closed.' }
            }
            return lesson
          })
        }))
        .sort((a, b) => (b.lastOpenedAt || b.createdAt) - (a.lastOpenedAt || a.createdAt))
    : []

  return {
    version: 1,
    settings: { provider, theme },
    sessions: sessions.slice(0, 250)
  }
}

function load(): DiskData {
  if (cache) return cache
  const file = dataFile()
  if (!existsSync(file)) {
    cache = defaults()
    return cache
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    cache = sanitize(parsed)
  } catch {
    try {
      copyFileSync(file, `${file}.corrupt-${Date.now()}`)
    } catch {
      // best effort
    }
    cache = defaults()
  }
  return cache
}

function write(): void {
  if (!cache) return
  const file = dataFile()
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(cache, null, 2), { mode: 0o600 })
  renameSync(temp, file)
}

function encryptKey(key: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return `enc:${safeStorage.encryptString(key).toString('base64')}`
  }
  return `b64:${Buffer.from(key, 'utf8').toString('base64')}`
}

function decryptKey(cipher: string): string | null {
  try {
    if (cipher.startsWith('enc:')) {
      return safeStorage.decryptString(Buffer.from(cipher.slice(4), 'base64'))
    }
    if (cipher.startsWith('b64:')) {
      return Buffer.from(cipher.slice(4), 'base64').toString('utf8')
    }
  } catch {
    return null
  }
  return null
}

function environmentKey(kind: ProviderKind): string | null {
  if (kind === 'anthropic') return process.env.ANTHROPIC_API_KEY?.trim() || null
  if (kind === 'openai') return process.env.OPENAI_API_KEY?.trim() || null
  return null
}

export function getApiKey(): string | null {
  const provider = load().settings.provider
  const kind = provider.kind
  if (kind === 'anthropic' || kind === 'openai') {
    const cipher = provider.keys?.[kind]
    if (cipher) {
      const decrypted = decryptKey(cipher)
      if (decrypted) return decrypted
    }
  }
  return environmentKey(provider.kind)
}

function toPublicProvider(provider: StoredProvider): ProviderSettings {
  const key = getApiKey()
  return {
    kind: provider.kind,
    model: provider.model,
    baseUrl: provider.baseUrl,
    cliKind: provider.cliKind,
    cliModel: provider.cliModel,
    hasKey: Boolean(key),
    keyHint: key ? `••••${key.slice(-4)}` : ''
  }
}

export function getPublicSettings(): AppSettings {
  const data = load()
  return {
    provider: toPublicProvider(data.settings.provider),
    theme: data.settings.theme
  }
}

export function getRuntime(): AiRuntime {
  return { provider: getPublicSettings().provider, apiKey: getApiKey() }
}

export function getPublicState(): AppState {
  const data = load()
  return {
    settings: getPublicSettings(),
    sessions: data.sessions,
    dataPath: dataFile(),
    version: app.getVersion()
  }
}

export function saveSettings(patch: ProviderPatch): AppState {
  const data = load()
  const provider = data.settings.provider

  if (patch.kind && (['cli', 'anthropic', 'openai', 'demo'] as ProviderKind[]).includes(patch.kind)) {
    provider.kind = patch.kind
  }
  if (patch.cliKind && (['claude', 'opencode'] as CliKind[]).includes(patch.cliKind)) {
    provider.cliKind = patch.cliKind
  }
  if (typeof patch.model === 'string') provider.model = patch.model.trim()
  if (typeof patch.cliModel === 'string') provider.cliModel = patch.cliModel.trim()
  if (typeof patch.baseUrl === 'string') {
    provider.baseUrl = patch.baseUrl.trim() || DEFAULT_PROVIDER.baseUrl
  }
  if (patch.theme) data.settings.theme = patch.theme

  if (patch.apiKey !== undefined) {
    const kind = provider.kind === 'anthropic' || provider.kind === 'openai' ? provider.kind : null
    if (kind) {
      if (patch.apiKey === null || patch.apiKey.trim() === '') {
        if (provider.keys) delete provider.keys[kind]
      } else {
        provider.keys = { ...(provider.keys ?? {}), [kind]: encryptKey(patch.apiKey.trim()) }
      }
    }
  }

  cache = data
  write()
  return getPublicState()
}

export function upsertSession(session: Session): void {
  if (!session || typeof session.id !== 'string') return
  const data = load()
  const index = data.sessions.findIndex((entry) => entry.id === session.id)
  if (index === -1) data.sessions.unshift(session)
  else data.sessions[index] = session
  data.sessions.sort((a, b) => (b.lastOpenedAt || b.createdAt) - (a.lastOpenedAt || a.createdAt))
  data.sessions = data.sessions.slice(0, 250)
  cache = data
  write()
}

export function removeSession(id: string): void {
  const data = load()
  data.sessions = data.sessions.filter((session) => session.id !== id)
  cache = data
  write()
}

export function dataFilePath(): string {
  return dataFile()
}
