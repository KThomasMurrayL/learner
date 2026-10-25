import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Mermaid } from './Mermaid'

export function Markdown({ source, live = false }: { source: string; live?: boolean }) {
  const components = useMemo<Components>(
    () => ({
      pre({ children }) {
        const child = Array.isArray(children) ? children[0] : children
        const props = (child as { props?: { className?: string; children?: unknown } } | undefined)?.props
        const className = props?.className ?? ''
        if (className.includes('language-mermaid') && !live) {
          return <Mermaid chart={String(props?.children ?? '').trim()} />
        }
        return <pre>{children}</pre>
      },
      code({ className, children }) {
        return <code className={className}>{children}</code>
      },
      table({ children }) {
        return (
          <div className="table-scroll">
            <table>{children}</table>
          </div>
        )
      },
      a({ href, children }) {
        return (
          <a href={href} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        )
      }
    }),
    [live]
  )

  return (
    <div className={`markdown${live ? ' markdown-live' : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {source}
      </ReactMarkdown>
      {live ? <span className="stream-caret" aria-hidden="true" /> : null}
    </div>
  )
}
