import { useMemo, useState } from 'react'
import type { Session } from '@shared/types'
import { api, errorMessage } from '../lib/api'
import {
  answerText,
  correctAnswerText,
  scoreBlurb,
  scoreLabel
} from '../lib/grading'
import { formatDate, formatPercent, formatScore, titleCase } from '../lib/format'
import { useApp } from '../state/AppContext'
import {
  IconArrowRight,
  IconBook,
  IconCheck,
  IconClose,
  IconLightbulb,
  IconRefresh,
  IconSpark,
  IconTarget
} from '../components/Icons'

interface ResultsScreenProps {
  session: Session
  onOpenLessons: () => void
  onStartQuiz: (sessionId: string) => void
  onHome: () => void
}

type Filter = 'all' | 'missed' | 'unanswered'

export function ResultsScreen({ session, onOpenLessons, onStartQuiz, onHome }: ResultsScreenProps) {
  const { result } = session
  const { createSession, startLessons, toast } = useApp()
  const [filter, setFilter] = useState<Filter>('all')
  const [practiceBusy, setPracticeBusy] = useState(false)
  const [practiceError, setPracticeError] = useState('')

  const gradedById = useMemo(() => {
    const map = new Map<string, NonNullable<Session['result']>['graded'][number]>()
    result?.graded.forEach((entry) => map.set(entry.questionId, entry))
    return map
  }, [result])

  if (!result) {
    return (
      <div className="screen narrow-screen">
        <div className="empty-card">
          <h2>This quiz has not been marked yet.</h2>
          <button type="button" className="primary-button" onClick={onHome}>
            Back to study
          </button>
        </div>
      </div>
    )
  }

  const percent = Math.round(result.percent)
  const circumference = 2 * Math.PI * 52
  const missedQuestions = session.quiz.questions.filter((question) => gradedById.get(question.id)?.grade !== 'correct')
  const blankQuestions = session.quiz.questions.filter((question) => {
    const grade = gradedById.get(question.id)?.grade
    return grade === 'unanswered'
  })
  const visibleQuestions =
    filter === 'all' ? session.quiz.questions : filter === 'missed' ? missedQuestions : blankQuestions

  const readyLessons = session.lessons.filter((lesson) => lesson.status === 'ready').length
  const failedLessons = session.lessons.filter((lesson) => lesson.status === 'error').length
  const lessonTopics = result.weakTopics.length ? result.weakTopics : [session.quiz.subject]

  const openLessons = () => {
    if (!session.lessons.length) void startLessons(session.id)
    onOpenLessons()
  }

  const practice = async () => {
    if (practiceBusy) return
    setPracticeBusy(true)
    setPracticeError('')
    try {
      const topics = result.weakTopics.length ? result.weakTopics : session.quiz.topics
      const quiz = await api.generateQuiz({
        subject: session.quiz.subject,
        topics,
        count: Math.min(10, Math.max(5, session.quiz.questions.length)),
        difficulty: session.quiz.difficulty,
        notes: 'This is a follow-up quiz. Focus on the areas the learner missed last time.'
      })
      const nextSession = createSession(quiz)
      toast('Fresh quiz on your weak spots.', 'success')
      onStartQuiz(nextSession.id)
    } catch (error) {
      setPracticeError(errorMessage(error))
    } finally {
      setPracticeBusy(false)
    }
  }

  return (
    <div className="screen results-screen">
      <header className="results-head">
        <div>
          <div className="eyebrow">
            <IconCheck size={15} />
            Marked
          </div>
          <h1>{session.quiz.subject}</h1>
          <p className="results-meta">
            {formatDate(result.gradedAt)} · {session.quiz.questions.length} questions ·{' '}
            {titleCase(session.quiz.difficulty)}
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={onHome}>
          New subject
        </button>
      </header>

      <div className="results-grid">
        <section className="score-card">
          <div className="score-ring-wrap">
            <svg viewBox="0 0 120 120" className="score-ring" aria-hidden="true">
              <circle cx="60" cy="60" r="52" className="ring-track" />
              <circle
                cx="60"
                cy="60"
                r="52"
                className="ring-fill"
                strokeDasharray={`${(circumference * percent) / 100} ${circumference}`}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div className="score-ring-label">
              <span className="score-number">{percent}%</span>
              <span className="score-fraction">
                {formatScore(result.score)} / {result.possible}
              </span>
            </div>
          </div>
          <div className="score-copy">
            <span className="score-verdict">{scoreLabel(result.percent)}</span>
            <p>{scoreBlurb(result.percent)}</p>
            <div className="score-pills">
              <span className="pill is-good">
                {result.graded.filter((entry) => entry.grade === 'correct').length} correct
              </span>
              <span className="pill is-mid">
                {result.graded.filter((entry) => entry.grade === 'partial').length} partial
              </span>
              <span className="pill is-low">
                {result.graded.filter((entry) => entry.grade === 'incorrect' || entry.grade === 'unanswered').length} to
                learn
              </span>
            </div>
          </div>
        </section>

        <section className="topics-card">
          <div className="card-head">
            <h2>By topic</h2>
            <span className="meta-muted">Where the marks went</span>
          </div>
          <div className="topic-bars">
            {result.byTopic.map((topic) => (
              <div className="topic-bar" key={topic.topic}>
                <div className="topic-bar-head">
                  <span className="topic-bar-name">{topic.topic}</span>
                  <span className={`topic-bar-score${topic.percent >= 75 ? ' is-good' : topic.percent >= 50 ? ' is-mid' : ' is-low'}`}>
                    {formatPercent(topic.percent)}
                  </span>
                </div>
                <div className="topic-bar-track">
                  <span
                    className={`topic-bar-fill${topic.percent >= 75 ? ' is-good' : topic.percent >= 50 ? ' is-mid' : ' is-low'}`}
                    style={{ width: `${Math.max(4, topic.percent)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {result.gradingNote ? (
        <div className="note-strip">
          <IconLightbulb size={16} />
          <span>{result.gradingNote}</span>
        </div>
      ) : null}

      <section className="lesson-cta">
        <div className="lesson-cta-main">
          <span className="lesson-cta-icon">
            <IconBook size={22} />
          </span>
          <div>
            <h2>{result.weakTopics.length ? 'Learn what you missed' : 'One lesson, going deeper'}</h2>
            <p>
              Written lessons for{' '}
              <strong>{lessonTopics.slice(0, 4).join(', ')}</strong>. Each one targets the questions you missed and
              explains the reasoning from the ground up.
            </p>
            <ul className="lesson-cta-topics">
              {lessonTopics.map((topic) => (
                <li key={topic}>
                  <IconTarget size={14} />
                  {topic}
                </li>
              ))}
            </ul>
            {session.lessons.length ? (
              <span className="lesson-cta-progress">
                {readyLessons} of {session.lessons.length} lessons written
                {failedLessons ? ` · ${failedLessons} failed` : ''}
              </span>
            ) : null}
          </div>
        </div>
        <div className="lesson-cta-actions">
          <button type="button" className="primary-button large" onClick={openLessons}>
            {session.lessons.length
              ? readyLessons
                ? 'Open lessons'
                : failedLessons === session.lessons.length
                  ? 'Retry lessons'
                  : 'Watch lessons being written'
              : 'Write my lessons'}
            <IconArrowRight size={18} />
          </button>
          <button type="button" className="ghost-button" onClick={() => void practice()} disabled={practiceBusy}>
            {practiceBusy ? <span className="spinner small" /> : <IconRefresh size={16} />}
            {practiceBusy ? 'Building quiz…' : 'Practice these gaps'}
          </button>
        </div>
      </section>

      {practiceError ? <div className="inline-warning">{practiceError}</div> : null}

      <section className="review-section">
        <div className="review-head">
          <h2>Answer by answer</h2>
          <div className="filter-tabs">
            <button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>
              All {session.quiz.questions.length}
            </button>
            <button
              type="button"
              className={filter === 'missed' ? 'is-active' : ''}
              onClick={() => setFilter('missed')}
            >
              To learn {missedQuestions.length}
            </button>
            <button
              type="button"
              className={filter === 'unanswered' ? 'is-active' : ''}
              onClick={() => setFilter('unanswered')}
            >
              Unknown {blankQuestions.length}
            </button>
          </div>
        </div>

        <div className="review-answers">
          {visibleQuestions.map((question) => {
            const grade = gradedById.get(question.id)
            const chosenId =
              session.answers.find((answer) => answer.questionId === question.id && answer.kind === 'choice')?.choiceId ??
              null
            const written = answerText(session, question)
            const status = grade?.grade ?? 'unanswered'
            return (
              <details className={`answer-item is-${status}`} key={question.id}>
                <summary className="answer-summary">
                  <span className={`answer-status is-${status}`}>
                    {status === 'correct' ? (
                      <IconCheck size={15} />
                    ) : status === 'partial' ? (
                      <IconSpark size={15} />
                    ) : (
                      <IconClose size={15} />
                    )}
                  </span>
                  <span className="answer-summary-copy">
                    <span className="answer-prompt">{question.prompt}</span>
                    <span className="answer-summary-meta">
                      {question.topic} ·{' '}
                      {status === 'correct'
                        ? 'Correct'
                        : status === 'partial'
                          ? 'Partly right'
                          : status === 'unanswered'
                            ? 'Marked unknown'
                            : 'Incorrect'}
                    </span>
                  </span>
                  <span className="answer-marks">
                    {formatScore(grade?.awarded ?? 0)} / 1
                  </span>
                </summary>

                <div className="answer-body">
                  {question.type === 'multiple_choice' ? (
                    <div className="answer-options">
                      {question.options.map((option) => {
                        const isCorrect = option.id === question.answerId
                        const isChosen = option.id === chosenId
                        return (
                          <div
                            key={option.id}
                            className={`answer-option${isCorrect ? ' is-correct' : ''}${isChosen && !isCorrect ? ' is-wrong' : ''}`}
                          >
                            <span className="answer-option-mark">
                              {isCorrect ? <IconCheck size={14} /> : isChosen ? <IconClose size={14} /> : null}
                            </span>
                            <span>{option.text}</span>
                            {isChosen ? <span className="answer-option-tag">your answer</span> : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="written-answers">
                      <div className="written-row">
                        <span className="written-label">Your answer</span>
                        <p className={written ? '' : 'is-empty'}>{written || 'Left blank — marked as unknown.'}</p>
                      </div>
                      <div className="written-row">
                        <span className="written-label">Model answer</span>
                        <p>{correctAnswerText(question)}</p>
                      </div>
                    </div>
                  )}

                  {grade?.feedback ? (
                    <div className="answer-feedback">
                      <span className="answer-feedback-label">
                        {status === 'correct' ? 'What was good' : 'The gap'}
                      </span>
                      <p>{grade.feedback}</p>
                    </div>
                  ) : null}

                  {question.explanation ? (
                    <div className="answer-explanation">
                      <span className="answer-explanation-label">Why</span>
                      <p>{question.explanation}</p>
                    </div>
                  ) : null}
                </div>
              </details>
            )
          })}
          {visibleQuestions.length === 0 ? (
            <div className="empty-inline">Nothing here — that filter is empty.</div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
