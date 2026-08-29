import BGPGlobalSettings from '../../components/bgp/BGPGlobalSettings'
import BGPNetworksAndRedistribution from '../../components/bgp/BGPNetworksAndRedistribution'
import BGPPeerList from '../../components/bgp/BGPPeerList'
import { useBGPConfig } from '../../hooks/useBGPConfig'

export default function BGPPage() {
  const { bgp, isLoading, isError } = useBGPConfig()

  return (
    <div>
      <p className="mb-4 text-sm text-slate-400">
        Border Gateway Protocol - system AS, neighbors and peer-groups, advertised networks, and
        redistribution of other protocols' routes into BGP. A neighbor's own settings override
        whatever it inherits from an assigned peer-group. Advanced options (dampening, BFD,
        capability negotiation, path-attribute manipulation, ADD-PATH, conditional advertisement,
        VRF/EVPN, listen ranges, graceful restart, confederations, ...) aren't covered here and
        are still editable via the Config Tree page.
      </p>

      {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {isError && <p className="text-sm text-danger-500">Failed to load BGP configuration.</p>}

      {!isLoading && !isError && (
        <div className="space-y-6">
          <BGPGlobalSettings bgp={bgp} />
          <BGPPeerList
            kind="neighbor"
            peers={bgp.neighbors}
            peerGroupNames={bgp.peerGroups.map((g) => g.identifier)}
            isLoading={isLoading}
          />
          <BGPPeerList kind="peer-group" peers={bgp.peerGroups} peerGroupNames={[]} isLoading={isLoading} />
          <BGPNetworksAndRedistribution networks={bgp.networks} redistributions={bgp.redistributions} />
        </div>
      )}
    </div>
  )
}
