import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { ReactNode } from 'react'
import type {
  AppSettings,
  Lesson,
  ProviderPatch,
  ProviderStatus,
  Quiz,
  Session
} from '@shared/types'
import { api, errorMessage } from '../lib/api'
import { buildLessonPlan, collectMisses, extractLessonTitle } from '../lib/grading'

export type ToastTone = 'info' | 'success' | 'error'
export interface Toast {
  id: number
  message: string
  tone: ToastTone
}

interface AppContextValue {
  loading: boolean
  bootError: string | null
  settings: AppSettings
  sessions: Session[]
  providerStatus: ProviderStatus | null
  dataPath: string
  version: string
  toasts: Toast[]
  toast: (message: string, tone?: ToastTone) => void
  dismissToast: (id: number) => void
  updateSettings: (patch: ProviderPatch) => Promise<void>
  refreshProviderStatus: () => Promise<void>
  createSession: (quiz: Quiz) => Session
  patchSession: (id: string, updater: (session: Session) => Session, persist?: boolean) => void
  getSession: (id: string) => Session | undefined
  deleteSession: (id: string) => Promise<void>
  touchSession: (id: string) => void
  startLessons: (sessionId: string) => Promise<void>
  retryLesson: (sessionId: string, lessonId: string) => Promise<void>
  setLessonRead: (sessionId: string, lessonId: string, read: boolean) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside AppProvider')
  return value
}

const newId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings>({
    provider: {
      kind: 'cli',
      model: '',
      baseUrl: 'https://api.openai.com/v1',
      cliKind: 'claude',
      cliModel: '',
      hasKey: false,
      keyHint: ''
    },
    theme: 'system'
  })
  const [sessions, setSessions] = useState<Session[]>([])
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null)
  const [dataPath, setDataPath] = useState('')
  const [version, setVersion] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  const sessionsRef = useRef<Session[]>([])
  const handlersRef = useRef(new Map<string, (text: string) => void>())
  const runningRef = useRef(new Set<string>())
  const planRunningRef = useRef(new Set<string>())
  const persistTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const lessonRequestRef = useRef(new Map<string, string>())

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current.slice(-2), { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((entry) => entry.id !== id))
    }, tone === 'error' ? 8000 : 4500)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const setSessionsSafe = useCallback((next: Session[]) => {
    sessionsRef.current = next
    setSessions(next)
  }, [])

  const persistNow = useCallback((id: string) => {
    const timer = persistTimers.current.get(id)
    if (timer) clearTimeout(timer)
    persistTimers.current.delete(id)
    const session = sessionsRef.current.find((entry) => entry.id === id)
    if (session) void api.saveSession(session)
  }, [])

  const schedulePersist = useCallback(
    (id: string, delay = 500) => {
      const existing = persistTimers.current.get(id)
      if (existing) clearTimeout(existing)
      const timer = setTimeout(() => {
        persistTimers.current.delete(id)
        const session = sessionsRef.current.find((entry) => entry.id === id)
        if (session) void api.saveSession(session)
      }, delay)
      persistTimers.current.set(id, timer)
    },
    []
  )

  const patchSession = useCallback(
    (id: string, updater: (session: Session) => Session, persist = true) => {
      const next = sessionsRef.current.map((session) => (session.id === id ? updater(session) : session))
      setSessionsSafe(next)
      if (persist) schedulePersist(id)
    },
    [schedulePersist, setSessionsSafe]
  )

  const createSession = useCallback(
    (quiz: Quiz): Session => {
      const session: Session = {
        id: newId('ses'),
        quiz,
        answers: [],
        result: null,
        lessons: [],
        createdAt: Date.now(),
        completedAt: null,
        lastOpenedAt: Date.now()
      }
      setSessionsSafe([session, ...sessionsRef.current])
      schedulePersist(session.id, 0)
      return session
    },
    [schedulePersist, setSessionsSafe]
  )

  const getSession = useCallback((id: string) => sessionsRef.current.find((session) => session.id === id), [])

  const touchSession = useCallback(
    (id: string) => {
      const session = sessionsRef.current.find((entry) => entry.id === id)
      if (!session) return
      if (Date.now() - session.lastOpenedAt < 60_000) return
      patchSession(id, (entry) => ({ ...entry, lastOpenedAt: Date.now() }), false)
    },
    [patchSession]
  )

  const deleteSession = useCallback(
    async (id: string) => {
      for (const [lessonId, requestId] of lessonRequestRef.current) {
        if (lessonId.startsWith(`${id}:`)) {
          void api.cancel(requestId)
          lessonRequestRef.current.delete(lessonId)
        }
      }
      const timer = persistTimers.current.get(id)
      if (timer) clearTimeout(timer)
      persistTimers.current.delete(id)
      setSessionsSafe(sessionsRef.current.filter((session) => session.id !== id))
      await api.deleteSession(id)
    },
    [setSessionsSafe]
  )

  const updateSettings = useCallback(
    async (patch: ProviderPatch) => {
      const next = await api.saveSettings(patch)
      setSettings(next.settings)
      const status = await api.providerStatus()
      setProviderStatus(status)
    },
    []
  )

  const refreshProviderStatus = useCallback(async () => {
    try {
      setProviderStatus(await api.providerStatus())
    } catch {
      setProviderStatus(null)
    }
  }, [])

  const runLesson = useCallback(
    async (sessionId: string, lesson: Lesson) => {
      if (runningRef.current.has(lesson.id)) return
      const session = sessionsRef.current.find((entry) => entry.id === sessionId)
      if (!session) return
      runningRef.current.add(lesson.id)

      const requestId = `${lesson.id}_${Date.now().toString(36)}`
      lessonRequestRef.current.set(`${sessionId}:${lesson.id}`, requestId)
      let buffer = ''
      let paintTimer: number | null = null

      const paint = (): void => {
        paintTimer = null
        if (!buffer) return
        const snapshot = buffer
        patchSession(
          sessionId,
          (current) => ({
            ...current,
            lessons: current.lessons.map((entry) =>
              entry.id === lesson.id ? { ...entry, markdown: snapshot } : entry
            )
          }),
          false
        )
      }

      handlersRef.current.set(requestId, (text) => {
        buffer += text
        if (paintTimer === null) paintTimer = window.setTimeout(paint, 90)
      })

      patchSession(
        sessionId,
        (current) => ({
          ...current,
          lessons: current.lessons.map((entry) =>
            entry.id === lesson.id
              ? { ...entry, status: 'streaming', markdown: '', error: undefined }
              : entry
          )
        }),
        false
      )

      try {
        const { markdown } = await api.generateLesson({
          requestId,
          subject: session.quiz.subject,
          topic: lesson.topic,
          difficulty: session.quiz.difficulty,
          misses: collectMisses(session, lesson.topic).slice(0, 6)
        })
        if (paintTimer !== null) window.clearTimeout(paintTimer)
        patchSession(
          sessionId,
          (current) => ({
            ...current,
            lessons: current.lessons.map((entry) =>
              entry.id === lesson.id
                ? {
                    ...entry,
                    status: 'ready',
                    markdown,
                    title: extractLessonTitle(markdown, lesson.topic),
                    error: undefined
                  }
                : entry
            )
          }),
          false
        )
        schedulePersist(sessionId, 200)
      } catch (error) {
        if (paintTimer !== null) window.clearTimeout(paintTimer)
        const message = errorMessage(error)
        patchSession(
          sessionId,
          (current) => ({
            ...current,
            lessons: current.lessons.map((entry) =>
              entry.id === lesson.id
                ? { ...entry, status: 'error', markdown: buffer || entry.markdown, error: message }
                : entry
            )
          }),
          false
        )
        schedulePersist(sessionId, 200)
        toast(`Could not finish the lesson on “${lesson.topic}”. ${message}`, 'error')
      } finally {
        handlersRef.current.delete(requestId)
        lessonRequestRef.current.delete(`${sessionId}:${lesson.id}`)
        runningRef.current.delete(lesson.id)
      }
    },
    [patchSession, schedulePersist, toast]
  )

  const startLessons = useCallback(
    async (sessionId: string) => {
      if (planRunningRef.current.has(sessionId)) return
      const session = sessionsRef.current.find((entry) => entry.id === sessionId)
      if (!session || !session.result) return
      planRunningRef.current.add(sessionId)

      try {
        if (!session.lessons.length) {
          const plan = buildLessonPlan(session)
          const stubs: Lesson[] = plan.map((item, index) => ({
            id: `les_${Date.now().toString(36)}_${index}`,
            topic: item.topic,
            title: item.topic,
            markdown: '',
            status: 'queued',
            createdAt: Date.now()
          }))
          patchSession(sessionId, (current) => ({ ...current, lessons: stubs }), true)
          await new Promise((resolve) => setTimeout(resolve, 50))
        }

        for (;;) {
          const current = sessionsRef.current.find((entry) => entry.id === sessionId)
          const next = current?.lessons.find((entry) => entry.status === 'queued')
          if (!next) break
          await runLesson(sessionId, next)
        }
        persistNow(sessionId)
      } finally {
        planRunningRef.current.delete(sessionId)
      }
    },
    [patchSession, persistNow, runLesson]
  )

  const retryLesson = useCallback(
    async (sessionId: string, lessonId: string) => {
      const session = sessionsRef.current.find((entry) => entry.id === sessionId)
      const lesson = session?.lessons.find((entry) => entry.id === lessonId)
      if (!session || !lesson) return
      patchSession(
        sessionId,
        (current) => ({
          ...current,
          lessons: current.lessons.map((entry) =>
            entry.id === lessonId
              ? { ...entry, status: 'queued', markdown: '', error: undefined }
              : entry
          )
        }),
        true
      )
      await runLesson(sessionId, { ...lesson, status: 'queued', markdown: '', error: undefined })
    },
    [patchSession, runLesson]
  )

  const setLessonRead = useCallback(
    (sessionId: string, lessonId: string, read: boolean) => {
      patchSession(sessionId, (current) => ({
        ...current,
        lessons: current.lessons.map((entry) =>
          entry.id === lessonId ? { ...entry, completed: read } : entry
        )
      }))
    },
    [patchSession]
  )

  useEffect(() => {
    const unsubscribe = api.onLessonEvent((event) => {
      if (event.type === 'delta') handlersRef.current.get(event.requestId)?.(event.text)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    let cancelled = false
    api
      .getState()
      .then((state) => {
        if (cancelled) return
        setSettings(state.settings)
        setSessionsSafe(state.sessions)
        setDataPath(state.dataPath)
        setVersion(state.version)
        setLoading(false)
        void api.providerStatus().then((status) => {
          if (!cancelled) setProviderStatus(status)
        })
      })
      .catch((error) => {
        if (cancelled) return
        setBootError(errorMessage(error))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [setSessionsSafe])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  useEffect(() => {
    const resolved = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme
    document.documentElement.dataset.theme = resolved
    document.documentElement.dataset.themeMode = resolved
  }, [settings.theme, systemDark])

  useEffect(() => {
    const flush = (): void => {
      for (const id of persistTimers.current.keys()) persistNow(id)
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [persistNow])

  const value = useMemo<AppContextValue>(
    () => ({
      loading,
      bootError,
      settings,
      sessions,
      providerStatus,
      dataPath,
      version,
      toasts,
      toast,
      dismissToast,
      updateSettings,
      refreshProviderStatus,
      createSession,
      patchSession,
      getSession,
      deleteSession,
      touchSession,
      startLessons,
      retryLesson,
      setLessonRead
    }),
    [
      loading,
      bootError,
      settings,
      sessions,
      providerStatus,
      dataPath,
      version,
      toasts,
      toast,
      dismissToast,
      updateSettings,
      refreshProviderStatus,
      createSession,
      patchSession,
      getSession,
      deleteSession,
      touchSession,
      startLessons,
      retryLesson,
      setLessonRead
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
