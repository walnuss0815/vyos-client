import ChipList from '../ChipList'
import KeyValuePairList from '../KeyValuePairList'
import { containerNamePath } from '../../lib/containerParse'
import type { ContainerDefinition, ContainerNetwork } from '../../lib/containerTypes'
import InfoTooltip from '../InfoTooltip'
import ContainerDevicesSection from './ContainerDevicesSection'
import ContainerHealthCheckSection from './ContainerHealthCheckSection'
import ContainerNetworkAttachmentsSection from './ContainerNetworkAttachmentsSection'
import ContainerPortsSection from './ContainerPortsSection'
import ContainerTmpfsSection from './ContainerTmpfsSection'
import ContainerVolumesSection from './ContainerVolumesSection'

/**
 * Every nested tagNode-keyed list under `container name <name>` that's
 * only meaningful once the container itself already exists in the
 * config - same split as systemUserForm.ts/UserList.tsx's
 * PublicKeysSection: ContainerForm.tsx handles creation and the
 * scalar/flag/capability fields, this file handles everything queued
 * as a follow-up edit against an existing container.
 *
 * The larger sections (network attachments, ports, volumes, tmpfs,
 * devices, health check) are each split into their own file
 * (Container*Section.tsx, same directory) rather than kept as nested
 * functions in one large file - purely a maintainability split (each
 * section is independently readable/testable-in-principle), no
 * behavior change from the single-file version this used to be. The
 * simpler sections (DNS servers, environment variables, labels,
 * sysctl parameters) stay inline here since they're just a single
 * ChipList/KeyValuePairList call each - splitting those out would add
 * a file per section without actually reducing any real complexity.
 */
export default function ContainerNestedSections({
  container,
  networks,
}: {
  container: ContainerDefinition
  networks: ContainerNetwork[]
}) {
  return (
    <div className="mt-3 space-y-4 border-t border-surface-border pt-3">
      <Section title="DNS name servers">
        <ChipList
          values={container.nameServers}
          basePath={containerNamePath(container.name)}
          leaf="name-server"
          pathLabel={`container name ${container.name} name-server`}
          placeholder="8.8.8.8"
        />
      </Section>

      <Section title="Network attachments">
        <ContainerNetworkAttachmentsSection
          containerName={container.name}
          attachments={container.networks}
          networks={networks}
        />
      </Section>

      <Section title="Port mappings">
        <ContainerPortsSection containerName={container.name} ports={container.ports} />
      </Section>

      <Section title="Volume mounts">
        <ContainerVolumesSection containerName={container.name} volumes={container.volumes} />
      </Section>

      <Section
        title="tmpfs mounts"
        hint="A directory backed by RAM instead of disk inside the container - fast, but its contents are lost whenever the container restarts."
      >
        <ContainerTmpfsSection containerName={container.name} tmpfs={container.tmpfs} />
      </Section>

      <Section title="Devices">
        <ContainerDevicesSection containerName={container.name} devices={container.devices} />
      </Section>

      <Section title="Environment variables">
        <KeyValuePairList
          items={container.environment.map((e) => ({ id: e.name, value: e.value }))}
          basePath={containerNamePath(container.name, 'environment')}
          pathLabel={`container name ${container.name} environment`}
          idPlaceholder="TZ"
          valuePlaceholder="UTC"
        />
      </Section>

      <Section title="Labels">
        <KeyValuePairList
          items={container.labels.map((l) => ({ id: l.name, value: l.value }))}
          basePath={containerNamePath(container.name, 'label')}
          pathLabel={`container name ${container.name} label`}
          idPlaceholder="env"
          valuePlaceholder="prod"
        />
      </Section>

      <Section
        title="Sysctl parameters"
        hint="Overrides kernel parameters inside the container's own network/process namespace only - does not touch the host's or other containers' settings."
      >
        <KeyValuePairList
          items={container.sysctl.map((s) => ({ id: s.parameter, value: s.value }))}
          basePath={containerNamePath(container.name, 'sysctl', 'parameter')}
          pathLabel={`container name ${container.name} sysctl parameter`}
          idPlaceholder="net.core.somaxconn"
          valuePlaceholder="1024"
        />
      </Section>

      <Section title="Health check">
        <ContainerHealthCheckSection containerName={container.name} healthCheck={container.healthCheck} />
      </Section>
    </div>
  )
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
