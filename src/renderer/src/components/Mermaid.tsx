import { useEffect, useId, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'neutral',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
  flowchart: { curve: 'basis', padding: 14 },
  themeVariables: { lineColor: '#8a938c' }
})

function currentDark(): boolean {
  return document.documentElement.dataset.theme === 'dark'
}

export function Mermaid({ chart }: { chart: string }): React.JSX.Element {
  const reactId = useId()
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [dark, setDark] = useState(currentDark)

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(currentDark()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}-${Math.random().toString(36).slice(2, 6)}`
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'neutral',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
      flowchart: { curve: 'basis', padding: 14 }
    })
    mermaid
      .render(id, chart)
      .then((result) => {
        if (!cancelled) {
          setSvg(result.svg)
          setError('')
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Could not draw this diagram.')
          setSvg('')
        }
      })
    return () => {
      cancelled = true
    }
  }, [chart, dark, reactId])

  if (error) {
    return (
      <div className="mermaid-fallback">
        <div className="mermaid-fallback-label">Diagram</div>
        <pre>{chart}</pre>
      </div>
    )
  }

  if (!svg) return <div className="mermaid-loading shimmer" aria-label="Drawing diagram" />

  return <div className="mermaid-figure" dangerouslySetInnerHTML={{ __html: svg }} />
}
