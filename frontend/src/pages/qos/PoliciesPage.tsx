import CakePolicyList from '../../components/qos/CakePolicyList'
import FqCodelPolicyList from '../../components/qos/FqCodelPolicyList'
import LimiterPolicyList from '../../components/qos/LimiterPolicyList'
import QosShaperStatusPanel from '../../components/qos/QosShaperStatusPanel'
import RateControlPolicyList from '../../components/qos/RateControlPolicyList'
import ShaperHfscPolicyList from '../../components/qos/ShaperHfscPolicyList'
import ShaperPolicyList from '../../components/qos/ShaperPolicyList'
import SimpleClassfulPolicyList from '../../components/qos/SimpleClassfulPolicyList'
import { useQosConfig } from '../../hooks/useQosConfig'

export default function PoliciesPage() {
  const qos = useQosConfig()

  if (qos.isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (qos.isError) return <p className="text-sm text-danger-500">Failed to load QoS configuration.</p>

  const matchGroupNames = qos.matchGroups.map((g) => g.name)

  return (
    <div>
      <QosShaperStatusPanel interfaceNames={qos.interfaces.map((b) => b.interface)} />
      <ShaperPolicyList policies={qos.shaperPolicies} availableMatchGroups={matchGroupNames} />
      <ShaperHfscPolicyList policies={qos.shaperHfscPolicies} availableMatchGroups={matchGroupNames} />
      <LimiterPolicyList policies={qos.limiterPolicies} availableMatchGroups={matchGroupNames} />
      <SimpleClassfulPolicyList
        policyType="priority-queue"
        title="Priority Queue"
        classIdHint="priority (1-7)"
        policies={qos.priorityQueuePolicies}
        availableMatchGroups={matchGroupNames}
      />
      <SimpleClassfulPolicyList
        policyType="round-robin"
        title="Round Robin (DRR)"
        classIdHint="class ID (1-4095)"
        policies={qos.roundRobinPolicies}
        availableMatchGroups={matchGroupNames}
      />
      <CakePolicyList policies={qos.cakePolicies} />
      <FqCodelPolicyList policies={qos.fqCodelPolicies} />
      <RateControlPolicyList policies={qos.rateControlPolicies} />
    </div>
  )
}
