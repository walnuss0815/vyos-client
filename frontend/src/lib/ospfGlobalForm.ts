import { ospfPath } from './ospfParse'
import type { OSPFGlobalSettings, OSPFProtocol } from './ospfTypes'
import type { ConfigOp } from './vyosApi'

export interface OSPFGlobalFormValues {
  routerId: string
  autoCostReferenceBandwidth: string
  distanceGlobal: string
  distanceExternal: string
  distanceInterArea: string
  distanceIntraArea: string
  defaultInformationOriginateAlways: boolean
  defaultInformationOriginateMetric: string
  defaultInformationOriginateMetricType: '' | '1' | '2'
  /** OSPFv2 only. */
  defaultMetric: string
}

export function blankGlobalFormValues(): OSPFGlobalFormValues {
  return {
    routerId: '',
    autoCostReferenceBandwidth: '',
    distanceGlobal: '',
    distanceExternal: '',
    distanceInterArea: '',
    distanceIntraArea: '',
    defaultInformationOriginateAlways: false,
    defaultInformationOriginateMetric: '',
    defaultInformationOriginateMetricType: '',
    defaultMetric: '',
  }
}

export function globalToFormValues(settings: OSPFGlobalSettings): OSPFGlobalFormValues {
  return {
    routerId: settings.routerId ?? '',
    autoCostReferenceBandwidth: settings.autoCostReferenceBandwidth ?? '',
    distanceGlobal: settings.distanceGlobal ?? '',
    distanceExternal: settings.distanceExternal ?? '',
    distanceInterArea: settings.distanceInterArea ?? '',
    distanceIntraArea: settings.distanceIntraArea ?? '',
    defaultInformationOriginateAlways: settings.defaultInformationOriginateAlways,
    defaultInformationOriginateMetric: settings.defaultInformationOriginateMetric ?? '',
    defaultInformationOriginateMetricType: settings.defaultInformationOriginateMetricType ?? '',
    defaultMetric: settings.defaultMetric ?? '',
  }
}

interface ScalarField {
  get: (v: OSPFGlobalFormValues) => string
  path: (protocol: OSPFProtocol) => string[]
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.routerId, path: (p) => ospfPath(p, 'parameters', 'router-id') },
  {
    get: (v) => v.autoCostReferenceBandwidth,
    path: (p) => ospfPath(p, 'auto-cost', 'reference-bandwidth'),
  },
  { get: (v) => v.distanceGlobal, path: (p) => ospfPath(p, 'distance', 'global') },
  { get: (v) => v.distanceExternal, path: (p) => ospfPath(p, 'distance', p, 'external') },
  { get: (v) => v.distanceInterArea, path: (p) => ospfPath(p, 'distance', p, 'inter-area') },
  { get: (v) => v.distanceIntraArea, path: (p) => ospfPath(p, 'distance', p, 'intra-area') },
  {
    get: (v) => v.defaultInformationOriginateMetric,
    path: (p) => ospfPath(p, 'default-information', 'originate', 'metric'),
  },
  {
    get: (v) => v.defaultInformationOriginateMetricType,
    path: (p) => ospfPath(p, 'default-information', 'originate', 'metric-type'),
  },
]

/**
 * Diffs global settings. `distance <protocol> external/inter-area/
 * intra-area` uses the *protocol name itself* as the node under
 * `distance` (confirmed against vyos-1x's interface-definitions XML:
 * `<node name="ospf">` for OSPFv2, `<node name="ospfv3">` for
 * OSPFv3) - not a fixed shared node name - hence `path: (p) =>
 * ospfPath(p, 'distance', p, ...)`.
 */
export function globalFormToOps(
  protocol: OSPFProtocol,
  before: OSPFGlobalSettings,
  values: OSPFGlobalFormValues,
): ConfigOp[] {
  const beforeValues = globalToFormValues(before)
  const ops: ConfigOp[] = []

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = field.path(protocol)
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  if (beforeValues.defaultInformationOriginateAlways !== values.defaultInformationOriginateAlways) {
    const path = ospfPath(protocol, 'default-information', 'originate', 'always')
    ops.push(
      values.defaultInformationOriginateAlways ? { op: 'set', path } : { op: 'delete', path },
    )
  }

  if (protocol === 'ospf' && beforeValues.defaultMetric !== values.defaultMetric) {
    const path = ospfPath('ospf', 'default-metric')
    if (values.defaultMetric.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.defaultMetric.trim() })
  }

  return ops
}

export function addRedistributionOps(
  protocol: OSPFProtocol,
  source: string,
  metric: string,
  metricType: '' | '1' | '2',
): ConfigOp[] {
  const path = ospfPath(protocol, 'redistribute', source)
  const ops: ConfigOp[] = [{ op: 'set', path }]
  const trimmedMetric = metric.trim()
  if (trimmedMetric) {
    ops.push({ op: 'set', path: [...path, 'metric'], value: trimmedMetric })
  }
  if (metricType) {
    ops.push({ op: 'set', path: [...path, 'metric-type'], value: metricType })
  }
  return ops
}

export function removeRedistributionOp(protocol: OSPFProtocol, source: string): ConfigOp {
  return { op: 'delete', path: ospfPath(protocol, 'redistribute', source) }
}
