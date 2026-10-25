import type {
  Difficulty,
  LessonRequest,
  Quiz,
  QuizConfig,
  ShortAnswerGrade,
  ShortAnswerItem,
  TestResult,
  TopicSuggestion
} from '@shared/types'
import { anthropicChat } from './anthropic'
import { cliChat, listOpencodeModels, resolveBinary } from './cli'
import { AiError, wrapFetchError } from './core'
import type { AiRequest, AiRuntime, DeltaHandler } from './core'
import { demoChat, demoGrade, demoLesson, demoQuiz, demoSuggestTopics } from './demo'
import { normalizeGrades, normalizeQuiz } from './normalize'
import { openAiChat } from './openai'
import { GRADE_SYSTEM, LESSON_SYSTEM, QUIZ_SYSTEM, gradePrompt, lessonPrompt, normalizeTopicSuggestions, quizPrompt, topicPrompt } from './prompts'
import { extractJsonObject, stripOuterFence, truncate } from './text'

interface ChatOptions {
  signal?: AbortSignal
  onDelta?: DeltaHandler
}

export async function chat(runtime: AiRuntime, request: AiRequest, options: ChatOptions = {}): Promise<string> {
  try {
    switch (runtime.provider.kind) {
      case 'demo':
        return await demoChat(request)
      case 'cli':
        return await cliChat(runtime, request, options.signal, options.onDelta)
      case 'anthropic':
        return await anthropicChat(runtime, request, options.signal, options.onDelta)
      case 'openai':
        return await openAiChat(runtime, request, options.signal, options.onDelta)
      default:
        throw new AiError('Unknown AI provider.')
    }
  } catch (error) {
    throw wrapFetchError(error)
  }
}

async function completeJson(runtime: AiRuntime, request: AiRequest): Promise<unknown> {
  let lastRaw = ''
  for (let attempt = 0; attempt < 2; attempt += 1) {
    lastRaw = await chat(runtime, {
      ...request,
      json: true,
      temperature: attempt === 0 ? (request.temperature ?? 0.6) : 0.2
    })
    try {
      return extractJsonObject(lastRaw)
    } catch {
      // Retry once; models occasionally wrap JSON in prose.
    }
  }
  throw new AiError(
    'The model did not return usable JSON.',
    lastRaw ? truncate(lastRaw, 240) : 'Try again, or pick a stronger model in Settings.'
  )
}

export async function suggestTopics(runtime: AiRuntime, subject: string, notes?: string): Promise<TopicSuggestion[]> {
  if (runtime.provider.kind === 'demo') return demoSuggestTopics()
  const raw = await completeJson(runtime, {
    system: QUIZ_SYSTEM,
    messages: [{ role: 'user', content: topicPrompt(subject, notes) }],
    temperature: 0.5,
    maxTokens: 1200,
    timeoutMs: 120_000
  })
  const topics = normalizeTopicSuggestions(raw)
  if (!topics.length) throw new AiError('The model did not suggest any topics.', 'Try rephrasing your subject.')
  return topics
}

export async function generateQuiz(runtime: AiRuntime, config: QuizConfig): Promise<Quiz> {
  if (runtime.provider.kind === 'demo') {
    const raw = await demoQuiz(config)
    return normalizeQuiz(raw, config)
  }
  const raw = await completeJson(runtime, {
    system: QUIZ_SYSTEM,
    messages: [{ role: 'user', content: quizPrompt(config) }],
    temperature: 0.6,
    maxTokens: 9000,
    timeoutMs: 360_000
  })
  return normalizeQuiz(raw, config)
}

export async function gradeShortAnswers(
  runtime: AiRuntime,
  subject: string,
  items: ShortAnswerItem[]
): Promise<ShortAnswerGrade[]> {
  if (!items.length) return []
  if (runtime.provider.kind === 'demo') return demoGrade(items)

  const raw = await completeJson(runtime, {
    system: GRADE_SYSTEM,
    messages: [{ role: 'user', content: gradePrompt(subject, items) }],
    temperature: 0.2,
    maxTokens: 2500,
    timeoutMs: 180_000
  })
  return normalizeGrades(raw, items)
}

export async function generateLesson(
  runtime: AiRuntime,
  request: LessonRequest,
  signal?: AbortSignal,
  onDelta?: DeltaHandler
): Promise<string> {
  if (runtime.provider.kind === 'demo') return demoLesson(request, onDelta)

  const text = await chat(
    runtime,
    {
      system: LESSON_SYSTEM,
      messages: [
        {
          role: 'user',
          content: lessonPrompt({
            subject: request.subject,
            topic: request.topic,
            difficulty: request.difficulty as Difficulty,
            misses: request.misses
          })
        }
      ],
      temperature: 0.8,
      maxTokens: 12000,
      timeoutMs: 600_000
    },
    { signal, onDelta }
  )

  const markdown = stripOuterFence(text)
  if (!markdown.trim()) throw new AiError('The lesson came back empty.', 'Try generating it again.')
  return markdown
}

export async function testProvider(runtime: AiRuntime): Promise<TestResult> {
  const started = Date.now()
  try {
    const text = await chat(runtime, {
      system: 'You are a connectivity check. Reply with the single word READY.',
      messages: [{ role: 'user', content: 'Reply with the single word READY.' }],
      temperature: 0,
      maxTokens: 64,
      timeoutMs: 90_000
    })
    return {
      ok: true,
      detail: truncate(text, 140) || 'Connected.',
      ms: Date.now() - started
    }
  } catch (error) {
    const err = wrapFetchError(error)
    return { ok: false, detail: [err.message, err.detail].filter(Boolean).join(' ') }
  }
}

function normalizeBase(baseUrl: string, fallback: string): string {
  return (baseUrl || fallback).replace(/\/+$/, '')
}

export async function listModels(runtime: AiRuntime): Promise<string[]> {
  const provider = runtime.provider

  if (provider.kind === 'demo') return ['demo']
  if (provider.kind === 'cli') {
    if (provider.cliKind !== 'opencode') return []
    return listOpencodeModels()
  }

  if (provider.kind === 'anthropic') {
    const base = normalizeBase(provider.baseUrl, 'https://api.anthropic.com')
    const url = base.endsWith('/v1') ? `${base}/models?limit=100` : `${base}/v1/models?limit=100`
    if (!runtime.apiKey) throw new AiError('Add an Anthropic API key first.')
    const res = await fetch(url, {
      headers: { 'x-api-key': runtime.apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(20_000)
    })
    if (!res.ok) throw new AiError('Could not load Anthropic models.', `HTTP ${res.status}`)
    const data = (await res.json()) as { data?: Array<{ id: string }> }
    return (data.data ?? []).map((model) => model.id).sort()
  }

  const base = normalizeBase(provider.baseUrl, 'https://api.openai.com/v1')
  const url = `${base}/models`
  const headers: Record<string, string> = {}
  if (runtime.apiKey) headers.authorization = `Bearer ${runtime.apiKey}`
  let res: Response
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) })
  } catch (error) {
    throw wrapFetchError(error)
  }
  if (!res.ok) throw new AiError('Could not load models from this endpoint.', `HTTP ${res.status}`)
  const data = (await res.json()) as { data?: Array<{ id: string }> }
  return (data.data ?? []).map((model) => model.id).sort().slice(0, 400)
}

export function providerSummary(runtime: AiRuntime): { configured: boolean; summary: string; detail: string } {
  const provider = runtime.provider
  if (provider.kind === 'demo') {
    return { configured: true, summary: 'Demo content', detail: 'Sample quiz and lessons. No AI calls are made.' }
  }
  if (provider.kind === 'cli') {
    const name = provider.cliKind === 'opencode' ? 'OpenCode' : 'Claude Code'
    const bin = resolveBinary(provider.cliKind === 'opencode' ? 'opencode' : 'claude')
    const model = provider.cliModel || provider.model || 'default model'
    if (!bin) {
      return {
        configured: false,
        summary: `${name} not found`,
        detail: `The ${name} CLI is not on this computer. Install it or switch to an API provider in Settings.`
      }
    }
    return { configured: true, summary: `${name} · ${model}`, detail: `Using your local ${name} sign-in.` }
  }
  if (!runtime.apiKey && !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(provider.baseUrl)) {
    return {
      configured: false,
      summary: 'API key needed',
      detail: 'Add a key in Settings, or switch to Claude Code / OpenCode to use a subscription.'
    }
  }
  return {
    configured: true,
    summary: `${provider.kind === 'anthropic' ? 'Claude API' : 'OpenAI-compatible'} · ${provider.model || 'no model set'}`,
    detail: provider.baseUrl
  }
}
