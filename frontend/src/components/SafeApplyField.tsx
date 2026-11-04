import { noExtensionInputProps } from '../lib/inputProtection'
import { inputClass } from '../lib/formStyles'
import { MAX_CONFIRM_SECONDS, MIN_CONFIRM_SECONDS } from '../lib/safeApply'

export const SAFE_APPLY_RANGE_MESSAGE = `Safe apply seconds must be between ${MIN_CONFIRM_SECONDS} and ${MAX_CONFIRM_SECONDS}.`

interface Props {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  seconds: number
  onSecondsChange: (seconds: number) => void
  valid: boolean
}

export default function SafeApplyField({ enabled, onEnabledChange, seconds, onSecondsChange, valid }: Props) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-400">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onEnabledChange(e.target.checked)}
        className="accent-accent-500"
      />
      Safe apply
      {enabled && (
        <input
          {...noExtensionInputProps}
          type="number"
          min={MIN_CONFIRM_SECONDS}
          max={MAX_CONFIRM_SECONDS}
          value={seconds}
          onChange={(e) => onSecondsChange(Number(e.target.value))}
          className={`ml-1 w-16 ${inputClass} ${valid ? '' : 'border-danger-500'}`}
        />
      )}
      {enabled && <span>sec</span>}
    </label>
  )
}
