import { useEffect, useState } from 'react'
import ChipList from '../ChipList'
import KeyValuePairList from '../KeyValuePairList'
import {
  addDeviceOps,
  addNetworkAttachmentOps,
  addPortOps,
  addTmpfsOps,
  addVolumeOps,
  blankHealthCheckFormValues,
  healthCheckFormToOps,
  type HealthCheckFormValues,
} from '../../lib/containerNestedForm'
import { containerNamePath, containerNetworkAttachmentPath, containerPortPath } from '../../lib/containerParse'
import {
  blankHealthCheck,
  type ContainerDevice,
  type ContainerNetwork,
  type ContainerNetworkAttachment,
  type ContainerPort,
  type ContainerTmpfs,
  type ContainerVolume,
} from '../../lib/containerTypes'
import type { ConfigOp } from '../../lib/vyosApi'
import InfoTooltip from '../InfoTooltip'
import ContainerDevicesSection from './ContainerDevicesSection'
import ContainerHealthCheckSection from './ContainerHealthCheckSection'
import ContainerNetworkAttachmentsSection from './ContainerNetworkAttachmentsSection'
import ContainerPortsSection from './ContainerPortsSection'
import ContainerTmpfsSection from './ContainerTmpfsSection'
import ContainerVolumesSection from './ContainerVolumesSection'

/**
 * The create-time counterpart to ContainerNestedSections.tsx: lets
 * every nested resource a container can have be defined BEFORE the
 * container itself is created, not just afterward (previously the
 * only way in - the six Container*Section.tsx components and
 * ChipList/KeyValuePairList all required an already-fetched, already-
 * committed container to attach to). Reuses the exact same six
 * section components (via their onAdd/onRemove/onSave overrides) plus
 * ChipList/KeyValuePairList (via their own onAdd/onRemove) for DNS
 * servers/environment/labels/sysctl - see each component's own doc
 * comments for why draft mode exists at all: pending changes are a
 * flat, resource-agnostic list with no way to later "cancel" an
 * individual entry if container creation itself is abandoned, so
 * everything here is buffered in local state and only actually queued
 * once, in a single batch, alongside the container's own creation.
 *
 * Owns all ten pieces of draft state itself and reports the fully
 * assembled ConfigOp[] up via onOpsChange whenever any of it changes -
 * ContainerForm.tsx's own submit only needs to read the latest value,
 * not know anything about the shape of any individual section. Pass
 * a stable callback (e.g. a useState setter directly) as onOpsChange,
 * not a fresh inline arrow function every render, or the effect below
 * will refire on every parent render for no reason.
 */
export default function ContainerCreateNestedSections({
  containerName,
  networks,
  onOpsChange,
}: {
  /** The name typed into the parent create form so far - live-updated
   * as the user types, since every op this component assembles is
   * rooted at it. */
  containerName: string
  networks: ContainerNetwork[]
  onOpsChange: (ops: ConfigOp[]) => void
}) {
  const [nameServers, setNameServers] = useState<string[]>([])
  const [networkAttachments, setNetworkAttachments] = useState<ContainerNetworkAttachment[]>([])
  const [ports, setPorts] = useState<ContainerPort[]>([])
  const [volumes, setVolumes] = useState<ContainerVolume[]>([])
  const [tmpfs, setTmpfs] = useState<ContainerTmpfs[]>([])
  const [devices, setDevices] = useState<ContainerDevice[]>([])
  const [environment, setEnvironment] = useState<{ id: string; value: string }[]>([])
  const [labels, setLabels] = useState<{ id: string; value: string }[]>([])
  const [sysctl, setSysctl] = useState<{ id: string; value: string }[]>([])
  const [healthCheck, setHealthCheck] = useState<HealthCheckFormValues>(blankHealthCheckFormValues())

  useEffect(() => {
    onOpsChange(
      assembleOps(containerName, {
        nameServers,
        networkAttachments,
        ports,
        volumes,
        tmpfs,
        devices,
        environment,
        labels,
        sysctl,
        healthCheck,
      }),
    )
    // onOpsChange is expected to be a stable reference (e.g. a
    // useState setter) - see this component's own doc comment. It
    // updates a DIFFERENT component's (ContainerForm.tsx's) state,
    // not this one's, so set-state-in-effect doesn't apply the same
    // way it does for useLogs.ts/useSampleHistory.ts's own local
    // state - still suppressed since oxlint can't tell the two cases
    // apart.
    // oxlint-disable-next-line react-hooks/exhaustive-deps, react/set-state-in-effect
  }, [
    containerName,
    nameServers,
    networkAttachments,
    ports,
    volumes,
    tmpfs,
    devices,
    environment,
    labels,
    sysctl,
    healthCheck,
  ])

  return (
    <div className="mt-3 space-y-4 border-t border-surface-border pt-3">
      <Section title="DNS name servers">
        <ChipList
          values={nameServers}
          basePath={containerNamePath(containerName)}
          leaf="name-server"
          pathLabel={`container name ${containerName} name-server`}
          placeholder="8.8.8.8"
          onAdd={(v) => setNameServers((prev) => [...prev, v])}
          onRemove={(v) => setNameServers((prev) => prev.filter((x) => x !== v))}
        />
      </Section>

      <Section title="Network attachments">
        <ContainerNetworkAttachmentsSection
          containerName={containerName}
          attachments={networkAttachments}
          networks={networks}
          onAdd={(networkName, mac) =>
            setNetworkAttachments((prev) => [...prev, { networkName, mac: mac || undefined, addresses: [] }])
          }
          onRemove={(networkName) =>
            setNetworkAttachments((prev) => prev.filter((n) => n.networkName !== networkName))
          }
          onAddressesChange={(networkName, addresses) =>
            setNetworkAttachments((prev) =>
              prev.map((n) => (n.networkName === networkName ? { ...n, addresses } : n)),
            )
          }
        />
      </Section>

      <Section title="Port mappings">
        <ContainerPortsSection
          containerName={containerName}
          ports={ports}
          onAdd={(id, source, destination, protocol) =>
            setPorts((prev) => [
              ...prev,
              { id, source: source || undefined, destination: destination || undefined, protocol: protocol || undefined, listenAddresses: [] },
            ])
          }
          onRemove={(id) => setPorts((prev) => prev.filter((p) => p.id !== id))}
          onListenAddressesChange={(portId, addresses) =>
            setPorts((prev) => prev.map((p) => (p.id === portId ? { ...p, listenAddresses: addresses } : p)))
          }
        />
      </Section>

      <Section title="Volume mounts">
        <ContainerVolumesSection
          containerName={containerName}
          volumes={volumes}
          onAdd={(id, source, destination, mode, propagation) =>
            setVolumes((prev) => [
              ...prev,
              {
                id,
                source: source || undefined,
                destination: destination || undefined,
                mode: mode || undefined,
                propagation: propagation || undefined,
              },
            ])
          }
          onRemove={(id) => setVolumes((prev) => prev.filter((v) => v.id !== id))}
        />
      </Section>

      <Section
        title="tmpfs mounts"
        hint="A directory backed by RAM instead of disk inside the container - fast, but its contents are lost whenever the container restarts."
      >
        <ContainerTmpfsSection
          containerName={containerName}
          tmpfs={tmpfs}
          onAdd={(id, destination, size) =>
            setTmpfs((prev) => [...prev, { id, destination: destination || undefined, size: size || undefined }])
          }
          onRemove={(id) => setTmpfs((prev) => prev.filter((t) => t.id !== id))}
        />
      </Section>

      <Section title="Devices">
        <ContainerDevicesSection
          containerName={containerName}
          devices={devices}
          onAdd={(id, source, destination) =>
            setDevices((prev) => [
              ...prev,
              { id, source: source || undefined, destination: destination || undefined },
            ])
          }
          onRemove={(id) => setDevices((prev) => prev.filter((d) => d.id !== id))}
        />
      </Section>

      <Section title="Environment variables">
        <KeyValuePairList
          items={environment}
          basePath={containerNamePath(containerName, 'environment')}
          pathLabel={`container name ${containerName} environment`}
          idPlaceholder="TZ"
          valuePlaceholder="UTC"
          onAdd={(id, value) => setEnvironment((prev) => [...prev, { id, value }])}
          onRemove={(id) => setEnvironment((prev) => prev.filter((e) => e.id !== id))}
        />
      </Section>

      <Section title="Labels">
        <KeyValuePairList
          items={labels}
          basePath={containerNamePath(containerName, 'label')}
          pathLabel={`container name ${containerName} label`}
          idPlaceholder="env"
          valuePlaceholder="prod"
          onAdd={(id, value) => setLabels((prev) => [...prev, { id, value }])}
          onRemove={(id) => setLabels((prev) => prev.filter((l) => l.id !== id))}
        />
      </Section>

      <Section
        title="Sysctl parameters"
        hint="Overrides kernel parameters inside the container's own network/process namespace only - does not touch the host's or other containers' settings."
      >
        <KeyValuePairList
          items={sysctl}
          basePath={containerNamePath(containerName, 'sysctl', 'parameter')}
          pathLabel={`container name ${containerName} sysctl parameter`}
          idPlaceholder="net.core.somaxconn"
          valuePlaceholder="1024"
          onAdd={(id, value) => setSysctl((prev) => [...prev, { id, value }])}
          onRemove={(id) => setSysctl((prev) => prev.filter((s) => s.id !== id))}
        />
      </Section>

      <Section title="Health check">
        <ContainerHealthCheckSection
          containerName={containerName}
          healthCheck={blankHealthCheck()}
          onSave={setHealthCheck}
        />
      </Section>
    </div>
  )
}

interface DraftState {
  nameServers: string[]
  networkAttachments: ContainerNetworkAttachment[]
  ports: ContainerPort[]
  volumes: ContainerVolume[]
  tmpfs: ContainerTmpfs[]
  devices: ContainerDevice[]
  environment: { id: string; value: string }[]
  labels: { id: string; value: string }[]
  sysctl: { id: string; value: string }[]
  healthCheck: HealthCheckFormValues
}

/** Flattens every draft section's accumulated entries into the same
 * ConfigOp[] shape each section's own live/post-creation "Add" button
 * would have queued individually - see each op-builder in
 * lib/containerNestedForm.ts and ChipList/KeyValuePairList's own
 * default (non-draft) behavior for the ops this mirrors. */
function assembleOps(containerName: string, state: DraftState): ConfigOp[] {
  if (containerName.trim() === '') return []
  const ops: ConfigOp[] = []

  for (const value of state.nameServers) {
    ops.push({ op: 'set', path: [...containerNamePath(containerName), 'name-server'], value })
  }

  for (const na of state.networkAttachments) {
    ops.push(...addNetworkAttachmentOps(containerName, na.networkName, na.mac ?? ''))
    for (const address of na.addresses) {
      ops.push({
        op: 'set',
        path: [...containerNetworkAttachmentPath(containerName, na.networkName), 'address'],
        value: address,
      })
    }
  }

  for (const port of state.ports) {
    ops.push(...addPortOps(containerName, port.id, port.source ?? '', port.destination ?? '', port.protocol ?? ''))
    for (const address of port.listenAddresses) {
      ops.push({
        op: 'set',
        path: [...containerPortPath(containerName, port.id), 'listen-address'],
        value: address,
      })
    }
  }

  for (const vol of state.volumes) {
    ops.push(
      ...addVolumeOps(containerName, vol.id, vol.source ?? '', vol.destination ?? '', vol.mode ?? '', vol.propagation ?? ''),
    )
  }

  for (const t of state.tmpfs) {
    ops.push(...addTmpfsOps(containerName, t.id, t.destination ?? '', t.size ?? ''))
  }

  for (const d of state.devices) {
    ops.push(...addDeviceOps(containerName, d.id, d.source ?? '', d.destination ?? ''))
  }

  for (const e of state.environment) {
    ops.push({ op: 'set', path: [...containerNamePath(containerName, 'environment'), e.id, 'value'], value: e.value })
  }

  for (const l of state.labels) {
    ops.push({ op: 'set', path: [...containerNamePath(containerName, 'label'), l.id, 'value'], value: l.value })
  }

  for (const s of state.sysctl) {
    ops.push({
      op: 'set',
      path: [...containerNamePath(containerName, 'sysctl', 'parameter'), s.id, 'value'],
      value: s.value,
    })
  }

  ops.push(...healthCheckFormToOps(containerName, blankHealthCheck(), state.healthCheck))

  return ops
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        {title}
        {hint && <InfoTooltip text={hint} />}
      </p>
      {children}
    </div>
  )
}
