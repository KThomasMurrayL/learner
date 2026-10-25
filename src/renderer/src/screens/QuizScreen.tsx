import { useEffect, useRef, useState } from 'react'
import type { AnswerRecord, Session } from '@shared/types'
import { api, errorMessage } from '../lib/api'
import { findAnswer, markSession } from '../lib/grading'
import { formatClock } from '../lib/format'
import { useApp } from '../state/AppContext'
import {
  IconAlert,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconClose,
  IconKeyboard,
  IconLightbulb
} from '../components/Icons'

interface QuizScreenProps {
  session: Session
  onExit: () => void
  onFinished: (sessionId: string) => void
}

type AnswerStatus = 'answered' | 'unknown' | 'blank'

export function QuizScreen({ session, onExit, onFinished }: QuizScreenProps) {
  const { patchSession, getSession, startLessons, toast } = useApp()
  const questions = session.quiz.questions
  const total = questions.length
  const [index, setIndex] = useState(() => {
    const first = questions.findIndex((question) => !session.answers.some((answer) => answer.questionId === question.id))
    return first === -1 ? 0 : first
  })
  const [reviewOpen, setReviewOpen] = useState(false)
  const [marking, setMarking] = useState(false)
  const [stage, setStage] = useState('Checking your answers…')
  const startedAt = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  const current = questions[Math.min(index, total - 1)]
  const answer = findAnswer(session, current.id)

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const statusOf = (questionId: string): AnswerStatus => {
    const entry = findAnswer(session, questionId)
    if (!entry) return 'blank'
    if (entry.kind === 'unknown') return 'unknown'
    if (entry.kind === 'text' && !entry.text?.trim()) return 'blank'
    return 'answered'
  }

  const answeredCount = questions.filter((question) => statusOf(question.id) === 'answered').length
  const unknownCount = questions.filter((question) => statusOf(question.id) === 'unknown').length
  const blankCount = total - answeredCount - unknownCount

  const saveAnswer = (next: AnswerRecord) => {
    patchSession(session.id, (entry) => ({
      ...entry,
      answers: [...entry.answers.filter((item) => item.questionId !== next.questionId), next],
      lastOpenedAt: Date.now()
    }))
  }

  const goNext = () => setIndex((value) => Math.min(total - 1, value + 1))
  const goBack = () => setIndex((value) => Math.max(0, value - 1))

  const selectOption = (optionId: string) => {
    saveAnswer({ questionId: current.id, kind: 'choice', choiceId: optionId })
    if (index < total - 1) {
      const at = index
      window.setTimeout(() => setIndex((value) => (value === at ? at + 1 : value)), 270)
    }
  }

  const markUnknown = () => {
    saveAnswer({ questionId: current.id, kind: 'unknown' })
    if (index < total - 1) goNext()
  }

  const canAdvance = Boolean(answer) && (answer?.kind !== 'text' || Boolean(answer.text?.trim()))

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName ?? ''
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (typing || reviewOpen || marking) return

      if (tag === 'BUTTON' && event.key === 'Enter') return

      if (current.type === 'multiple_choice' && /^[1-4]$/.test(event.key)) {
        const option = current.options[Number(event.key) - 1]
        if (option) selectOption(option.id)
        return
      }
      if (event.key.toLowerCase() === 'u') {
        markUnknown()
        return
      }
      if (event.key === 'ArrowRight') {
        if (canAdvance) goNext()
        return
      }
      if (event.key === 'ArrowLeft') {
        goBack()
        return
      }
      if (event.key === 'Enter' && canAdvance) {
        if (index === total - 1) setReviewOpen(true)
        else goNext()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  useEffect(() => {
    if (!reviewOpen) return
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setReviewOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [reviewOpen])

  const finish = async () => {
    setReviewOpen(false)
    setMarking(true)
    setStage('Checking your answers…')
    try {
      const result = await markSession(session, setStage)
      patchSession(
        session.id,
        (entry) => ({
          ...entry,
          result,
          completedAt: Date.now(),
          lastOpenedAt: Date.now()
        }),
        false
      )
      const updated = getSession(session.id)
      if (updated) await api.saveSession(updated)
      void startLessons(session.id)
      onFinished(session.id)
    } catch (error) {
      toast(errorMessage(error), 'error')
      setMarking(false)
    }
  }

  return (
    <div className="screen quiz-screen">
      <header className="quiz-top">
        <button type="button" className="text-button" onClick={onExit}>
          <IconClose size={16} />
          Save & exit
        </button>
        <div className="quiz-progress-block">
          <span className="quiz-progress-label">
            Question {index + 1} of {total}
          </span>
          <span className="quiz-progress-track">
            <span style={{ width: `${(answeredCount / Math.max(1, total)) * 100}%` }} />
          </span>
        </div>
        <div className="quiz-timer">
          <span className="dot-pulse" />
          {formatClock(elapsed)}
        </div>
      </header>

      <div className="quiz-body">
        <div className="quiz-subject-line">
          <span>{session.quiz.subject}</span>
          <span className="quiz-subject-sep">/</span>
          <span className="quiz-answered">
            {answeredCount} answered{unknownCount ? ` · ${unknownCount} marked unknown` : ''}
            {blankCount ? ` · ${blankCount} left` : ''}
          </span>
        </div>

        <article className="quiz-card" key={current.id}>
          <div className="quiz-card-meta">
            <span className="topic-pill">{current.topic}</span>
            <span className="meta-muted">
              {current.type === 'multiple_choice' ? 'Multiple choice' : 'Written answer'}
            </span>
            <span className="meta-muted">{current.difficulty}</span>
          </div>

          <h1 className="quiz-question">{current.prompt}</h1>

          {current.type === 'multiple_choice' ? (
            <div className="option-list" role="radiogroup" aria-label="Answer options">
              {current.options.map((option, optionIndex) => {
                const chosen = answer?.kind === 'choice' && answer.choiceId === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    className={`option${chosen ? ' is-chosen' : ''}`}
                    onClick={() => selectOption(option.id)}
                  >
                    <span className="option-key">{String.fromCharCode(65 + optionIndex)}</span>
                    <span className="option-text">{option.text}</span>
                    <span className="option-mark">{chosen ? <IconCheck size={16} /> : null}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="written-block">
              <textarea
                className="text-area answer-area"
                value={answer?.kind === 'text' ? answer.text ?? '' : ''}
                onChange={(event) =>
                  saveAnswer({ questionId: current.id, kind: 'text', text: event.target.value })
                }
                placeholder="Answer in your own words…"
                rows={6}
                maxLength={2000}
              />
              <p className="field-hint">
                A sentence or two is enough. It is marked on meaning, not spelling.
              </p>
            </div>
          )}

          {answer?.kind === 'unknown' ? (
            <div className="unknown-banner">
              <IconLightbulb size={17} />
              <span>
                Marked as <strong>“I don’t know”</strong>. Nothing is guessed, and this topic goes straight into your
                lessons. You can still answer above to change it.
              </span>
            </div>
          ) : null}

          <div className="quiz-actions">
            <button
              type="button"
              className={`unknown-button${answer?.kind === 'unknown' ? ' is-active' : ''}`}
              onClick={markUnknown}
            >
              <IconLightbulb size={17} />
              I don’t know this
              <kbd>U</kbd>
            </button>

            <div className="quiz-nav-buttons">
              <button type="button" className="ghost-button" onClick={goBack} disabled={index === 0}>
                <IconArrowLeft size={16} />
                Back
              </button>
              {index === total - 1 ? (
                <button type="button" className="primary-button" onClick={() => setReviewOpen(true)}>
                  Review & mark
                  <IconArrowRight size={17} />
                </button>
              ) : (
                <button type="button" className="primary-button" onClick={goNext} disabled={!canAdvance}>
                  Next
                  <IconArrowRight size={17} />
                </button>
              )}
            </div>
          </div>
        </article>

        <div className="quiz-jump">
          <span className="quiz-jump-label">
            <IconKeyboard size={14} />
            <span>
              <kbd>1</kbd>–<kbd>4</kbd> answer · <kbd>U</kbd> don’t know · <kbd>←</kbd>
              <kbd>→</kbd> move
            </span>
          </span>
          <div className="jump-dots">
            {questions.map((question, questionIndex) => {
              const status = statusOf(question.id)
              return (
                <button
                  key={question.id}
                  type="button"
                  className={`jump-dot is-${status}${questionIndex === index ? ' is-current' : ''}`}
                  onClick={() => setIndex(questionIndex)}
                  title={`Question ${questionIndex + 1}: ${status}`}
                >
                  {questionIndex + 1}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {reviewOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setReviewOpen(false)}>
          <div
            className="modal review-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Review your answers"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2>Ready to mark?</h2>
                <p>
                  {answeredCount} answered · {unknownCount} marked unknown · {blankCount} left blank
                </p>
              </div>
              <button type="button" className="icon-button" onClick={() => setReviewOpen(false)} aria-label="Close">
                <IconClose size={18} />
              </button>
            </div>

            <div className="review-list">
              {questions.map((question, questionIndex) => {
                const status = statusOf(question.id)
                return (
                  <button
                    key={question.id}
                    type="button"
                    className="review-row"
                    onClick={() => {
                      setIndex(questionIndex)
                      setReviewOpen(false)
                    }}
                  >
                    <span className={`review-number is-${status}`}>{questionIndex + 1}</span>
                    <span className="review-copy">
                      <span className="review-prompt">{question.prompt}</span>
                      <span className="review-topic">{question.topic}</span>
                    </span>
                    <span className={`review-status is-${status}`}>
                      {status === 'answered' ? 'Answered' : status === 'unknown' ? 'Unknown' : 'Blank'}
                    </span>
                  </button>
                )
              })}
            </div>

            {blankCount + unknownCount > 0 ? (
              <div className="review-note">
                <IconAlert size={16} />
                <span>
                  {blankCount + unknownCount} question{blankCount + unknownCount === 1 ? '' : 's'} will be marked as
                  unanswered and taught in your lessons. That is more useful than a guess.
                </span>
              </div>
            ) : null}

            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setReviewOpen(false)}>
                Keep working
              </button>
              <button type="button" className="primary-button" onClick={() => void finish()}>
                Finish & mark
                <IconArrowRight size={17} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {marking ? (
        <div className="generate-overlay">
          <div className="generate-card marking-card">
            <div className="marking-pulse" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h2>Marking your quiz</h2>
            <p className="generate-phase">{stage}</p>
            <p className="generate-sub">Written answers are read for meaning, not exact wording.</p>
            <div className="marking-steps">
              <span className="is-done">
                <IconCheck size={14} /> Multiple choice checked
              </span>
              <span className="is-active">
                <span className="spinner small" /> Reading your wording
              </span>
              <span>
                <span className="pending-dot" /> Finding the gaps
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
