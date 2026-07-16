import { Badge } from '@/components/ui/badge'
import type { ModelCapabilities } from '@/types/hermes'

interface ModelCapabilityBadgesProps {
  capabilities?: ModelCapabilities
  compact?: boolean
}

interface CapBadgeProps {
  label: string
  supported: boolean | 'unknown'
}

function CapBadge({ label, supported }: CapBadgeProps) {
  if (supported === 'unknown') {
    return (
      <Badge variant="muted">
        {label}?
      </Badge>
    )
  }

  return (
    <Badge variant={supported ? 'default' : 'muted'} className={supported ? '' : 'opacity-50'}>
      {label}
    </Badge>
  )
}

export function ModelCapabilityBadges({ capabilities, compact = false }: ModelCapabilityBadgesProps) {
  if (!capabilities) {
    return null
  }

  const items = [
    { key: 'chat', label: 'Chat', value: capabilities.chat },
    { key: 'toolCalls', label: 'Tool', value: capabilities.toolCalls },
    { key: 'vision', label: 'Vision', value: capabilities.vision },
    { key: 'reasoning', label: 'Reasoning', value: capabilities.reasoning },
    { key: 'streaming', label: 'Streaming', value: capabilities.streaming },
    { key: 'jsonMode', label: 'JSON', value: capabilities.jsonMode },
    { key: 'fast', label: 'Fast', value: capabilities.fast }
  ]

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {items.filter(item => item.value === true).map(item => (
          <CapBadge key={item.key} label={item.label} supported={item.value} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map(item => (
        <CapBadge key={item.key} label={item.label} supported={item.value} />
      ))}
    </div>
  )
}
