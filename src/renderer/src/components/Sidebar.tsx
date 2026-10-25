import { useApp } from '../state/AppContext'
import { IconBook, IconLibrary, IconLogo, IconSettings, IconSpark } from './Icons'

export type NavKey = 'home' | 'library' | 'settings'

interface SidebarProps {
  active: NavKey | 'session'
  onNavigate: (key: NavKey) => void
  onOpenSession: (id: string) => void
}

export function Sidebar({ active, onNavigate, onOpenSession }: SidebarProps): React.JSX.Element {
  const { sessions, providerStatus, settings } = useApp()
  const inProgress = sessions.find((session) => !session.completedAt)

  const providerLabel =
    providerStatus?.summary ??
    (settings.provider.kind === 'cli'
      ? settings.provider.cliKind === 'opencode'
        ? 'OpenCode'
        : 'Claude Code'
      : 'Not configured')

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand">
          <span className="brand-mark">
            <IconLogo size={26} />
          </span>
          <span className="brand-name">Learner</span>
        </div>
      </div>

      <button
        type="button"
        className="new-quiz-button"
        onClick={() => onNavigate('home')}
        title="New quiz (⌘N)"
      >
        <span className="new-quiz-plus">+</span>
        New quiz
        <kbd>⌘N</kbd>
      </button>

      <nav className="nav">
        <button
          type="button"
          className={`nav-item${active === 'home' ? ' is-active' : ''}`}
          onClick={() => onNavigate('home')}
        >
          <IconSpark size={18} />
          Study
        </button>
        <button
          type="button"
          className={`nav-item${active === 'library' ? ' is-active' : ''}`}
          onClick={() => onNavigate('library')}
        >
          <IconLibrary size={18} />
          Library
          {sessions.length > 0 ? <span className="nav-count">{sessions.length}</span> : null}
        </button>
      </nav>

      <div className="sidebar-spacer" />

      {inProgress ? (
        <button type="button" className="resume-card" onClick={() => onOpenSession(inProgress.id)}>
          <span className="resume-eyebrow">In progress</span>
          <span className="resume-subject">{inProgress.quiz.subject}</span>
          <span className="resume-progress">
            {inProgress.answers.length} of {inProgress.quiz.questions.length} answered
          </span>
          <span className="resume-bar">
            <span
              style={{
                width: `${(inProgress.answers.length / Math.max(1, inProgress.quiz.questions.length)) * 100}%`
              }}
            />
          </span>
        </button>
      ) : null}

      <button type="button" className="provider-chip" onClick={() => onNavigate('settings')}>
        <span className={`status-dot${providerStatus?.configured ? ' is-on' : ' is-off'}`} />
        <span className="provider-copy">
          <span className="provider-label">{providerLabel}</span>
          <span className="provider-sub">
            {providerStatus?.configured ? 'Connected' : 'Setup needed'}
          </span>
        </span>
        <IconSettings size={16} className="provider-gear" />
      </button>

      <button
        type="button"
        className={`nav-item nav-settings${active === 'settings' ? ' is-active' : ''}`}
        onClick={() => onNavigate('settings')}
      >
        <IconSettings size={18} />
        Settings
      </button>
    </aside>
  )
}
