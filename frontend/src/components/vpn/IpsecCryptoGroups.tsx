import type { IPsecConfig } from '../../lib/vpnIpsecTypes'
import IpsecEspGroupsSection from './IpsecEspGroupsSection'
import IpsecIkeGroupsSection from './IpsecIkeGroupsSection'
import IpsecPpkSection from './IpsecPpkSection'
import IpsecPskSection from './IpsecPskSection'

// This component's sections (ESP groups - with its own create/edit
// form and per-group proposal list -, IKE groups - likewise -, PSKs,
// PPKs) are each split into their own file (Ipsec*.tsx, same
// directory) rather than kept as nested functions in one large file -
// purely a maintainability split (each section is independently
// readable/testable-in-principle), no behavior change from the
// single-file version this used to be.
export default function IpsecCryptoGroups({ config }: { config: IPsecConfig }) {
  return (
    <div className="space-y-8">
      <IpsecEspGroupsSection config={config} />
      <IpsecIkeGroupsSection config={config} />
      <IpsecPskSection config={config} />
      <IpsecPpkSection config={config} />
    </div>
  )
}
