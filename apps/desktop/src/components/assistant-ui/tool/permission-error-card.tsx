'use client'

import { useStore } from '@nanostores/react'

import { Button } from '@/components/ui/button'
import { Lock } from '@/lib/icons'
import { $karnaPermissionLevel, setKarnaPermissionLevelStore } from '@/store/karna-permission'

interface PermissionErrorCardProps {
  message: string
}

export function isPermissionError(text: string): boolean {
  if (!text) {return false}

  const keywords = [
    'permission_denied',
    'permission_gateway_failure',
    '当前模式不允许',
    '当前处于\'仅当前项目\'模式',
    '当前处于"仅当前项目"模式',
    '权限被拒绝',
    '禁止访问',
    '切换到\'电脑授权模式\'',
    '切换到"电脑授权模式"',
    '权限策略',
    '仅当前项目'
  ]

  return keywords.some(keyword => text.includes(keyword))
}

export function extractPermissionErrorMessage(result: unknown): string | null {
  if (typeof result === 'string') {
    return isPermissionError(result) ? result : null
  }

  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>

    if (typeof record.error === 'string') {
      return isPermissionError(record.error) ? record.error : null
    }

    if (typeof record.message === 'string') {
      return isPermissionError(record.message) ? record.message : null
    }

    if (typeof record.reason === 'string') {
      return isPermissionError(record.reason) ? record.reason : null
    }
  }

  try {
    const str = JSON.stringify(result)

    return isPermissionError(str) ? str : null
  } catch {
    return null
  }
}

export function PermissionErrorCard({ message }: PermissionErrorCardProps) {
  const currentLevel = useStore($karnaPermissionLevel)
  const showSwitchButton = currentLevel === 'restricted'

  let displayMessage = message

  try {
    const parsed = JSON.parse(message)

    if (parsed.error) {
      displayMessage = parsed.error
    } else if (parsed.message) {
      displayMessage = parsed.message
    } else if (parsed.reason) {
      displayMessage = parsed.reason
    }
  } catch {
    // Message is already plain text.
  }

  return (
    <div className="rounded-lg border border-amber-300/30 bg-amber-50/50 p-3 dark:bg-amber-950/20">
      <div className="flex items-start gap-2">
        <Lock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-amber-800 dark:text-amber-200">
            操作被权限策略阻止
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-300/80 whitespace-pre-wrap break-words">
            {displayMessage}
          </div>
          {currentLevel === 'restricted' && (
            <div className="mt-1.5 text-[0.7rem] text-amber-700/80 dark:text-amber-300/70">
              该能力已在当前任务中统一阻止；改用终端、代码执行、MCP 或插件也不会绕过此限制。
            </div>
          )}
          {showSwitchButton && (
            <Button
              className="mt-2 h-7 text-xs"
              onClick={() => setKarnaPermissionLevelStore('computer')}
              size="sm"
              variant="secondary"
            >
              切换到电脑授权
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
