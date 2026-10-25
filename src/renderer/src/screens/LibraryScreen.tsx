import { useState } from 'react'
import type { Session } from '@shared/types'
import { useApp } from '../state/AppContext'
import { relativeDay, titleCase } from '../lib/format'
import { IconArrowRight, IconBook, IconCheck, IconClock, IconTrash } from '../components/Icons'

interface LibraryScreenProps {
  onOpenSession: (id: string) => void
  onHome: () => void
}

type Filter = 'all' | 'progress' | 'done'

export function LibraryScreen({ onOpenSession, onHome }: LibraryScreenProps) {
  const { sessions, deleteSession, toast } = useApp()
  const [filter, setFilter] = useState<Filter>('all')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const filtered = sessions.filter((session) => {
    if (filter === 'progress') return !session.completedAt
    if (filter === 'done') return Boolean(session.completedAt)
    return true
  })

  const remove = async (session: Session) => {
    setBusyId(session.id)
    try {
      await deleteSession(session.id)
      toast('Session deleted.', 'success')
    } catch {
      toast('Could not delete that session.', 'error')
    } finally {
      setBusyId(null)
      setConfirmId(null)
    }
  }

  return (
    <div className="screen library-screen">
      <header className="page-head">
        <div>
          <div className="eyebrow">
            <IconBook size={15} />
            Library
          </div>
          <h1>Everything you’ve studied</h1>
          <p className="page-sub">
            {sessions.length
              ? `${sessions.length} ${sessions.length === 1 ? 'quiz' : 'quizzes'} saved on this computer.`
              : 'Saved quizzes and lessons will appear here.'}
          </p>
        </div>
        <button type="button" className="primary-button" onClick={onHome}>
          New quiz
          <IconArrowRight size={16} />
        </button>
      </header>

      {sessions.length > 0 ? (
        <div className="filter-tabs library-tabs">
          <button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>
            All {sessions.length}
          </button>
          <button
            type="button"
            className={filter === 'progress' ? 'is-active' : ''}
            onClick={() => setFilter('progress')}
          >
            In progress {sessions.filter((session) => !session.completedAt).length}
          </button>
          <button type="button" className={filter === 'done' ? 'is-active' : ''} onClick={() => setFilter('done')}>
            Completed {sessions.filter((session) => session.completedAt).length}
          </button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="empty-card library-empty">
          <span className="empty-mark">
            <IconBook size={30} />
          </span>
          <h2>{sessions.length ? 'Nothing in this filter' : 'A blank library, for now'}</h2>
          <p>
            {sessions.length
              ? 'Switch to another filter to see your other sessions.'
              : 'Enter a subject on the Study screen. You will get a quiz, honest marking, and written lessons for the gaps.'}
          </p>
          {sessions.length === 0 ? (
            <button type="button" className="primary-button" onClick={onHome}>
              Create your first quiz
              <IconArrowRight size={16} />
            </button>
          ) : null}
        </div>
      ) : (
        <div className="library-grid">
          {filtered.map((session) => {
            const percent = session.result ? Math.round(session.result.percent) : null
            const answered = session.answers.length
            const readLessons = session.lessons.filter((lesson) => lesson.completed).length
            const readyLessons = session.lessons.filter((lesson) => lesson.status === 'ready').length
            const topics = session.quiz.topics.length ? session.quiz.topics : [session.quiz.subject]
            return (
              <article className="library-card" key={session.id}>
                <button type="button" className="library-open" onClick={() => onOpenSession(session.id)}>
                  <span className="library-top">
                    <span className="library-date">
                      <IconClock size={13} />
                      {relativeDay(session.lastOpenedAt)}
                    </span>
                    {percent !== null ? (
                      <span className={`library-score${percent >= 75 ? ' is-good' : percent >= 50 ? ' is-mid' : ' is-low'}`}>
                        {percent}%
                      </span>
                    ) : (
                      <span className="library-score is-pending">In progress</span>
                    )}
                  </span>

                  <h3 className="library-subject">{session.quiz.subject}</h3>
                  <p className="library-meta">
                    {session.quiz.questions.length} questions · {titleCase(session.quiz.difficulty)}
                  </p>

                  <span className="library-topics">
                    {topics.slice(0, 3).map((topic) => (
                      <span className="chip subtle" key={topic}>
                        {topic}
                      </span>
                    ))}
                    {topics.length > 3 ? <span className="chip subtle">+{topics.length - 3}</span> : null}
                  </span>

                  {session.completedAt ? (
                    <span className="library-lessons">
                      <span className="library-lessons-track">
                        <span
                          style={{
                            width: `${session.lessons.length ? (readLessons / session.lessons.length) * 100 : 0}%`
                          }}
                        />
                      </span>
                      {session.lessons.length
                        ? `${readLessons} of ${session.lessons.length} lessons read`
                        : readyLessons
                          ? 'Lessons ready'
                          : 'Lessons not started'}
                    </span>
                  ) : (
                    <span className="library-lessons">
                      <span className="library-lessons-track">
                        <span
                          style={{
                            width: `${(answered / Math.max(1, session.quiz.questions.length)) * 100}%`
                          }}
                        />
                      </span>
                      {answered} of {session.quiz.questions.length} answered
                    </span>
                  )}
                </button>

                <div className="library-foot">
                  <button type="button" className="text-button subtle" onClick={() => onOpenSession(session.id)}>
                    {session.completedAt ? 'Review session' : 'Continue'}
                    <IconArrowRight size={14} />
                  </button>

                  {confirmId === session.id ? (
                    <span className="delete-confirm">
                      Delete?
                      <button type="button" onClick={() => void remove(session)} disabled={busyId === session.id}>
                        {busyId === session.id ? <span className="spinner small" /> : 'Yes'}
                      </button>
                      <button type="button" onClick={() => setConfirmId(null)}>
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() => setConfirmId(session.id)}
                      aria-label="Delete session"
                      title="Delete session"
                    >
                      <IconTrash size={16} />
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="library-privacy">
        <IconCheck size={14} />
        Every session is stored locally. Nothing is uploaded except the prompts sent to your chosen AI provider.
      </div>
    </div>
  )
}
