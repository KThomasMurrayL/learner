export const api = window.learner

/** Electron wraps IPC errors; keep only the useful part. */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Something went wrong.'
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^(IpcError|AiError|Error):\s*/i, '')
    .trim()
}
