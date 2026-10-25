/// <reference types="vite/client" />

import type { LearnerApi } from '@shared/types'

declare global {
  interface Window {
    learner: LearnerApi
  }
}

export {}
