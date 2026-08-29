import UserList from '../../components/system/UserList'
import { useSystemConfig } from '../../hooks/useSystemConfig'

export default function UsersPage() {
  const { users, isLoading, isError } = useSystemConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load system configuration.</p>

  return <UserList users={users} isLoading={isLoading} />
}
