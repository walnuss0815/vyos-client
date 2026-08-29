/**
 * Interface classification, purely from `NetworkInterface.name`.
 *
 * VyOS's own interface-type class registry (vyos-1x's
 * python/vyos/ifconfig/{section,ethernet,wireless,wwan}.py) maps
 * hardware-backed interfaces to a fixed set of name prefixes:
 * EthernetIf (lan/eth/eno/ens/enp/enx), WiFiIf (wlan), WWANIf (wwan).
 * Every other interface type VyOS supports (bond, br, dum, geneve,
 * l2tpv3, macsec, macvlan, pppoe, sstpc, tun, veth, vti, vtun, vxlan,
 * wg, ...) is virtual. VLAN sub-interfaces are detected the same way
 * VyOS's own tooling does: purely by a `.`-suffixed numeric tail on
 * the name (e.g. `eth0.10`), regardless of what they're stacked on.
 */

// Prefix + at least one digit, then any run of further digits/letters
// (but no dot) - covers both simple names (eth0, wlan0) and
// predictable/systemd-style names (enp0s3, ens192f0) without also
// matching a VLAN sub-interface's dotted suffix (eth0.10).
const ETHERNET_INTERFACE_PATTERN = /^(lan|eth|eno|ens|enp|enx)\d[0-9a-zA-Z]*$/
const PHYSICAL_INTERFACE_PATTERN = /^(lan|eth|eno|ens|enp|enx|wlan|wwan)\d[0-9a-zA-Z]*$/

/** True for hardware-backed interfaces (Ethernet, WiFi, WWAN). */
export function isPhysicalInterface(name: string): boolean {
  return PHYSICAL_INTERFACE_PATTERN.test(name)
}

/** True specifically for VyOS's `EthernetIf` type (lan/eth/eno/ens/
 * enp/enx prefixes) - narrower than isPhysicalInterface, which also
 * matches WiFi (wlan) and WWAN (wwan). Used by the Interface
 * Configuration UI's Ethernet tab, since `interfaces ethernet <if>`
 * config only applies to this subset - wireless/WWAN interfaces have
 * their own, differently-shaped config trees (not covered by this
 * app yet). */
export function isEthernetInterface(name: string): boolean {
  return ETHERNET_INTERFACE_PATTERN.test(name)
}

/** True for VLAN sub-interfaces, e.g. `eth0.10`. */
export function isVlanInterface(name: string): boolean {
  return name.includes('.')
}
