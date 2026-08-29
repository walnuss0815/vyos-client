import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useSessionStore } from '../store/session'

export default function ProtectedRoute() {
  const status = useSessionStore((s) => s.status)
  const checkSession = useSessionStore((s) => s.checkSession)

  useEffect(() => {
    if (status === 'unknown') void checkSession()
  }, [status, checkSession])

  if (status === 'unknown') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-950 text-slate-400">
        Loading…
      </div>
    )
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
