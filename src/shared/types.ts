export type Difficulty = 'easy' | 'medium' | 'hard'
export type QuestionType = 'multiple_choice' | 'short_answer'

export interface QuizOption {
  id: string
  text: string
}

export interface QuizQuestion {
  id: string
  topic: string
  type: QuestionType
  difficulty: Difficulty
  prompt: string
  options: QuizOption[]
  answerId: string | null
  modelAnswer: string
  explanation: string
}

export interface TopicSuggestion {
  title: string
  blurb: string
}

export interface QuizConfig {
  subject: string
  topics: string[]
  count: number
  difficulty: Difficulty
  notes?: string
}

export interface Quiz {
  id: string
  subject: string
  topics: string[]
  difficulty: Difficulty
  createdAt: number
  questions: QuizQuestion[]
}

export type AnswerKind = 'choice' | 'text' | 'unknown'

export interface AnswerRecord {
  questionId: string
  kind: AnswerKind
  choiceId?: string
  text?: string
}

export type Grade = 'correct' | 'partial' | 'incorrect' | 'unanswered'

export interface GradedQuestion {
  questionId: string
  grade: Grade
  awarded: number
  feedback: string
}

export interface TopicScore {
  topic: string
  awarded: number
  possible: number
  missed: number
  percent: number
}

export interface QuizResult {
  score: number
  possible: number
  percent: number
  graded: GradedQuestion[]
  byTopic: TopicScore[]
  weakTopics: string[]
  gradedAt: number
  gradingNote?: string
}

export type LessonStatus = 'queued' | 'streaming' | 'ready' | 'error'

export interface Lesson {
  id: string
  topic: string
  title: string
  markdown: string
  status: LessonStatus
  error?: string
  completed?: boolean
  createdAt: number
}

export interface Session {
  id: string
  quiz: Quiz
  answers: AnswerRecord[]
  result: QuizResult | null
  lessons: Lesson[]
  createdAt: number
  completedAt: number | null
  lastOpenedAt: number
}

export type ProviderKind = 'cli' | 'anthropic' | 'openai' | 'demo'
export type CliKind = 'claude' | 'opencode'

export interface ProviderSettings {
  kind: ProviderKind
  model: string
  baseUrl: string
  cliKind: CliKind
  cliModel: string
  hasKey: boolean
  keyHint: string
}

export type ThemeMode = 'light' | 'dark' | 'system'

export interface AppSettings {
  provider: ProviderSettings
  theme: ThemeMode
}

export interface AppState {
  settings: AppSettings
  sessions: Session[]
  dataPath: string
  version: string
}

export interface ProviderStatus {
  configured: boolean
  summary: string
  detail: string
}

export interface TestResult {
  ok: boolean
  detail: string
  ms?: number
}

export interface ShortAnswerItem {
  id: string
  topic: string
  prompt: string
  modelAnswer: string
  answer: string
}

export interface ShortAnswerGrade {
  id: string
  grade: Exclude<Grade, 'unanswered'>
  feedback: string
}

export interface LessonRequest {
  requestId: string
  subject: string
  topic: string
  difficulty: Difficulty
  misses: Array<{
    prompt: string
    yourAnswer: string
    correctAnswer: string
    explanation: string
  }>
}

export type LessonEvent =
  | { type: 'start'; requestId: string }
  | { type: 'delta'; requestId: string; text: string }
  | { type: 'done'; requestId: string; markdown: string }
  | { type: 'error'; requestId: string; message: string }

export type ProviderPatch = Partial<
  Pick<ProviderSettings, 'kind' | 'model' | 'baseUrl' | 'cliKind' | 'cliModel'>
> & { apiKey?: string | null; theme?: ThemeMode }

export interface LearnerApi {
  getState: () => Promise<AppState>
  saveSettings: (patch: ProviderPatch) => Promise<AppState>
  providerStatus: () => Promise<ProviderStatus>
  testProvider: () => Promise<TestResult>
  listModels: () => Promise<string[]>
  suggestTopics: (subject: string, notes?: string) => Promise<TopicSuggestion[]>
  generateQuiz: (config: QuizConfig) => Promise<Quiz>
  gradeAnswers: (subject: string, items: ShortAnswerItem[]) => Promise<ShortAnswerGrade[]>
  generateLesson: (request: LessonRequest) => Promise<{ markdown: string }>
  cancel: (requestId: string) => Promise<void>
  saveSession: (session: Session) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  revealDataFile: () => Promise<void>
  onLessonEvent: (listener: (event: LessonEvent) => void) => () => void
  onNavigate: (listener: (target: 'home' | 'settings') => void) => () => void
}
