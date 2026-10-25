import { useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, Session, TopicSuggestion } from '@shared/types'
import { api, errorMessage } from '../lib/api'
import { relativeDay } from '../lib/format'
import { useApp } from '../state/AppContext'
import { IconArrowLeft, IconArrowRight, IconBook, IconCheck, IconClock, IconPlus, IconSpark, IconTarget } from '../components/Icons'

interface HomeScreenProps {
  onGenerated: (session: Session) => void
  onOpenSession: (id: string) => void
  onOpenSettings: () => void
}

const EXAMPLES = ['Photosynthesis', 'Linear algebra', 'The Cold War', 'Kubernetes networking', 'Music theory', 'Statistics']
const COUNTS = [5, 10, 15, 20]
const PHASES = [
  'Reading your subject…',
  'Choosing the angles…',
  'Writing the questions…',
  'Balancing the difficulty…',
  'Checking for ambiguity…',
  'Making sure the answers are fair…'
]

export function HomeScreen({ onGenerated, onOpenSession, onOpenSettings }: HomeScreenProps) {
  const { createSession, sessions, providerStatus, settings, toast } = useApp()
  const [step, setStep] = useState<1 | 2>(1)
  const [subject, setSubject] = useState('')
  const [notes, setNotes] = useState('')
  const [suggestions, setSuggestions] = useState<TopicSuggestion[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestError, setSuggestError] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [customTopics, setCustomTopics] = useState<string[]>([])
  const [customInput, setCustomInput] = useState('')
  const [count, setCount] = useState(10)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [phase, setPhase] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [showNotes, setShowNotes] = useState(false)
  const subjectRef = useRef<HTMLInputElement>(null)

  const providerReady = providerStatus?.configured ?? true
  const providerName =
    settings.provider.kind === 'cli'
      ? settings.provider.cliKind === 'opencode'
        ? 'OpenCode'
        : 'Claude Code'
      : settings.provider.kind === 'anthropic'
        ? 'the Claude API'
        : settings.provider.kind === 'demo'
          ? 'demo mode'
          : 'your API provider'

  const recent = useMemo(() => sessions.slice(0, 3), [sessions])

  useEffect(() => {
    subjectRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!generating) return
    setPhase(0)
    const startedAt = Date.now()
    setElapsed(0)
    const phaseTimer = window.setInterval(() => setPhase((current) => (current + 1) % PHASES.length), 4200)
    const clockTimer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => {
      window.clearInterval(phaseTimer)
      window.clearInterval(clockTimer)
    }
  }, [generating])

  const loadSuggestions = async (value: string) => {
    setSuggestLoading(true)
    setSuggestError('')
    setSuggestions([])
    try {
      const topics = await api.suggestTopics(value)
      setSuggestions(topics)
      setSelected(topics.map((topic) => topic.title))
    } catch (error) {
      setSuggestError(errorMessage(error))
    } finally {
      setSuggestLoading(false)
    }
  }

  const start = (value?: string) => {
    const next = (value ?? subject).trim()
    if (next.length < 2) {
      subjectRef.current?.focus()
      return
    }
    setSubject(next)
    setStep(2)
    setGenError('')
    void loadSuggestions(next)
  }

  const addCustomTopic = () => {
    const value = customInput.trim()
    if (!value) return
    if (!customTopics.includes(value)) setCustomTopics((current) => [...current, value])
    if (!selected.includes(value)) setSelected((current) => [...current, value])
    setCustomInput('')
  }

  const toggleTopic = (title: string) => {
    setSelected((current) =>
      current.includes(title) ? current.filter((entry) => entry !== title) : [...current, title]
    )
  }

  const generate = async () => {
    if (generating) return
    setGenerating(true)
    setGenError('')
    const topics = [...selected, ...customTopics.filter((topic) => !selected.includes(topic))]
    try {
      const quiz = await api.generateQuiz({
        subject: subject.trim(),
        topics: [...new Set(topics)].slice(0, 10),
        count,
        difficulty,
        notes: notes.trim() || undefined
      })
      const session = createSession(quiz)
      toast(`Your ${quiz.questions.length}-question quiz is ready.`, 'success')
      onGenerated(session)
    } catch (error) {
      setGenError(errorMessage(error))
      setGenerating(false)
    }
  }

  const allTopics = [...suggestions.map((topic) => topic.title), ...customTopics]

  return (
    <div className="screen home-screen">
      <div className="home-aurora" aria-hidden="true" />

      <header className="home-head">
        <div className="eyebrow">
          <IconSpark size={15} />
          Test first, then learn
        </div>
        <h1>What do you want to understand?</h1>
        <p className="home-sub">
          Put in any subject. Get a short quiz, marked honestly, then written lessons for the gaps it finds.
        </p>
      </header>

      {!providerReady ? (
        <button type="button" className="setup-banner" onClick={onOpenSettings}>
          <span className="setup-icon">!</span>
          <span>
            <strong>AI is not connected yet.</strong> {providerStatus?.detail || 'Choose a provider in Settings.'}
          </span>
          <span className="setup-action">Set up →</span>
        </button>
      ) : null}

      {step === 1 ? (
        <section className="create-card">
          <label className="field-label" htmlFor="subject">
            Subject
          </label>
          <div className="subject-row">
            <input
              id="subject"
              ref={subjectRef}
              className="subject-input"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') start()
              }}
              placeholder="e.g. Photosynthesis, the Cold War, SQL joins…"
              maxLength={240}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className="primary-button" onClick={() => start()} disabled={subject.trim().length < 2}>
              Continue
              <IconArrowRight size={17} />
            </button>
          </div>

          <div className="example-row">
            <span className="example-label">Try</span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className="example-chip"
                onClick={() => {
                  setSubject(example)
                  start(example)
                }}
              >
                {example}
              </button>
            ))}
          </div>

          <div className="how-strip">
            <div className="how-step">
              <span className="how-number">1</span>
              <div>
                <strong>Quiz</strong>
                <span>Questions built around your topic.</span>
              </div>
            </div>
            <div className="how-step">
              <span className="how-number">2</span>
              <div>
                <strong>Marking</strong>
                <span>Wrong and unknown answers both count as signal.</span>
              </div>
            </div>
            <div className="how-step">
              <span className="how-number">3</span>
              <div>
                <strong>Lessons</strong>
                <span>Written teaching for exactly what you missed.</span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="create-card step-two">
          <div className="step-two-head">
            <button type="button" className="text-button" onClick={() => setStep(1)}>
              <IconArrowLeft size={15} />
              Change subject
            </button>
            <span className="step-subject">{subject}</span>
          </div>

          <div className="field-block">
            <div className="field-heading">
              <label className="field-label">What should the quiz cover?</label>
              {suggestions.length > 0 ? (
                <button
                  type="button"
                  className="text-button subtle"
                  onClick={() => void loadSuggestions(subject)}
                  disabled={suggestLoading}
                >
                  <IconSpark size={14} />
                  Suggest again
                </button>
              ) : null}
            </div>

            {suggestLoading ? (
              <div className="topic-grid">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <div className="topic-skeleton shimmer" key={index} />
                ))}
              </div>
            ) : (
              <div className="topic-grid">
                {allTopics.map((topic) => {
                  const suggestion = suggestions.find((entry) => entry.title === topic)
                  const isSelected = selected.includes(topic)
                  return (
                    <button
                      key={topic}
                      type="button"
                      className={`topic-card${isSelected ? ' is-selected' : ''}`}
                      onClick={() => toggleTopic(topic)}
                    >
                      <span className="topic-check">{isSelected ? <IconCheck size={13} /> : null}</span>
                      <span className="topic-copy">
                        <span className="topic-title">{topic}</span>
                        {suggestion?.blurb ? <span className="topic-blurb">{suggestion.blurb}</span> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {suggestError ? (
              <div className="inline-warning">
                Could not suggest topics. {suggestError} You can type your own below.
              </div>
            ) : null}

            <div className="custom-topic-row">
              <input
                className="text-input"
                value={customInput}
                onChange={(event) => setCustomInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addCustomTopic()
                }}
                placeholder="Add your own topic…"
                maxLength={120}
              />
              <button type="button" className="ghost-button" onClick={addCustomTopic} disabled={!customInput.trim()}>
                <IconPlus size={15} />
                Add
              </button>
            </div>
            {selected.length === 0 ? (
              <p className="field-hint">Nothing selected means the whole subject — the AI will choose the angles.</p>
            ) : null}
          </div>

          <div className="choice-grid">
            <div className="choice-block">
              <span className="field-label">Questions</span>
              <div className="segmented">
                {COUNTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={count === value ? 'is-active' : ''}
                    onClick={() => setCount(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div className="choice-block">
              <span className="field-label">Difficulty</span>
              <div className="segmented">
                {(['easy', 'medium', 'hard'] as Difficulty[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={difficulty === value ? 'is-active' : ''}
                    onClick={() => setDifficulty(value)}
                  >
                    {value === 'easy' ? 'Gentle' : value === 'medium' ? 'Standard' : 'Challenging'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="notes-block">
            <button type="button" className="text-button subtle" onClick={() => setShowNotes((current) => !current)}>
              {showNotes ? '−' : '+'} Add context (optional)
            </button>
            {showNotes ? (
              <textarea
                className="text-area small"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Level, exam, what you already know, anything you keep getting wrong…"
                rows={3}
                maxLength={1200}
              />
            ) : null}
          </div>

          {genError ? (
            <div className="error-card">
              <strong>Could not build the quiz.</strong>
              <p>{genError}</p>
              <div className="error-actions">
                <button type="button" className="ghost-button" onClick={onOpenSettings}>
                  Open settings
                </button>
                <button type="button" className="ghost-button" onClick={() => void generate()}>
                  Try again
                </button>
              </div>
            </div>
          ) : null}

          <div className="step-two-foot">
            <span className="foot-summary">
              <IconBook size={15} />
              {count} questions · {selected.length || allTopics.length || 1} topics ·{' '}
              {difficulty === 'easy' ? 'gentle' : difficulty === 'medium' ? 'standard' : 'challenging'}
            </span>
            <button type="button" className="primary-button" onClick={() => void generate()} disabled={generating}>
              {generating ? 'Building quiz…' : 'Generate quiz'}
              {!generating ? <IconArrowRight size={17} /> : null}
            </button>
          </div>
        </section>
      )}

      {recent.length > 0 ? (
        <section className="recent-section">
          <div className="section-heading">
            <h2>Pick up where you left off</h2>
            <button type="button" className="text-button subtle" onClick={() => onOpenSession(recent[0].id)}>
              Most recent
            </button>
          </div>
          <div className="recent-grid">
            {recent.map((session) => {
              const percent = session.result?.percent ?? null
              const answered = session.answers.filter((answer) => answer.kind !== 'unknown').length
              return (
                <button
                  type="button"
                  key={session.id}
                  className="recent-card"
                  onClick={() => onOpenSession(session.id)}
                >
                  <span className="recent-top">
                    <span className="recent-date">
                      <IconClock size={13} />
                      {relativeDay(session.lastOpenedAt)}
                    </span>
                    {percent !== null ? (
                      <span className={`mini-score${percent >= 75 ? ' is-good' : percent >= 50 ? ' is-mid' : ' is-low'}`}>
                        {Math.round(percent)}%
                      </span>
                    ) : (
                      <span className="mini-score is-pending">In progress</span>
                    )}
                  </span>
                  <span className="recent-subject">{session.quiz.subject}</span>
                  <span className="recent-meta">
                    {session.completedAt ? (
                      <>
                        {session.lessons.length
                          ? `${session.lessons.filter((lesson) => lesson.completed).length}/${session.lessons.length} lessons read`
                          : `${session.quiz.questions.length} questions`}
                      </>
                    ) : (
                      <>
                        {answered}/{session.quiz.questions.length} answered
                      </>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      <footer className="home-foot">
        <span>
          <IconTarget size={14} /> Not answering is a valid answer. It tells the app what to teach.
        </span>
        <span className="home-foot-provider">Using {providerName}</span>
      </footer>

      {generating ? (
        <div className="generate-overlay">
          <div className="generate-card">
            <div className="generate-orb" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h2>Building your quiz</h2>
            <p className="generate-phase">{PHASES[phase]}</p>
            <p className="generate-sub">
              {count} questions on “{subject}”. This usually takes 15–45 seconds.
            </p>
            {elapsed > 0 ? <p className="generate-elapsed">{elapsed}s elapsed</p> : null}
            <div className="generate-lines" aria-hidden="true">
              <span className="shimmer" />
              <span className="shimmer" />
              <span className="shimmer" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
