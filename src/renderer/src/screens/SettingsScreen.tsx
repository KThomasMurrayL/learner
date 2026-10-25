import { useMemo, useState } from 'react'
import type { CliKind, ProviderKind, TestResult, ThemeMode } from '@shared/types'
import { api, errorMessage } from '../lib/api'
import { shortcut } from '../lib/platform'
import { useApp } from '../state/AppContext'
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconFileText,
  IconRefresh,
  IconSpark,
  IconTarget
} from '../components/Icons'

interface ProviderOption {
  key: string
  kind: ProviderKind
  cliKind?: CliKind
  title: string
  subtitle: string
  badge?: string
}

const PROVIDERS: ProviderOption[] = [
  {
    key: 'claude-code',
    kind: 'cli',
    cliKind: 'claude',
    title: 'Claude subscription',
    subtitle: 'Uses the Claude Code sign-in already on this computer.',
    badge: 'No key'
  },
  {
    key: 'opencode',
    kind: 'cli',
    cliKind: 'opencode',
    title: 'OpenCode subscription',
    subtitle: 'Runs your local OpenCode CLI with the model you pick.',
    badge: 'No key'
  },
  {
    key: 'anthropic',
    kind: 'anthropic',
    title: 'Claude API key',
    subtitle: 'Direct access with an Anthropic API key.'
  },
  {
    key: 'openai',
    kind: 'openai',
    title: 'Any OpenAI-compatible API',
    subtitle: 'OpenAI, OpenRouter, Groq, Ollama, LM Studio, OpenCode Zen…'
  },
  {
    key: 'demo',
    kind: 'demo',
    title: 'Demo mode',
    subtitle: 'No AI calls. Sample questions and a sample lesson.',
    badge: 'Offline'
  }
]

const PRESETS = [
  { label: 'OpenAI', url: 'https://api.openai.com/v1', model: 'gpt-5' },
  { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: '' },
  { label: 'Groq', url: 'https://api.groq.com/openai/v1', model: '' },
  { label: 'Ollama (local)', url: 'http://localhost:11434/v1', model: 'llama3.2' },
  { label: 'LM Studio (local)', url: 'http://localhost:1234/v1', model: '' },
  { label: 'Custom', url: '', model: '' }
]

const ANTHROPIC_MODELS = ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5']
const THEMES: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' }
]

export function SettingsScreen() {
  const { settings, updateSettings, providerStatus, dataPath, version, toast } = useApp()
  const saved = settings.provider

  const [kind, setKind] = useState<ProviderKind>(saved.kind)
  const [cliKind, setCliKind] = useState<CliKind>(saved.cliKind)
  const [model, setModel] = useState(saved.model)
  const [cliModel, setCliModel] = useState(saved.cliModel)
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<TestResult | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  const activeKey = kind === 'cli' ? `cli-${cliKind}` : kind
  const dirty =
    kind !== saved.kind ||
    (kind === 'cli' && cliKind !== saved.cliKind) ||
    model !== saved.model ||
    cliModel !== saved.cliModel ||
    baseUrl !== saved.baseUrl ||
    apiKey.trim().length > 0

  const isLocalEndpoint = /localhost|127\.0\.0\.1/.test(baseUrl)
  const keyInSync = (saved.kind === 'anthropic' && kind === 'anthropic') || (saved.kind === 'openai' && kind === 'openai')
  const hasSavedKey = keyInSync && saved.hasKey
  const savedKeyHint = keyInSync ? saved.keyHint : ''
  const presetLabel = useMemo(() => {
    const found = PRESETS.find((preset) => preset.url && preset.url === baseUrl)
    return found?.label ?? 'Custom'
  }, [baseUrl])

  const selectProvider = (option: ProviderOption) => {
    setKind(option.kind)
    if (option.cliKind) setCliKind(option.cliKind)
    if (option.kind === 'anthropic' && /openai\.com|openrouter\.ai|localhost|127\.0\.0\.1/.test(baseUrl)) {
      setBaseUrl('https://api.anthropic.com')
    }
    if (option.kind === 'anthropic' && (!model.trim() || !model.toLowerCase().includes('claude'))) {
      setModel('claude-sonnet-4-5')
    }
    if (option.kind === 'openai' && (!baseUrl.trim() || /api\.anthropic\.com/.test(baseUrl))) {
      setBaseUrl('https://api.openai.com/v1')
    }
    if (option.kind === 'openai' && model.toLowerCase().includes('claude')) {
      setModel('')
    }
    if (option.cliKind === 'claude' && cliModel.includes('/')) {
      setCliModel('')
    }
    if (option.cliKind === 'opencode' && cliModel.trim() && !cliModel.includes('/')) {
      setCliModel('')
    }
    setModels([])
    setTest(null)
  }

  const save = async (): Promise<boolean> => {
    setSaving(true)
    try {
      await updateSettings({
        kind,
        cliKind,
        model,
        cliModel,
        baseUrl,
        apiKey: apiKey.trim() ? apiKey.trim() : undefined
      })
      setApiKey('')
      setTest(null)
      toast('Settings saved.', 'success')
      return true
    } catch (error) {
      toast(errorMessage(error), 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  const removeKey = async () => {
    try {
      await updateSettings({ apiKey: null })
      toast('API key removed.', 'success')
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  const testConnection = async () => {
    if (testing) return
    setTesting(true)
    setTest(null)
    try {
      if (dirty) {
        const ok = await save()
        if (!ok) return
      }
      const result = await api.testProvider()
      setTest(result)
    } catch (error) {
      setTest({ ok: false, detail: errorMessage(error) })
    } finally {
      setTesting(false)
    }
  }

  const loadModels = async () => {
    if (loadingModels) return
    setLoadingModels(true)
    try {
      if (dirty) {
        const ok = await save()
        if (!ok) return
      }
      const list = await api.listModels()
      setModels(list)
      if (!list.length) {
        toast('This provider does not offer a model list. Type the model name instead.', 'info')
      }
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setLoadingModels(false)
    }
  }

  const modelOptions = useMemo(() => {
    const base = kind === 'anthropic' ? ANTHROPIC_MODELS : []
    return [...new Set([...models, ...base])]
  }, [kind, models])

  const setTheme = async (theme: ThemeMode) => {
    try {
      await updateSettings({ theme })
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  return (
    <div className="screen settings-screen">
      <header className="page-head">
        <div>
          <div className="eyebrow">
            <IconTarget size={15} />
            Settings
          </div>
          <h1>How Learner thinks</h1>
          <p className="page-sub">
            Use a subscription that is already signed in, or point the app at any model provider you like.
          </p>
        </div>
        <div className={`status-card${providerStatus?.configured ? ' is-on' : ' is-off'}`}>
          <span className={`status-dot${providerStatus?.configured ? ' is-on' : ' is-off'}`} />
          <span>
            <strong>{providerStatus?.summary ?? 'Not checked'}</strong>
            <span>{providerStatus?.detail ?? 'Save a provider to test it.'}</span>
          </span>
        </div>
      </header>

      <section className="settings-card">
        <div className="settings-card-head">
          <h2>AI provider</h2>
          <span className="meta-muted">Used for quizzes, marking and lessons</span>
        </div>

        <div className="provider-grid">
          {PROVIDERS.map((option) => {
            const key = option.kind === 'cli' ? `cli-${option.cliKind}` : option.kind
            const isActive = activeKey === key
            return (
              <button
                key={option.key}
                type="button"
                className={`provider-option${isActive ? ' is-active' : ''}`}
                onClick={() => selectProvider(option)}
              >
                <span className="provider-radio">{isActive ? <span /> : null}</span>
                <span className="provider-option-copy">
                  <span className="provider-option-title">
                    {option.title}
                    {option.badge ? <span className="provider-badge">{option.badge}</span> : null}
                  </span>
                  <span className="provider-option-sub">{option.subtitle}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="provider-config">
          {kind === 'cli' ? (
            <>
              <div className="config-note">
                <IconSpark size={16} />
                <span>
                  Learner runs the local <strong>{cliKind === 'opencode' ? 'opencode' : 'claude'}</strong> command for
                  each request. Your subscription sign-in stays in the CLI — no API key enters this app.
                </span>
              </div>
              <div className="field-row">
                <label className="field-block">
                  <span className="field-label">Model</span>
                  <div className="field-with-button">
                    <input
                      className="text-input"
                      value={cliModel}
                      onChange={(event) => setCliModel(event.target.value)}
                      list="model-options"
                      placeholder={
                        cliKind === 'opencode' ? 'e.g. opencode-go/kimi-k3.1-pro' : 'Leave blank for your Claude default'
                      }
                      spellCheck={false}
                    />
                    {cliKind === 'opencode' ? (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => void loadModels()}
                        disabled={loadingModels}
                      >
                        {loadingModels ? <span className="spinner small" /> : <IconRefresh size={14} />}
                        Load
                      </button>
                    ) : null}
                  </div>
                  <span className="field-hint">
                    {cliKind === 'opencode'
                      ? 'Run `opencode models` in a terminal to see valid IDs. OpenCode needs an explicit model.'
                      : 'Optional. Without it, the Claude Code CLI uses your configured default.'}
                  </span>
                </label>
              </div>
            </>
          ) : null}

          {kind === 'anthropic' ? (
            <>
              <div className="field-row">
                <label className="field-block">
                  <span className="field-label">Anthropic API key</span>
                  <div className="field-with-button">
                    <input
                      type="password"
                      className="text-input"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={hasSavedKey ? `Saved ${savedKeyHint} — type to replace` : 'sk-ant-…'}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    {hasSavedKey ? (
                      <button type="button" className="ghost-button" onClick={() => void removeKey()}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <span className="field-hint">Encrypted with your operating system's secure storage and saved only locally.</span>
                </label>
              </div>
              <div className="field-row two">
                <label className="field-block">
                  <span className="field-label">Model</span>
                  <input
                    className="text-input"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    list="model-options"
                    placeholder="claude-sonnet-4-5"
                    spellCheck={false}
                  />
                </label>
                <label className="field-block">
                  <span className="field-label">Base URL</span>
                  <input
                    className="text-input"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder="https://api.anthropic.com"
                    spellCheck={false}
                  />
                </label>
              </div>
            </>
          ) : null}

          {kind === 'openai' ? (
            <>
              <div className="field-row two">
                <label className="field-block">
                  <span className="field-label">Endpoint preset</span>
                  <select
                    className="text-input"
                    value={presetLabel}
                    onChange={(event) => {
                      const preset = PRESETS.find((entry) => entry.label === event.target.value)
                      if (!preset) return
                      if (preset.url) setBaseUrl(preset.url)
                      if (preset.model && !model) setModel(preset.model)
                    }}
                  >
                    {PRESETS.map((preset) => (
                      <option key={preset.label} value={preset.label}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span className="field-label">Base URL</span>
                  <input
                    className="text-input"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder="https://api.openai.com/v1"
                    spellCheck={false}
                  />
                </label>
              </div>
              <div className="field-row">
                <label className="field-block">
                  <span className="field-label">Model</span>
                  <div className="field-with-button">
                    <input
                      className="text-input"
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      list="model-options"
                      placeholder="e.g. gpt-5, llama3.2, openai/gpt-5"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => void loadModels()}
                      disabled={loadingModels}
                    >
                      {loadingModels ? <span className="spinner small" /> : <IconRefresh size={14} />}
                      Load models
                    </button>
                  </div>
                </label>
              </div>
              <div className="field-row">
                <label className="field-block">
                  <span className="field-label">API key {isLocalEndpoint ? '(not needed for local servers)' : ''}</span>
                  <div className="field-with-button">
                    <input
                      type="password"
                      className="text-input"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={hasSavedKey ? `Saved ${savedKeyHint} — type to replace` : 'sk-…'}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    {hasSavedKey ? (
                      <button type="button" className="ghost-button" onClick={() => void removeKey()}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <span className="field-hint">
                    Sent only to the endpoint above. Encrypted with your operating system's secure storage when saved.
                  </span>
                </label>
              </div>
            </>
          ) : null}

          {kind === 'demo' ? (
            <div className="config-note">
              <IconSpark size={16} />
              <span>
                Demo mode makes no AI calls. The quiz is a fixed sample about how learning works, useful for trying the
                flow before connecting a provider.
              </span>
            </div>
          ) : null}

          <datalist id="model-options">
            {modelOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>

          <div className="config-actions">
            <button type="button" className="primary-button" onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? <span className="spinner small" /> : null}
              {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            </button>
            <button type="button" className="ghost-button" onClick={() => void testConnection()} disabled={testing}>
              {testing ? <span className="spinner small" /> : <IconSpark size={15} />}
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            {dirty ? <span className="dirty-hint">Unsaved changes</span> : null}
          </div>

          {test ? (
            <div className={`test-result${test.ok ? ' is-ok' : ' is-error'}`}>
              {test.ok ? <IconCheck size={16} /> : <IconAlert size={16} />}
              <span>
                {test.ok ? (
                  <>
                    Connected{test.ms ? ` in ${(test.ms / 1000).toFixed(1)}s` : ''}. Model replied: “{test.detail}”
                  </>
                ) : (
                  <>Could not connect. {test.detail}</>
                )}
              </span>
            </div>
          ) : null}

          {kind === 'cli' ? (
            <div className="cli-hint">
              <IconFileText size={15} />
              <span>
                First CLI call can take a few extra seconds while the tool starts. If the app says the command is
                missing, open a terminal once to confirm <code>{cliKind === 'opencode' ? 'opencode' : 'claude'} --version</code>{' '}
                works.
              </span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <h2>Appearance</h2>
          <span className="meta-muted">Reading is easier with the right light</span>
        </div>
        <div className="theme-row">
          {THEMES.map((theme) => (
            <button
              key={theme.value}
              type="button"
              className={`theme-option${settings.theme === theme.value ? ' is-active' : ''}`}
              onClick={() => void setTheme(theme.value)}
            >
              <span className={`theme-swatch is-${theme.value}`} />
              {theme.label}
              {settings.theme === theme.value ? <IconCheck size={14} /> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <h2>Data &amp; privacy</h2>
          <span className="meta-muted">Local by default</span>
        </div>
        <div className="data-row">
          <div>
            <span className="field-label">Your data file</span>
            <code className="path-text">{dataPath || 'Loading…'}</code>
            <p className="field-hint">
              Quizzes, answers and lessons live here as JSON. API keys are encrypted separately inside it.
            </p>
          </div>
          <button type="button" className="ghost-button" onClick={() => void api.revealDataFile()}>
            Show in folder
          </button>
        </div>
        <div className="privacy-points">
          <span>
            <IconCheck size={14} /> No accounts, no telemetry, no sync server.
          </span>
          <span>
            <IconCheck size={14} /> Requests go only to the provider you chose.
          </span>
          <span>
            <IconCheck size={14} /> Version {version || '1.1.0'} · runs entirely on your computer.
          </span>
        </div>
        <div className="keyboard-note">
          <IconArrowRight size={14} />
          Keyboard: <kbd>{shortcut('N')}</kbd> new quiz · <kbd>{shortcut(',')}</kbd> settings · <kbd>1</kbd>–<kbd>4</kbd> pick an answer ·{' '}
          <kbd>U</kbd> don’t know.
        </div>
      </section>
    </div>
  )
}
