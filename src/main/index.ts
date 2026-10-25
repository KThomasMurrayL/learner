import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron'
import type { BrowserWindowConstructorOptions, MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import type { LessonRequest, ProviderPatch, QuizConfig, ShortAnswerItem } from '@shared/types'
import {
  generateLesson,
  generateQuiz,
  gradeShortAnswers,
  listModels,
  providerSummary,
  suggestTopics,
  testProvider
} from './ai'
import { AiError } from './ai/core'
import {
  dataFilePath,
  getPublicState,
  getRuntime,
  removeSession,
  saveSettings,
  upsertSession
} from './store'

app.setName('Learner')
const isMac = process.platform === 'darwin'

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
const aborters = new Map<string, AbortController>()

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

function createWindow(): void {
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1280,
    height: 880,
    minWidth: 920,
    minHeight: 620,
    show: false,
    backgroundColor: '#F6F4EF',
    title: 'Learner',
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 18, y: 22 }
        }
      : {
          // Windows and Linux keep their native title bar.
          autoHideMenuBar: true
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  }

  mainWindow = new BrowserWindow(windowOptions)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl && url.startsWith(devUrl)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
  })

  mainWindow.on('closed', () => {
    for (const controller of aborters.values()) controller.abort()
    aborters.clear()
    mainWindow = null
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) mainWindow.loadURL(devUrl)
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

function sendNavigation(target: 'home' | 'settings'): void {
  mainWindow?.webContents.send('nav:go', target)
}

function buildMenu(): void {
  const settingsItem: MenuItemConstructorOptions = {
    label: 'AI provider and app settings',
    accelerator: 'CmdOrCtrl+,',
    click: () => sendNavigation('settings')
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New quiz',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendNavigation('home')
        },
        ...(isMac
          ? []
          : [
              { type: 'separator' as const },
              settingsItem,
              { type: 'separator' as const },
              { role: 'quit' as const }
            ])
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    ...(isMac ? [{ label: 'Settings', submenu: [settingsItem] }] : []),
    ...(isMac ? [{ role: 'windowMenu' as const }] : [])
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

class IpcError extends Error {}

type IpcHandler = (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown

function handle(channel: string, listener: IpcHandler): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await listener(event, ...args)
    } catch (error) {
      const err = error instanceof AiError ? error : error instanceof Error ? error : new Error(String(error))
      const detail = error instanceof AiError && error.detail ? ` ${error.detail}` : ''
      throw new IpcError(`${err.message}${detail}`)
    }
  })
}

function requireText(value: unknown, name: string, max = 400): string {
  if (typeof value !== 'string' || !value.trim()) throw new IpcError(`${name} is required.`)
  return value.trim().slice(0, max)
}

function optionalText(value: unknown, max = 1200): string | undefined {
  return typeof value === 'string' ? value.trim().slice(0, max) : undefined
}

function validateQuizConfig(value: unknown): QuizConfig {
  const config = value as Partial<QuizConfig> | undefined
  if (!config) throw new IpcError('Missing quiz settings.')
  const subject = requireText(config.subject, 'Subject', 240)
  const count = Math.max(1, Math.min(30, Math.round(Number(config.count) || 10)))
  const difficulty = config.difficulty === 'easy' || config.difficulty === 'hard' ? config.difficulty : 'medium'
  const topics = Array.isArray(config.topics)
    ? config.topics.filter((topic): topic is string => typeof topic === 'string' && Boolean(topic.trim())).map((t) => t.trim().slice(0, 160))
    : []
  return { subject, count, difficulty, topics, notes: optionalText(config.notes) }
}

function validateLessonRequest(value: unknown): LessonRequest {
  const request = value as Partial<LessonRequest> | undefined
  if (!request) throw new IpcError('Missing lesson request.')
  const requestId = requireText(request.requestId, 'Request id', 80)
  const subject = requireText(request.subject, 'Subject', 240)
  const topic = requireText(request.topic, 'Topic', 200)
  const difficulty = request.difficulty === 'easy' || request.difficulty === 'hard' ? request.difficulty : 'medium'
  const misses = Array.isArray(request.misses)
    ? request.misses.slice(0, 8).map((miss) => ({
        prompt: String(miss?.prompt ?? '').slice(0, 1200),
        yourAnswer: String(miss?.yourAnswer ?? '').slice(0, 1200),
        correctAnswer: String(miss?.correctAnswer ?? '').slice(0, 1200),
        explanation: String(miss?.explanation ?? '').slice(0, 1200)
      }))
    : []
  return { requestId, subject, topic, difficulty, misses }
}

function validateShortAnswers(value: unknown): ShortAnswerItem[] {
  if (!Array.isArray(value)) throw new IpcError('Missing answers.')
  return value.slice(0, 12).map((item, index) => {
    const entry = item as Partial<ShortAnswerItem>
    return {
      id: typeof entry?.id === 'string' && entry.id ? entry.id : `s${index + 1}`,
      topic: String(entry?.topic ?? '').slice(0, 200),
      prompt: String(entry?.prompt ?? '').slice(0, 2000),
      modelAnswer: String(entry?.modelAnswer ?? '').slice(0, 2000),
      answer: String(entry?.answer ?? '').slice(0, 4000)
    }
  })
}

function registerIpc(): void {
  handle('state:get', () => getPublicState())

  handle('settings:save', (_event, patch: ProviderPatch) => saveSettings(patch ?? {}))

  handle('provider:status', () => providerSummary(getRuntime()))

  handle('provider:test', () => testProvider(getRuntime()))

  handle('provider:models', () => listModels(getRuntime()))

  handle('ai:topics', (_event, subject: unknown, notes: unknown) =>
    suggestTopics(getRuntime(), requireText(subject, 'Subject', 240), optionalText(notes, 600))
  )

  handle('ai:quiz', (_event, config: unknown) => generateQuiz(getRuntime(), validateQuizConfig(config)))

  handle('ai:grade', (_event, subject: unknown, items: unknown) =>
    gradeShortAnswers(getRuntime(), requireText(subject, 'Subject', 240), validateShortAnswers(items))
  )

  handle('ai:lesson', async (event, request: unknown) => {
    const lesson = validateLessonRequest(request)
    const controller = new AbortController()
    aborters.set(lesson.requestId, controller)
    try {
      const markdown = await generateLesson(getRuntime(), lesson, controller.signal, (text) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('lesson:event', { type: 'delta', requestId: lesson.requestId, text })
        }
      })
      return { markdown }
    } finally {
      aborters.delete(lesson.requestId)
    }
  })

  handle('ai:cancel', (_event, requestId: unknown) => {
    if (typeof requestId !== 'string') return
    aborters.get(requestId)?.abort()
    aborters.delete(requestId)
  })

  handle('session:save', (_event, session: unknown) => {
    if (!session || typeof session !== 'object' || typeof (session as { id?: unknown }).id !== 'string') {
      throw new IpcError('Invalid session.')
    }
    upsertSession(session as Parameters<typeof upsertSession>[0])
  })

  handle('session:delete', (_event, id: unknown) => {
    if (typeof id === 'string') removeSession(id)
  })

  handle('data:reveal', () => {
    shell.showItemInFolder(dataFilePath())
  })
}

app.whenReady().then(() => {
  if (!singleInstance) return
  if (process.platform === 'win32') app.setAppUserModelId('com.eso.learner')
  registerIpc()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
