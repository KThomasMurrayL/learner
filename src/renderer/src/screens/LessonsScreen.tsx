import { useEffect, useRef, useState } from 'react'
import type { Lesson, Session } from '@shared/types'
import { Markdown } from '../components/Markdown'
import {
  IconAlert,
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconCheck,
  IconRefresh,
  IconSpark
} from '../components/Icons'
import { lessonProgress } from '../lib/grading'
import { formatClock } from '../lib/format'
import { useApp } from '../state/AppContext'

interface LessonsScreenProps {
  session: Session
  initialLessonId?: string
  onBackToResults: () => void
  onHome: () => void
}

function statusLabel(lesson: Lesson): string {
  switch (lesson.status) {
    case 'queued':
      return 'Queued'
    case 'streaming':
      return 'Writing now'
    case 'ready':
      return lesson.completed ? 'Read' : `${Math.max(1, Math.round(lesson.markdown.split(/\s+/).length / 220))} min read`
    case 'error':
      return 'Needs a retry'
  }
}

export function LessonsScreen({ session, initialLessonId, onBackToResults, onHome }: LessonsScreenProps) {
  const { startLessons, retryLesson, setLessonRead } = useApp()
  const [activeId, setActiveId] = useState<string | undefined>(initialLessonId)
  const [confirmRewrite, setConfirmRewrite] = useState(false)
  const [now, setNow] = useState(Date.now())
  const startedRef = useRef(false)
  const writingSince = useRef(new Map<string, number>())

  const lessons = session.lessons
  const active =
    lessons.find((lesson) => lesson.id === activeId) ??
    lessons.find((lesson) => lesson.status === 'ready' && !lesson.completed) ??
    lessons.find((lesson) => lesson.status === 'streaming') ??
    lessons.find((lesson) => lesson.status === 'ready') ??
    lessons[0]

  useEffect(() => {
    if (startedRef.current) return
    if (lessons.length === 0) {
      startedRef.current = true
      void startLessons(session.id)
    }
  }, [lessons.length, session.id, startLessons])

  useEffect(() => {
    setConfirmRewrite(false)
    document.querySelector('.main')?.scrollTo({ top: 0 })
  }, [active?.id])

  useEffect(() => {
    if (active?.status === 'streaming') {
      if (!writingSince.current.has(active.id)) writingSince.current.set(active.id, Date.now())
      const timer = window.setInterval(() => setNow(Date.now()), 1000)
      return () => window.clearInterval(timer)
    }
    if (active) writingSince.current.delete(active.id)
    return undefined
  }, [active?.id, active?.status])

  const writingStarted = active ? writingSince.current.get(active.id) : undefined
  const writingSeconds = writingStarted ? Math.max(0, Math.floor((now - writingStarted) / 1000)) : 0

  const progress = lessonProgress(lessons)
  const activeIndex = active ? lessons.findIndex((lesson) => lesson.id === active.id) : -1
  const nextLesson = lessons.slice(activeIndex + 1).find((lesson) => lesson.status === 'ready')
  const stillWriting = lessons.some((lesson) => lesson.status === 'queued' || lesson.status === 'streaming')

  const goNext = () => {
    if (active) setLessonRead(session.id, active.id, true)
    if (nextLesson) setActiveId(nextLesson.id)
    else if (stillWriting) {
      const pending = lessons.find((lesson) => lesson.status === 'streaming' || lesson.status === 'queued')
      if (pending) setActiveId(pending.id)
    } else {
      onBackToResults()
    }
  }

  const retry = () => {
    if (active) void retryLesson(session.id, active.id)
  }

  return (
    <div className="screen lessons-screen">
      <header className="lessons-head">
        <button type="button" className="text-button" onClick={onBackToResults}>
          <IconArrowLeft size={16} />
          Results
        </button>
        <div className="lessons-head-copy">
          <span className="eyebrow">
            <IconBook size={15} />
            Your lessons
          </span>
          <h1>{session.quiz.subject}</h1>
          <p>
            {progress.done} of {progress.total} read · {progress.ready} written
            {stillWriting ? ' · still writing' : ''}
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={onHome}>
          New quiz
        </button>
      </header>

      <div className="lessons-progress">
        <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
        <span
          className="lessons-progress-written"
          style={{ width: `${progress.total ? (progress.ready / progress.total) * 100 : 0}%` }}
        />
      </div>

      <div className="lesson-layout">
        <aside className="lesson-nav">
          {lessons.length === 0 ? (
            <div className="lesson-nav-empty">
              <span className="spinner small" />
              Planning your lessons…
            </div>
          ) : (
            lessons.map((lesson, index) => {
              const isActive = active?.id === lesson.id
              return (
                <button
                  key={lesson.id}
                  type="button"
                  className={`lesson-nav-item${isActive ? ' is-active' : ''} is-${lesson.status}`}
                  onClick={() => setActiveId(lesson.id)}
                >
                  <span className="lesson-nav-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="lesson-nav-copy">
                    <span className="lesson-nav-title">{lesson.title || lesson.topic}</span>
                    <span className="lesson-nav-status">
                      {lesson.status === 'streaming' ? <span className="dot-pulse" /> : null}
                      {lesson.status === 'ready' ? (
                        lesson.completed ? (
                          <IconCheck size={12} />
                        ) : null
                      ) : null}
                      {statusLabel(lesson)}
                    </span>
                  </span>
                  {lesson.status === 'error' ? <IconAlert size={15} className="lesson-nav-alert" /> : null}
                </button>
              )
            })
          )}
          <div className="lesson-nav-foot">
            <IconSpark size={14} />
            Lessons are written in order of what you missed most.
          </div>
        </aside>

        <article className="lesson-doc">
          {!active ? (
            <div className="lesson-writing">
              <span className="eyebrow">Writing</span>
              <div className="skeleton-reader">
                <span className="skeleton-line shimmer w-70" />
                <span className="skeleton-line shimmer w-90" />
                <span className="skeleton-line shimmer w-80" />
                <span className="skeleton-line shimmer w-60" />
                <span className="skeleton-line shimmer w-85" />
              </div>
              <p className="field-hint">The first lesson is on its way. It appears here as it is written.</p>
            </div>
          ) : (
            <>
              <div className="lesson-doc-head">
                <span className="eyebrow">
                  Lesson {String(activeIndex + 1).padStart(2, '0')} · {active.topic}
                </span>
                {active.status === 'streaming' ? (
                  <span className="writing-chip">
                    <span className="dot-pulse" />
                    Writing{writingSeconds > 2 ? ` · ${formatClock(writingSeconds * 1000)}` : ''}
                  </span>
                ) : active.status === 'queued' ? (
                  <span className="writing-chip is-quiet">Queued</span>
                ) : active.status === 'ready' ? (
                  <span className="writing-chip is-done">
                    <IconCheck size={13} />
                    {active.completed ? 'Read' : 'Ready'}
                  </span>
                ) : (
                  <span className="writing-chip is-error">Stopped</span>
                )}
              </div>

              {active.status === 'error' ? (
                <div className="lesson-error">
                  <IconAlert size={18} />
                  <div>
                    <strong>This lesson stopped partway.</strong>
                    <p>{active.error || 'The generation failed.'}</p>
                  </div>
                  <button type="button" className="ghost-button" onClick={retry}>
                    <IconRefresh size={15} />
                    Try again
                  </button>
                </div>
              ) : null}

              {active.markdown ? (
                <Markdown source={active.markdown} live={active.status === 'streaming'} />
              ) : active.status === 'queued' || active.status === 'streaming' ? (
                <div className="lesson-writing">
                  <h1 className="lesson-wait-title">Writing “{active.topic}”…</h1>
                  <p className="lesson-wait-copy">
                    Pulling the missed questions apart, then rebuilding the idea from the ground up. Text appears as it
                    is written.{' '}
                    {writingSeconds > 2 ? `Writing for ${formatClock(writingSeconds * 1000)}.` : ''}
                  </p>
                  <div className="skeleton-reader">
                    <span className="skeleton-line shimmer w-90" />
                    <span className="skeleton-line shimmer w-75" />
                    <span className="skeleton-line shimmer w-85" />
                    <span className="skeleton-line shimmer w-60" />
                  </div>
                </div>
              ) : (
                <div className="lesson-error">
                  <IconAlert size={18} />
                  <p>This lesson came back empty.</p>
                  <button type="button" className="ghost-button" onClick={retry}>
                    <IconRefresh size={15} />
                    Try again
                  </button>
                </div>
              )}

              {active.status === 'ready' ? (
                <footer className="lesson-footer">
                  <button
                    type="button"
                    className={`read-toggle${active.completed ? ' is-on' : ''}`}
                    onClick={() => setLessonRead(session.id, active.id, !active.completed)}
                  >
                    <span className="read-toggle-box">{active.completed ? <IconCheck size={13} /> : null}</span>
                    {active.completed ? 'Marked as read' : 'Mark as read'}
                  </button>

                  <div className="lesson-footer-actions">
                    {confirmRewrite ? (
                      <span className="rewrite-confirm">
                        Rewrite this lesson?
                        <button type="button" onClick={retry}>
                          Yes, rewrite
                        </button>
                        <button type="button" onClick={() => setConfirmRewrite(false)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="text-button subtle" onClick={() => setConfirmRewrite(true)}>
                        <IconRefresh size={14} />
                        Rewrite
                      </button>
                    )}
                    <button type="button" className="primary-button" onClick={goNext}>
                      {nextLesson ? 'Next lesson' : stillWriting ? 'Next lesson' : 'Back to results'}
                      <IconArrowRight size={16} />
                    </button>
                  </div>
                </footer>
              ) : null}
            </>
          )}
        </article>
      </div>
    </div>
  )
}
