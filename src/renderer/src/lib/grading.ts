import type {
  AnswerRecord,
  Grade,
  GradedQuestion,
  Lesson,
  QuizQuestion,
  QuizResult,
  Session,
  ShortAnswerGrade,
  ShortAnswerItem,
  TopicScore
} from '@shared/types'
import { api } from './api'

export interface LessonMiss {
  prompt: string
  yourAnswer: string
  correctAnswer: string
  explanation: string
}

export const UNKNOWN_FEEDBACK = 'You marked this as unknown. That is useful signal — no guess, no false confidence.'

export function findAnswer(session: Session, questionId: string): AnswerRecord | undefined {
  return session.answers.find((answer) => answer.questionId === questionId)
}

export function answerText(session: Session, question: QuizQuestion): string {
  const answer = findAnswer(session, question.id)
  if (!answer) return ''
  if (answer.kind === 'choice') {
    return question.options.find((option) => option.id === answer.choiceId)?.text ?? ''
  }
  return answer.text?.trim() ?? ''
}

export function correctAnswerText(question: QuizQuestion): string {
  if (question.type === 'multiple_choice') {
    return question.options.find((option) => option.id === question.answerId)?.text ?? question.modelAnswer
  }
  return question.modelAnswer
}

export function gradeQuestionLocally(
  question: QuizQuestion,
  answer: AnswerRecord | undefined
): GradedQuestion {
  if (!answer || answer.kind === 'unknown') {
    return { questionId: question.id, grade: 'unanswered', awarded: 0, feedback: UNKNOWN_FEEDBACK }
  }

  if (question.type === 'multiple_choice') {
    const correct = answer.kind === 'choice' && answer.choiceId === question.answerId
    return {
      questionId: question.id,
      grade: correct ? 'correct' : 'incorrect',
      awarded: correct ? 1 : 0,
      feedback: ''
    }
  }

  if (!answer.text?.trim()) {
    return { questionId: question.id, grade: 'unanswered', awarded: 0, feedback: UNKNOWN_FEEDBACK }
  }
  return { questionId: question.id, grade: 'incorrect', awarded: 0, feedback: '' }
}

function tokens(value: string): Set<string> {
  return new Set(
    (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => word.length > 3)
  )
}

function fallbackGrade(item: ShortAnswerItem): ShortAnswerGrade {
  const expected = tokens(item.modelAnswer)
  const actual = tokens(item.answer)
  let overlap = 0
  for (const token of actual) if (expected.has(token)) overlap += 1
  const ratio = expected.size === 0 ? 0 : overlap / expected.size

  if (ratio >= 0.55) {
    return {
      id: item.id,
      grade: 'correct',
      feedback: 'This looks right, but AI marking was unavailable, so check it against the model answer.'
    }
  }
  if (ratio >= 0.25) {
    return {
      id: item.id,
      grade: 'partial',
      feedback: 'You have part of the idea. Compare your wording with the model answer to find the missing link.'
    }
  }
  return {
    id: item.id,
    grade: 'incorrect',
    feedback: 'AI marking was unavailable. Compare your answer with the model answer and explanation below.'
  }
}

export async function markSession(session: Session, onStage: (label: string) => void): Promise<QuizResult> {
  const { quiz } = session
  const gradedMap = new Map<string, GradedQuestion>()
  const shortItems: ShortAnswerItem[] = []

  for (const question of quiz.questions) {
    const answer = findAnswer(session, question.id)
    const local = gradeQuestionLocally(question, answer)
    gradedMap.set(question.id, local)
    if (
      question.type === 'short_answer' &&
      answer?.kind === 'text' &&
      answer.text?.trim() &&
      local.grade !== 'unanswered'
    ) {
      shortItems.push({
        id: question.id,
        topic: question.topic,
        prompt: question.prompt,
        modelAnswer: question.modelAnswer,
        answer: answer.text.trim()
      })
    }
  }

  let gradingNote: string | undefined

  if (shortItems.length) {
    onStage('Marking your written answers…')
    try {
      const grades = await api.gradeAnswers(quiz.subject, shortItems)
      for (const item of shortItems) {
        const found = grades.find((grade) => grade.id === item.id)
        const grade: ShortAnswerGrade = found ?? fallbackGrade(item)
        gradedMap.set(item.id, {
          questionId: item.id,
          grade: grade.grade,
          awarded: grade.grade === 'correct' ? 1 : grade.grade === 'partial' ? 0.5 : 0,
          feedback: grade.feedback
        })
      }
    } catch {
      gradingNote = 'AI marking was unavailable, so written answers were checked automatically. Treat those marks as a rough guide.'
      for (const item of shortItems) {
        const grade = fallbackGrade(item)
        gradedMap.set(item.id, {
          questionId: item.id,
          grade: grade.grade,
          awarded: grade.grade === 'correct' ? 1 : grade.grade === 'partial' ? 0.5 : 0,
          feedback: grade.feedback
        })
      }
    }
  }

  const graded = quiz.questions.map(
    (question) =>
      gradedMap.get(question.id) ?? {
        questionId: question.id,
        grade: 'unanswered' as Grade,
        awarded: 0,
        feedback: UNKNOWN_FEEDBACK
      }
  )

  const byTopicMap = new Map<string, TopicScore>()
  quiz.questions.forEach((question) => {
    const entry = byTopicMap.get(question.topic) ?? {
      topic: question.topic,
      awarded: 0,
      possible: 0,
      missed: 0,
      percent: 0
    }
    const grade = graded.find((g) => g.questionId === question.id)
    entry.possible += 1
    entry.awarded += grade?.awarded ?? 0
    if (!grade || grade.grade !== 'correct') entry.missed += 1
    byTopicMap.set(question.topic, entry)
  })

  const byTopic = [...byTopicMap.values()]
    .map((entry) => ({ ...entry, percent: entry.possible ? (entry.awarded / entry.possible) * 100 : 0 }))
    .sort((a, b) => a.percent - b.percent)

  const score = graded.reduce((sum, entry) => sum + entry.awarded, 0)
  const possible = quiz.questions.length

  return {
    score,
    possible,
    percent: possible ? (score / possible) * 100 : 0,
    graded,
    byTopic,
    weakTopics: byTopic.filter((entry) => entry.percent < 75).map((entry) => entry.topic).slice(0, 5),
    gradedAt: Date.now(),
    gradingNote
  }
}

export function collectMisses(session: Session, topic: string): LessonMiss[] {
  if (!session.result) return []
  return session.quiz.questions
    .filter((question) => question.topic === topic)
    .map((question) => {
      const grade = session.result?.graded.find((entry) => entry.questionId === question.id)
      if (!grade || grade.grade === 'correct') return null
      return {
        prompt: question.prompt,
        yourAnswer: answerText(session, question),
        correctAnswer: correctAnswerText(question),
        explanation: question.explanation || grade.feedback || ''
      }
    })
    .filter((miss): miss is LessonMiss => Boolean(miss))
}

export interface PlannedLesson {
  topic: string
  misses: LessonMiss[]
}

export function buildLessonPlan(session: Session): PlannedLesson[] {
  if (!session.result) return []
  const topics = session.result.weakTopics.length ? session.result.weakTopics : [session.quiz.subject]
  return topics.slice(0, 5).map((topic) => ({ topic, misses: collectMisses(session, topic) }))
}

export function extractLessonTitle(markdown: string, fallback: string): string {
  const match = markdown.match(/^\s*#\s+(.+)$/m)
  if (!match) return fallback
  return match[1].replace(/[*_`]/g, '').trim().slice(0, 120) || fallback
}

export function lessonProgress(lessons: Lesson[]): { done: number; total: number; ready: number } {
  return {
    done: lessons.filter((lesson) => lesson.completed).length,
    ready: lessons.filter((lesson) => lesson.status === 'ready').length,
    total: lessons.length
  }
}

export function scoreLabel(percent: number): string {
  if (percent >= 90) return 'Excellent'
  if (percent >= 75) return 'Strong'
  if (percent >= 55) return 'Getting there'
  if (percent >= 35) return 'A real starting point'
  return 'Plenty to build on'
}

export function scoreBlurb(percent: number): string {
  if (percent >= 90) return 'You have the foundations. The lessons will sharpen the edges.'
  if (percent >= 75) return 'A solid base with a few specific gaps. Let’s close them.'
  if (percent >= 55) return 'You know some of this. The gaps are now visible, which is the useful part.'
  if (percent >= 35) return 'A useful baseline. The lessons will build the missing pieces in order.'
  return 'Starting from the beginning is the right move. The lessons will meet you where you are.'
}
