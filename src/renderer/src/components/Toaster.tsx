import { useApp } from '../state/AppContext'
import { IconAlert, IconCheck, IconClose, IconSpark } from './Icons'

export function Toaster(): React.JSX.Element {
  const { toasts, dismissToast } = useApp()
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          <span className="toast-icon">
            {toast.tone === 'error' ? <IconAlert size={17} /> : toast.tone === 'success' ? <IconCheck size={17} /> : <IconSpark size={17} />}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button type="button" className="toast-close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
            <IconClose size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
