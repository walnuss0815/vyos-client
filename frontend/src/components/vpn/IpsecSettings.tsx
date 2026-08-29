import { useState } from 'react'
import {
  blankOptionsFormValues,
  disableIPsecOp,
  enableIPsecOp,
  optionsFormToOps,
  optionsToFormValues,
  toggleDisableUniqreqidsOp,
} from '../../lib/vpnIpsecForm'
import type { IPsecConfig } from '../../lib/vpnIpsecTypes'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

export default function IpsecSettings({ config }: { config: IPsecConfig }) {
  const add = usePendingChangesStore((s) => s.add)

  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">IPsec is not configured.</p>
        <button
          onClick={() => {
            const op = enableIPsecOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable IPsec
        </button>
      </div>
    )
  }

  return <IpsecSettingsForm config={config} />
}

function IpsecSettingsForm({ config }: { config: IPsecConfig }) {
  const [values, setValues] = useState(() => optionsToFormValues(config.options))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankOptionsFormValues>>(
    key: K,
    value: ReturnType<typeof blankOptionsFormValues>[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = optionsFormToOps(config.options, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  function toggleUniqreqids() {
    const op = toggleDisableUniqreqidsOp(!config.disableUniqreqids)
    add({ op, label: `${op.op} ${op.path.join(' ')}` })
  }

  function queueDisable() {
    const op = disableIPsecOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            Bind interface
            <input {...noExtensionInputProps} value={values.interface} onChange={(e) => update('interface', e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Retransmission attempts
            <input {...noExtensionInputProps} value={values.retransmissionAttempts} onChange={(e) => update('retransmissionAttempts', e.target.value)} placeholder="5" className={inputClass} />
          </label>
          <FieldLabel
            label="Retransmission base"
            hint="Multiplier applied between each retry (e.g. 1.8x longer each time) if a peer doesn't respond - a form of exponential backoff for IKE negotiation."
          >
            <input {...noExtensionInputProps} value={values.retransmissionBase} onChange={(e) => update('retransmissionBase', e.target.value)} placeholder="1.8" className={inputClass} />
          </FieldLabel>
          <label className={labelClass}>
            Retransmission timeout (s)
            <input {...noExtensionInputProps} value={values.retransmissionTimeout} onChange={(e) => update('retransmissionTimeout', e.target.value)} placeholder="4" className={inputClass} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.disableRouteAutoinstall} onChange={(e) => update('disableRouteAutoinstall', e.target.checked)} className="accent-accent-500" />
            Don't auto-install routes to remote networks
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.flexvpn} onChange={(e) => update('flexvpn', e.target.checked)} className="accent-accent-500" />
            Allow FlexVPN vendor ID (IKEv2)
            <InfoTooltip text="Identifies this router's IKEv2 stack as Cisco-FlexVPN-compatible to peers that check for it - only needed when interoperating with Cisco FlexVPN gear." />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.virtualIp} onChange={(e) => update('virtualIp', e.target.checked)} className="accent-accent-500" />
            Allow virtual-IP installation
            <InfoTooltip text="Lets remote-access clients receive an IP address assigned by this router's pools over the IKEv2 configuration payload." />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={config.disableUniqreqids} onChange={toggleUniqreqids} className="accent-accent-500" />
            Disable unique-ID requirement
            <InfoTooltip text="By default VyOS closes an existing IKE session when the same peer ID reconnects. Disabling this allows multiple simultaneous sessions per ID." />
          </label>
        </div>
        <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>Save settings</button>
      </div>

      <div>
        <button onClick={queueDisable} className="text-xs text-danger-500 hover:text-danger-400">
          Disable IPsec entirely
        </button>
      </div>
    </div>
  )
}
