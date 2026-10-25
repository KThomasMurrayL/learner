import type {
  Difficulty,
  Quiz,
  QuizConfig,
  QuizOption,
  QuizQuestion,
  QuestionType,
  ShortAnswerGrade,
  ShortAnswerItem
} from '@shared/types'
import { AiError } from './core'

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f']

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) return Number(value)
  return null
}

function normalizeDifficulty(value: unknown, fallback: Difficulty): Difficulty {
  const text = asString(value).toLowerCase()
  if (text === 'easy' || text === 'beginner') return 'easy'
  if (text === 'hard' || text === 'advanced' || text === 'difficult') return 'hard'
  if (text === 'medium' || text === 'intermediate') return 'medium'
  return fallback
}

function normalizeOptions(raw: unknown): QuizOption[] {
  if (!Array.isArray(raw)) return []
  const options: QuizOption[] = []
  raw.forEach((entry, index) => {
    if (typeof entry === 'string') {
      const text = entry.trim()
      if (text) options.push({ id: LETTERS[index] ?? String(index), text })
      return
    }
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>
      const text = asString(obj.text) || asString(obj.option) || asString(obj.label) || asString(obj.value)
      if (!text) return
      const id = asString(obj.id) || LETTERS[index] || String(index)
      options.push({ id: id.toLowerCase(), text })
    }
  })
  const seen = new Set<string>()
  return options.filter((option) => {
    const key = option.text.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function resolveCorrectIndex(raw: Record<string, unknown>, options: QuizOption[]): number {
  const direct =
    asNumber(raw.correctOption) ??
    asNumber(raw.correct_option) ??
    asNumber(raw.correctIndex) ??
    asNumber(raw.correct_index) ??
    asNumber(raw.answerIndex) ??
    asNumber(raw.answer_index)

  if (direct !== null) {
    if (direct >= 0 && direct < options.length) return direct
    if (direct >= 1 && direct <= options.length) return direct - 1
  }

  const flagged = options.findIndex((option) => {
    const match = (raw.options as Array<Record<string, unknown>> | undefined)?.find(
      (entry) => entry && typeof entry === 'object' && asString(entry.text).toLowerCase() === option.text.toLowerCase()
    )
    return Boolean(match && (match.correct === true || match.isCorrect === true))
  })
  if (flagged !== -1) return flagged

  const candidates = [raw.correctAnswer, raw.correct_answer, raw.answer, raw.answerId, raw.correctId]
    .map(asString)
    .filter(Boolean)

  for (const candidate of candidates) {
    const lower = candidate.toLowerCase().replace(/^[(\[]|[)\]]$/g, '').trim()
    const letter = lower.replace(/[).:\s].*$/, '')
    if (letter.length === 1 && LETTERS.includes(letter)) {
      const index = LETTERS.indexOf(letter)
      if (index < options.length) return index
    }
    const numeric = asNumber(lower)
    if (numeric !== null) {
      if (numeric >= 0 && numeric < options.length) return numeric
      if (numeric >= 1 && numeric <= options.length) return numeric - 1
    }
    const byId = options.findIndex((option) => option.id.toLowerCase() === lower)
    if (byId !== -1) return byId
    const byText = options.findIndex((option) => option.text.toLowerCase() === lower)
    if (byText !== -1) return byText
    const byPrefix = options.findIndex(
      (option) => option.text.toLowerCase().startsWith(lower) || lower.startsWith(option.text.toLowerCase())
    )
    if (byPrefix !== -1) return byPrefix
  }

  return -1
}

function inferType(raw: Record<string, unknown>, options: QuizOption[]): QuestionType {
  const text = asString(raw.type).toLowerCase().replace(/[\s-]/g, '_')
  if (['multiple_choice', 'mcq', 'choice', 'multiple_choice_question'].includes(text)) return 'multiple_choice'
  if (['short_answer', 'short', 'open', 'open_ended', 'text', 'free_response'].includes(text)) return 'short_answer'
  return options.length >= 2 ? 'multiple_choice' : 'short_answer'
}

export function normalizeQuiz(raw: unknown, config: QuizConfig): Quiz {
  const data = raw as { questions?: unknown; quiz?: { questions?: unknown } }
  const list = Array.isArray(data?.questions)
    ? data.questions
    : Array.isArray(data?.quiz?.questions)
      ? data.quiz.questions
      : Array.isArray(raw)
        ? raw
        : []

  const fallbackTopics = config.topics.length ? config.topics : [config.subject]
  const questions: QuizQuestion[] = []
  const seenPrompts = new Set<string>()

  list.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return
    const obj = entry as Record<string, unknown>
    const prompt = asString(obj.prompt) || asString(obj.question) || asString(obj.text)
    if (!prompt) return
    const promptKey = prompt.toLowerCase().replace(/\s+/g, ' ')
    if (seenPrompts.has(promptKey)) return

    const options = normalizeOptions(obj.options ?? obj.choices ?? obj.answers)
    let type = inferType(obj, options)
    const rawAnswer =
      asString(obj.modelAnswer) ||
      asString(obj.model_answer) ||
      asString(obj.answerText) ||
      asString(obj.correctAnswer) ||
      asString(obj.correct_answer) ||
      asString(obj.answer)
    const explanation = asString(obj.explanation) || asString(obj.rationale) || asString(obj.why)

    let correctIndex = type === 'multiple_choice' ? resolveCorrectIndex(obj, options) : -1

    // A broken multiple-choice item with a usable answer is better as a short answer than lost.
    if (type === 'multiple_choice' && (options.length < 2 || correctIndex === -1)) {
      if (rawAnswer && rawAnswer.length > 1) {
        type = 'short_answer'
        correctIndex = -1
      } else {
        return
      }
    }

    let modelAnswer = rawAnswer
    if (type === 'multiple_choice' && correctIndex >= 0) modelAnswer = options[correctIndex].text
    if (!modelAnswer) return

    const accepted = Array.isArray(obj.acceptedAnswers)
      ? (obj.acceptedAnswers as unknown[]).map(asString).filter(Boolean)
      : []
    if (type === 'short_answer' && accepted.length && !modelAnswer) modelAnswer = accepted[0]

    seenPrompts.add(promptKey)
    questions.push({
      id: `q${questions.length + 1}`,
      topic: asString(obj.topic) || asString(obj.category) || fallbackTopics[index % fallbackTopics.length],
      type,
      difficulty: normalizeDifficulty(obj.difficulty, config.difficulty),
      prompt,
      options: type === 'multiple_choice' ? options : [],
      answerId: type === 'multiple_choice' && correctIndex >= 0 ? options[correctIndex].id : null,
      modelAnswer,
      explanation
    })
  })

  if (!questions.length) {
    throw new AiError('The model did not return any usable questions.', 'Try again, or try a different model.')
  }

  return {
    id: `quiz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    subject: config.subject,
    topics: config.topics.length ? config.topics : fallbackTopics,
    difficulty: config.difficulty,
    createdAt: Date.now(),
    questions: questions.slice(0, config.count)
  }
}

export function normalizeGrades(raw: unknown, items: ShortAnswerItem[]): ShortAnswerGrade[] {
  const data = raw as { grades?: unknown }
  const list = Array.isArray(data?.grades) ? data.grades : Array.isArray(raw) ? raw : []
  const byId = new Map<string, ShortAnswerGrade>()

  list.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return
    const obj = entry as Record<string, unknown>
    const id = asString(obj.id) || items[index]?.id
    if (!id) return
    const verdict = asString(obj.grade).toLowerCase()
    let grade: ShortAnswerGrade['grade'] = 'incorrect'
    if (['correct', 'right', 'full', 'excellent'].includes(verdict)) grade = 'correct'
    else if (['partial', 'partially_correct', 'partly_correct', 'partial_credit', 'half'].includes(verdict)) grade = 'partial'
    const feedback = asString(obj.feedback) || asString(obj.comment) || asString(obj.explanation)
    byId.set(id, { id, grade, feedback })
  })

  return items
    .map((item) => byId.get(item.id))
    .filter((value): value is ShortAnswerGrade => Boolean(value))
}
