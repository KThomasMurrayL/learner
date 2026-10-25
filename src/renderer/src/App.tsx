import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@shared/types'
import { Sidebar } from './components/Sidebar'
import type { NavKey } from './components/Sidebar'
import { Toaster } from './components/Toaster'
import { IconAlert, IconLogo } from './components/Icons'
import { HomeScreen } from './screens/HomeScreen'
import { QuizScreen } from './screens/QuizScreen'
import { ResultsScreen } from './screens/ResultsScreen'
import { LessonsScreen } from './screens/LessonsScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { AppProvider, useApp } from './state/AppContext'
import { api } from './lib/api'

type View =
  | { name: 'home' }
  | { name: 'quiz'; sessionId: string }
  | { name: 'results'; sessionId: string }
  | { name: 'lessons'; sessionId: string; lessonId?: string }
  | { name: 'library' }
  | { name: 'settings' }

function Shell() {
  const { loading, bootError, getSession, touchSession, sessions } = useApp()
  const [view, setView] = useState<View>({ name: 'home' })

  const sessionId = 'sessionId' in view ? view.sessionId : null
  const session = sessionId ? getSession(sessionId) : undefined

  useEffect(() => {
    return api.onNavigate((target) => {
      setView(target === 'home' ? { name: 'home' } : { name: 'settings' })
    })
  }, [])

  useEffect(() => {
    if (!sessionId || loading) return
    if (!getSession(sessionId)) setView({ name: 'home' })
  }, [sessionId, loading, sessions, getSession])

  useEffect(() => {
    if (session) document.title = `${session.quiz.subject} · Learner`
    else document.title = 'Learner'
  }, [session])

  useEffect(() => {
    document.querySelector('.main')?.scrollTo({ top: 0 })
  }, [view.name, sessionId])

  const openSession = (id: string) => {
    touchSession(id)
    const found = getSession(id)
    if (!found) return
    if (!found.completedAt) setView({ name: 'quiz', sessionId: id })
    else setView({ name: 'results', sessionId: id })
  }

  const startQuiz = (quizSession: Session) => setView({ name: 'quiz', sessionId: quizSession.id })

  const navActive: NavKey | 'session' = useMemo(() => {
    if (view.name === 'library') return 'library'
    if (view.name === 'settings') return 'settings'
    return 'home'
  }, [view.name])

  if (loading) {
    return (
      <div className="splash">
        <span className="splash-mark">
          <IconLogo size={40} />
        </span>
        <span className="splash-name">Learner</span>
        <span className="splash-bar">
          <span />
        </span>
      </div>
    )
  }

  if (bootError) {
    return (
      <div className="splash">
        <span className="splash-error">
          <IconAlert size={22} />
        </span>
        <span className="splash-name">Could not open your data</span>
        <p className="splash-copy">{bootError}</p>
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar
        active={navActive}
        onNavigate={(key) => {
          if (key === 'home') setView({ name: 'home' })
          else if (key === 'library') setView({ name: 'library' })
          else setView({ name: 'settings' })
        }}
        onOpenSession={openSession}
      />

      <main className="main">
        <div className="view" key={`${view.name}-${sessionId ?? ''}`}>
          {view.name === 'home' ? (
            <HomeScreen
              onGenerated={startQuiz}
              onOpenSession={openSession}
              onOpenSettings={() => setView({ name: 'settings' })}
            />
          ) : null}

          {view.name === 'quiz' && session ? (
            <QuizScreen
              session={session}
              onExit={() => setView({ name: 'home' })}
              onFinished={(id) => setView({ name: 'results', sessionId: id })}
            />
          ) : null}

          {view.name === 'results' && session ? (
            <ResultsScreen
              session={session}
              onOpenLessons={() => setView({ name: 'lessons', sessionId: session.id })}
              onStartQuiz={(id) => setView({ name: 'quiz', sessionId: id })}
              onHome={() => setView({ name: 'home' })}
            />
          ) : null}

          {view.name === 'lessons' && session ? (
            <LessonsScreen
              session={session}
              initialLessonId={view.lessonId}
              onBackToResults={() => setView({ name: 'results', sessionId: session.id })}
              onHome={() => setView({ name: 'home' })}
            />
          ) : null}

          {view.name === 'library' ? (
            <LibraryScreen onOpenSession={openSession} onHome={() => setView({ name: 'home' })} />
          ) : null}

          {view.name === 'settings' ? <SettingsScreen /> : null}
        </div>
      </main>

      <Toaster />
    </div>
  )
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
