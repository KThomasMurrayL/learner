/**
 * Pull the first complete JSON object out of a model response. Models
 * occasionally wrap JSON in prose or markdown fences, so this is deliberately
 * more forgiving than JSON.parse.
 */
export function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/^\uFEFF/, '').trim()

  const direct = tryParse(cleaned)
  if (direct !== undefined) return direct

  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    const fenced = tryParse(fence[1].trim())
    if (fenced !== undefined) return fenced
  }

  const start = cleaned.indexOf('{')
  if (start === -1) throw new Error('The model did not return any JSON.')

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        const candidate = cleaned.slice(start, i + 1)
        const parsed = tryParse(candidate)
        if (parsed !== undefined) return parsed
        break
      }
    }
  }

  // Some models emit trailing commas; try one gentle repair pass.
  const repaired = cleaned
    .slice(start)
    .replace(/,\s*([}\]])/g, '$1')
  const repairedEnd = repaired.lastIndexOf('}')
  if (repairedEnd !== -1) {
    const parsed = tryParse(repaired.slice(0, repairedEnd + 1))
    if (parsed !== undefined) return parsed
  }

  throw new Error('The model returned malformed JSON.')
}

function tryParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

/** Strip a wrapping markdown code fence, if the whole document has one. */
export function stripOuterFence(markdown: string): string {
  const text = markdown.trim()
  const match = text.match(/^```(?:markdown|md|mdx)?\s*\n([\s\S]*?)\n```$/i)
  return match ? match[1].trim() : text
}

export function truncate(value: string, max = 400): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}
