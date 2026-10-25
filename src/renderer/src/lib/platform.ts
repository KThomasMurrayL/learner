export const platform = window.learner.platform
export const isMac = platform === 'mac'
export const isWindows = platform === 'windows'

/** ⌘N on macOS, Ctrl+N elsewhere. */
export function shortcut(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`
}

export const modLabel = isMac ? '⌘' : 'Ctrl'
