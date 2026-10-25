import { contextBridge, ipcRenderer } from 'electron'
import type {
  LearnerApi,
  LessonEvent,
  ProviderPatch,
  QuizConfig,
  RuntimePlatform,
  ShortAnswerItem
} from '@shared/types'

const platform: RuntimePlatform =
  process.platform === 'darwin'
    ? 'mac'
    : process.platform === 'win32'
      ? 'windows'
      : process.platform === 'linux'
        ? 'linux'
        : 'other'

const api: LearnerApi = {
  platform,
  getState: () => ipcRenderer.invoke('state:get'),
  saveSettings: (patch: ProviderPatch) => ipcRenderer.invoke('settings:save', patch),
  providerStatus: () => ipcRenderer.invoke('provider:status'),
  testProvider: () => ipcRenderer.invoke('provider:test'),
  listModels: () => ipcRenderer.invoke('provider:models'),
  suggestTopics: (subject: string, notes?: string) => ipcRenderer.invoke('ai:topics', subject, notes),
  generateQuiz: (config: QuizConfig) => ipcRenderer.invoke('ai:quiz', config),
  gradeAnswers: (subject: string, items: ShortAnswerItem[]) => ipcRenderer.invoke('ai:grade', subject, items),
  generateLesson: (request) => ipcRenderer.invoke('ai:lesson', request),
  cancel: (requestId: string) => ipcRenderer.invoke('ai:cancel', requestId),
  saveSession: (session) => ipcRenderer.invoke('session:save', session),
  deleteSession: (id: string) => ipcRenderer.invoke('session:delete', id),
  revealDataFile: () => ipcRenderer.invoke('data:reveal'),
  onLessonEvent: (listener: (event: LessonEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: LessonEvent): void => listener(payload)
    ipcRenderer.on('lesson:event', handler)
    return () => {
      ipcRenderer.removeListener('lesson:event', handler)
    }
  },
  onNavigate: (listener: (target: 'home' | 'settings') => void) => {
    const handler = (_event: Electron.IpcRendererEvent, target: 'home' | 'settings'): void => listener(target)
    ipcRenderer.on('nav:go', handler)
    return () => {
      ipcRenderer.removeListener('nav:go', handler)
    }
  }
}

contextBridge.exposeInMainWorld('learner', api)
