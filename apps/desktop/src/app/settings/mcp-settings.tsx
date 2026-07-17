import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getHermesConfigRecord, type HermesGateway, saveHermesConfig } from '@/hermes'
import { useI18n } from '@/i18n'
import { Globe, Wrench, X } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import { $activeSessionId } from '@/store/session'
import type { HermesConfigRecord } from '@/types/hermes'

import { EmptyState, LoadingState, Pill, SettingsContent } from './primitives'
import { useDeepLinkHighlight } from './use-deep-link-highlight'

interface McpSettingsProps {
  gateway?: HermesGateway | null
  onConfigSaved?: () => void
}

type McpServers = Record<string, Record<string, unknown>>

const EMPTY_SERVER = {
  command: '',
  args: [],
  env: {},
  version: 'v1.0.0',
  healthy: true,
  deprecated: false,
  permissions: [],
  dependencies: []
}

function getServers(config: HermesConfigRecord | null): McpServers {
  const raw = config?.mcp_servers

  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as McpServers) : {}
}

const transportLabel = (server: Record<string, unknown>) =>
  typeof server.transport === 'string'
    ? server.transport
    : typeof server.url === 'string'
      ? 'http'
      : typeof server.command === 'string'
        ? 'stdio'
        : 'custom'

export function McpSettings({ gateway, onConfigSaved }: McpSettingsProps) {
  const { t } = useI18n()
  const m = t.settings.mcp
  const activeSessionId = useStore($activeSessionId)
  const [config, setConfig] = useState<HermesConfigRecord | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [demoCalloutDismissed, setDemoCalloutDismissed] = useState(false)
  const isBrowserMode = typeof window !== 'undefined' && !window.karnaDesktop

  useEffect(() => {
    let cancelled = false

    getHermesConfigRecord()
      .then(next => {
        if (cancelled) {
          return
        }

        setConfig(next)
        const first = Object.keys(getServers(next)).sort()[0] ?? null
        setSelected(first)
      })
      .catch(err => notifyError(err, m.failedLoad))

    return () => void (cancelled = true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount; copy is stable
  }, [])

  const servers = useMemo(() => getServers(config), [config])
  const names = useMemo(() => Object.keys(servers).sort(), [servers])

  useDeepLinkHighlight({
    block: 'nearest',
    elementId: serverName => `mcp-server-${serverName}`,
    onResolve: setSelected,
    param: 'server',
    ready: serverName => Boolean(config) && serverName in servers
  })

  useEffect(() => {
    const server = selected ? servers[selected] : null

    setName(selected ?? '')
    setBody(JSON.stringify(server ?? EMPTY_SERVER, null, 2))
  }, [selected, servers])

  if (!config) {
    return <LoadingState label={m.loading} />
  }

  const saveServer = async () => {
    const nextName = name.trim()

    if (!nextName) {
      notify({ kind: 'error', title: m.nameRequiredTitle, message: m.nameRequiredMessage })

      return
    }

    let parsed: Record<string, unknown>

    try {
      const raw = JSON.parse(body)

      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(m.objectRequired)
      }

      parsed = raw as Record<string, unknown>
    } catch (err) {
      notifyError(err, m.invalidJson)

      return
    }

    setSaving(true)

    try {
      const nextServers = { ...servers }

      if (selected && selected !== nextName) {
        delete nextServers[selected]
      }

      nextServers[nextName] = parsed

      const nextConfig = { ...config, mcp_servers: nextServers }
      await saveHermesConfig(nextConfig)
      setConfig(nextConfig)
      setSelected(nextName)
      onConfigSaved?.()
      notify({ kind: 'success', title: m.savedTitle, message: m.savedMessage(nextName) })
    } catch (err) {
      notifyError(err, m.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  const removeServer = async (serverName: string) => {
    setSaving(true)

    try {
      const nextServers = { ...servers }
      delete nextServers[serverName]

      const nextConfig = { ...config, mcp_servers: nextServers }
      await saveHermesConfig(nextConfig)
      setConfig(nextConfig)
      setSelected(Object.keys(nextServers).sort()[0] ?? null)
      onConfigSaved?.()
    } catch (err) {
      notifyError(err, m.removeFailed)
    } finally {
      setSaving(false)
    }
  }

  const reloadMcp = async () => {
    if (!gateway) {
      notify({ kind: 'warning', title: m.gatewayUnavailableTitle, message: m.gatewayUnavailableMessage })

      return
    }

    setReloading(true)

    try {
      await gateway.request('reload.mcp', {
        confirm: true,
        session_id: activeSessionId ?? undefined
      })
      notify({ kind: 'success', title: m.reloadedTitle, message: m.reloadedMessage })
    } catch (err) {
      notifyError(err, m.reloadFailed)
    } finally {
      setReloading(false)
    }
  }

  return (
    <SettingsContent>
      {isBrowserMode && !demoCalloutDismissed && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <Globe className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
          <div className="flex-1 text-amber-700 dark:text-amber-200">
            浏览器演示模式：当前仅显示 3 个示例连接器。安装桌面版可管理真实 MCP 服务器、配置认证和权限。
          </div>
          <button
            className="flex-shrink-0 rounded-md p-1 text-amber-600 hover:bg-amber-500/20 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200"
            onClick={() => setDemoCalloutDismissed(true)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="mb-4 flex items-center justify-end gap-4">
        <Button onClick={() => setSelected(null)} size="xs" variant="text">
          {m.newServer}
        </Button>
        <Button disabled={reloading} onClick={() => void reloadMcp()} size="xs" variant="text">
          {reloading ? m.reloading : m.reload}
        </Button>
      </div>

      <div className="grid min-h-0 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="min-h-64">
          {names.length === 0 ? (
            <EmptyState description={m.emptyDesc} title={m.emptyTitle} />
          ) : (
            <div className="grid gap-0.5">
              {names.map(serverName => {
                const server = servers[serverName]
                const active = selected === serverName
                const version = typeof server.version === 'string' ? server.version : 'v1.0.0'
                const healthy = server.healthy !== false
                const deprecated = server.deprecated === true
                const permissions = Array.isArray(server.permissions) ? server.permissions as string[] : []
                const dependencies = Array.isArray(server.dependencies) ? server.dependencies as string[] : []

                return (
                  <button
                    className={cn(
                      'scroll-mt-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-(--chrome-action-hover)',
                      active ? 'bg-(--ui-bg-tertiary) text-foreground' : 'text-muted-foreground'
                    )}
                    id={`mcp-server-${serverName}`}
                    key={serverName}
                    onClick={() => setSelected(serverName)}
                    type="button"
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="truncate text-sm font-medium flex-1">{serverName}</div>
                      <span className="text-[10px] font-mono text-muted-foreground/70">{version}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Pill>{transportLabel(server)}</Pill>
                      {server.disabled === true && <Pill>{m.disabled}</Pill>}
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]',
                        healthy ? 'text-emerald-600 bg-emerald-500/10' : 'text-red-600 bg-red-500/10'
                      )}>
                        <span className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          healthy ? 'bg-emerald-500' : 'bg-red-500'
                        )} />
                        {healthy ? '正常' : '异常'}
                      </span>
                      {deprecated && (
                        <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] bg-amber-500/10 text-amber-600">
                          已弃用
                        </span>
                      )}
                    </div>
                    {permissions.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-0.5">
                        {permissions.slice(0, 3).map(perm => (
                          <span className="rounded bg-(--ui-bg-quinary) px-1 py-px text-[9px] font-mono text-(--ui-text-tertiary)" key={perm}>
                            {perm}
                          </span>
                        ))}
                        {permissions.length > 3 && (
                          <span className="text-[9px] text-(--ui-text-tertiary)">+{permissions.length - 3}</span>
                        )}
                      </div>
                    )}
                    {dependencies.length > 0 && (
                      <div className="mt-0.5 text-[9px] text-(--ui-text-tertiary)/70 truncate">
                        依赖: {dependencies.join(', ')}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="grid content-start gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Wrench className="size-4 text-muted-foreground" />
            {selected ? m.editServer : m.newServer}
          </div>
          <label className="grid gap-1.5">
            <span className="text-xs text-muted-foreground">{m.name}</span>
            <Input onChange={event => setName(event.currentTarget.value)} placeholder="filesystem" value={name} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs text-muted-foreground">{m.serverJson}</span>
            <Textarea
              className="min-h-80 font-mono text-xs"
              onChange={event => setBody(event.currentTarget.value)}
              spellCheck={false}
              value={body}
            />
          </label>
          <div className="flex items-center justify-between">
            {selected ? (
              <Button
                className="text-destructive hover:text-destructive"
                disabled={saving}
                onClick={() => void removeServer(selected)}
                size="xs"
                variant="text"
              >
                {m.remove}
              </Button>
            ) : (
              <span />
            )}
            <Button disabled={saving} onClick={() => void saveServer()} size="sm">
              {saving ? t.common.saving : m.saveServer}
            </Button>
          </div>
        </div>
      </div>
    </SettingsContent>
  )
}
