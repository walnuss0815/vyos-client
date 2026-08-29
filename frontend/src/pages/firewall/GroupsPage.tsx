import { useState } from 'react'
import { groupPath } from '../../lib/firewallParse'
import {
  GROUP_MEMBER_LEAF,
  GROUP_TYPES,
  GROUP_TYPE_LABELS,
  type FirewallGroup,
  type GroupType,
} from '../../lib/firewallTypes'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { useFirewallConfig } from '../../hooks/useFirewallConfig'
import { usePendingChangesStore } from '../../store/pendingChanges'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { isValidVyOSIdentifier } from '../../lib/vyosIdentifier'
import FieldLabel from '../../components/FieldLabel'
import InfoTooltip from '../../components/InfoTooltip'

const MEMBER_PLACEHOLDER: Record<GroupType, string> = {
  'address-group': '10.0.0.1 or 10.0.0.1-10.0.0.8',
  'network-group': '192.168.1.0/24',
  'port-group': 'http, 443, or 5000-5010',
  'interface-group': 'eth1 (wildcards like eth3* allowed)',
  'mac-group': '00:11:22:33:44:55',
  'domain-group': 'example.com',
}

export default function GroupsPage() {
  const { groups, isLoading, isError } = useFirewallConfig()
  const [type, setType] = useState<GroupType>('address-group')
  const [showCreate, setShowCreate] = useState(false)

  const groupsOfType = groups.filter((g) => g.type === type)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-surface-border bg-surface-900 p-1 text-xs">
            {GROUP_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded px-2.5 py-1.5 font-medium ${
                  type === t ? 'bg-accent-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {GROUP_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <InfoTooltip text="Groups are named, reusable objects Firewall/NAT rules can reference by name instead of repeating the same values everywhere. The 'address' kind holds individual addresses/ranges; the 'network' kind holds whole CIDR subnets." />
        </div>
        <button onClick={() => setShowCreate((v) => !v)} className={`shrink-0 bg-accent-600 ${buttonClass}`}>
          {showCreate ? 'Cancel' : '+ New group'}
        </button>
      </div>

      {showCreate && (
        <CreateGroupForm type={type} onDone={() => setShowCreate(false)} />
      )}

      {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {isError && <p className="text-sm text-danger-500">Failed to load firewall configuration.</p>}

      <div className="space-y-3">
        {groupsOfType.map((group) => (
          <GroupCard key={`${group.type}-${group.name}`} group={group} />
        ))}
        {!isLoading && groupsOfType.length === 0 && (
          <p className="text-sm text-slate-500">No {GROUP_TYPE_LABELS[type].toLowerCase()} configured yet.</p>
        )}
      </div>
    </div>
  )
}

function CreateGroupForm({ type, onDone }: { type: GroupType; onDone: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [firstMember, setFirstMember] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const valid = isValidVyOSIdentifier(name.trim()) && firstMember.trim() !== ''

  function submit() {
    if (!valid) return
    const groupName = name.trim()
    const memberLeaf = GROUP_MEMBER_LEAF[type]
    add({
      op: { op: 'set', path: groupPath(type, groupName, memberLeaf), value: firstMember.trim() },
      label: `set group ${type} ${groupName} ${memberLeaf} '${firstMember.trim()}'`,
    })
    if (description.trim()) {
      add({
        op: { op: 'set', path: groupPath(type, groupName, 'description'), value: description.trim() },
        label: `set group ${type} ${groupName} description '${description.trim()}'`,
      })
    }
    onDone()
  }

  return (
    <div className="mb-4 rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Name
          <input
            {...noExtensionInputProps}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="SERVERS"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Description (optional)
          <input
            {...noExtensionInputProps}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <FieldLabel
        label="First member"
        hint="One entry in this group - the expected format depends on the group type selected above (address, CIDR network, port, interface name, MAC address, or domain)."
        className={`mt-3 ${labelClass}`}
      >
        <input
          {...noExtensionInputProps}
          value={firstMember}
          onChange={(e) => setFirstMember(e.target.value)}
          placeholder={MEMBER_PLACEHOLDER[type]}
          className={inputClass}
        />
      </FieldLabel>
      <button onClick={submit} disabled={!valid} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Queue group creation
      </button>
    </div>
  )
}

function GroupCard({ group }: { group: FirewallGroup }) {
  const [newMember, setNewMember] = useState('')
  const add = usePendingChangesStore((s) => s.add)
  const memberLeaf = GROUP_MEMBER_LEAF[group.type]

  function queueDelete() {
    add({
      op: { op: 'delete', path: groupPath(group.type, group.name) },
      label: `delete group ${group.type} ${group.name}`,
    })
  }

  function queueAddMember() {
    if (!newMember) return
    add({
      op: { op: 'set', path: groupPath(group.type, group.name, memberLeaf), value: newMember },
      label: `set group ${group.type} ${group.name} ${memberLeaf} '${newMember}'`,
    })
    setNewMember('')
  }

  function queueRemoveMember(member: string) {
    add({
      op: { op: 'delete', path: groupPath(group.type, group.name, memberLeaf), value: member },
      label: `delete group ${group.type} ${group.name} ${memberLeaf} '${member}'`,
    })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-mono text-sm font-medium text-white">{group.name}</h3>
          {group.description && <p className="mt-0.5 text-xs text-slate-400">{group.description}</p>}
        </div>
        <button onClick={queueDelete} className="text-xs text-slate-500 hover:text-danger-500">
          Delete group
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {group.members.map((member) => (
          <span
            key={member}
            className="flex items-center gap-1 rounded bg-surface-800 px-2 py-0.5 font-mono text-xs text-slate-300"
          >
            {member}
            <button
              onClick={() => queueRemoveMember(member)}
              className="text-slate-500 hover:text-danger-500"
              aria-label={`Remove ${member} from group ${group.name}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          {...noExtensionInputProps}
          value={newMember}
          onChange={(e) => setNewMember(e.target.value)}
          placeholder={MEMBER_PLACEHOLDER[group.type]}
          className={`flex-1 ${inputClass}`}
        />
        <button onClick={queueAddMember} disabled={!newMember} className={`bg-accent-600 ${buttonClass}`}>
          Add
        </button>
      </div>
    </div>
  )
}
