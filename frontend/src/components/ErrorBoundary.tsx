import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Top-level React error boundary. Exists mainly as a graceful fallback
 * for DOM-reconciliation errors caused by browser extensions (password
 * managers, Grammarly, translators) injecting nodes into inputs that
 * React then tries to unmount/reorder — a well-known, usually benign
 * class of error (`NotFoundError: Failed to execute 'insertBefore' on
 * 'Node'`, see https://github.com/facebook/react/issues/17256). The
 * Config Tree page's freeform inputs opt out of the extensions we know
 * about (see lib/inputProtection.ts), but new extensions can always
 * appear, so this is the last line of defense: a blank white screen is
 * a much worse failure mode than a recoverable error message,
 * especially since none of this app's state is actually lost when it
 * triggers (pending changes live in sessionStorage, not component
 * state).
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-950 px-4 text-center">
        <p className="text-lg font-semibold text-white">Something went wrong</p>
        <p className="max-w-md text-sm text-slate-400">
          {error.message}
        </p>
        <p className="max-w-md text-xs text-slate-500">
          This is sometimes caused by a browser extension (a password manager, Grammarly, or a
          translator) interfering with the page. Your pending changes weren&apos;t lost — they're
          saved in this tab until you commit them.
        </p>
        <div className="flex gap-2">
          <button
            onClick={this.handleReset}
            className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm text-slate-300 hover:bg-surface-800"
          >
            Reload page
          </button>
        </div>
      </div>
    )
  }
}
