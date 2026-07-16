import { useRef, useState } from 'react'

import { codiconIcon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { getHermesConfigDefaults, getHermesConfigRecord, saveHermesConfig } from '@/hermes'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { Archive, Bell, ChevronDown, ChevronRight, Download, Globe, Info, KeyRound, RefreshCw, Settings2, Upload, Wrench, Zap } from '@/lib/icons'
import { notifyError } from '@/store/notifications'

import { useRouteEnumParam } from '../hooks/use-route-enum-param'
import { OverlayIconButton } from '../overlays/overlay-chrome'
import { OverlayMain, OverlayNavItem, OverlaySidebar, OverlaySplitLayout } from '../overlays/overlay-split-layout'
import { OverlayView } from '../overlays/overlay-view'

import { AboutSettings } from './about-settings'
import { AppearanceSettings } from './appearance-settings'
import { ConfigSettings } from './config-settings'
import { ADVANCED_NAV_ITEMS, SECTIONS } from './constants'
import { GatewaySettings } from './gateway-settings'
import { KEYS_VIEWS, KeysSettings, type KeysView } from './keys-settings'
import { McpSettings } from './mcp-settings'
import { NotificationsSettings } from './notifications-settings'
import { PROVIDER_VIEWS, ProvidersSettings, type ProviderView } from './providers-settings'
import { RemoteSettings } from './remote-settings'
import { SessionsSettings } from './sessions-settings'
import { SoulSettings } from './soul-settings'
import type { SettingsPageProps, SettingsView as SettingsViewId } from './types'

const SETTINGS_VIEWS: readonly SettingsViewId[] = [
  ...SECTIONS.map(s => `config:${s.id}` as SettingsViewId),
  'providers',
  'gateway',
  'keys',
  'mcp',
  'notifications',
  'remote',
  'soul',
  'sessions',
  'about'
]

const DEFAULT_VIEWS: readonly SettingsViewId[] = [
  'config:model',
  'soul',
  'config:workspace',
  'config:safety',
  'config:appearance',
  'notifications',
  'about'
]

export function SettingsView({ gateway, onClose, onConfigSaved, onMainModelChanged }: SettingsPageProps) {
  const { t } = useI18n()
  const [activeView, setActiveView] = useRouteEnumParam('tab', SETTINGS_VIEWS, 'config:model' as SettingsViewId)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // Providers subnav (Accounts vs API keys) lives in its own param so each
  // sub-view is deep-linkable and survives a refresh.
  const [providerView, setProviderView] = useRouteEnumParam<ProviderView>('pview', PROVIDER_VIEWS, 'accounts')
  const [keysView, setKeysView] = useRouteEnumParam<KeysView>('kview', KEYS_VIEWS, 'tools')

  const isAdvancedView = (view: SettingsViewId) => {
    if (view.startsWith('config:')) {
      const sectionId = view.slice('config:'.length)
      return ['chat', 'memory', 'voice', 'advanced'].includes(sectionId)
    }
    return ADVANCED_NAV_ITEMS.includes(view as (typeof ADVANCED_NAV_ITEMS)[number])
  }

  // Auto-open advanced section if an advanced view is active
  const effectiveAdvancedOpen = advancedOpen || isAdvancedView(activeView)

  const openProviderView = (view: ProviderView) => {
    setActiveView('providers')
    setProviderView(view)
    setAdvancedOpen(true)
  }

  const openKeysView = (view: KeysView) => {
    setActiveView('keys')
    setKeysView(view)
    setAdvancedOpen(true)
  }

  const setViewAndCloseAdvancedIfDefault = (view: SettingsViewId) => {
    setActiveView(view)
    if (!isAdvancedView(view)) {
      setAdvancedOpen(false)
    }
  }

  const importInputRef = useRef<HTMLInputElement | null>(null)

  const exportConfig = async () => {
    try {
      const cfg = await getHermesConfigRecord()
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'karna-config.json'
      a.click()
      URL.revokeObjectURL(url)
      triggerHaptic('success')
    } catch (err) {
      notifyError(err, t.settings.exportFailed)
    }
  }

  const resetConfig = async () => {
    if (!window.confirm(t.settings.resetConfirm)) {
      return
    }

    try {
      await saveHermesConfig(await getHermesConfigDefaults())
      triggerHaptic('success')
      onConfigSaved?.()
    } catch (err) {
      notifyError(err, t.settings.resetFailed)
    }
  }

  const defaultSectionIds = ['model', 'workspace', 'safety', 'appearance']

  return (
    <OverlayView closeLabel={t.settings.closeSettings} onClose={onClose}>
      <OverlaySplitLayout>
        <OverlaySidebar>
          {/* Default settings - main user-facing options */}
          {defaultSectionIds.map(sectionId => {
            const section = SECTIONS.find(s => s.id === sectionId)
            if (!section) return null
            const view = `config:${section.id}` as SettingsViewId

            return (
              <OverlayNavItem
                active={activeView === view}
                icon={section.icon}
                key={section.id}
                label={section.label}
                onClick={() => setViewAndCloseAdvancedIfDefault(view)}
              />
            )
          })}
          <OverlayNavItem
            active={activeView === 'soul'}
            icon={codiconIcon('person')}
            label={t.settings.nav.soul}
            onClick={() => setViewAndCloseAdvancedIfDefault('soul')}
          />
          <OverlayNavItem
            active={activeView === 'notifications'}
            icon={Bell}
            label={t.settings.nav.notifications}
            onClick={() => setViewAndCloseAdvancedIfDefault('notifications')}
          />

          {/* Advanced settings collapsible section */}
          <button
            className="mt-2 flex w-full items-center gap-1.5 px-2.5 py-1 text-left text-[0.7rem] font-medium uppercase tracking-[0.1em] text-muted-foreground/70 transition-colors hover:text-foreground"
            onClick={() => setAdvancedOpen(!effectiveAdvancedOpen)}
            type="button"
          >
            {effectiveAdvancedOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            <span>高级设置</span>
          </button>

          {effectiveAdvancedOpen && (
            <>
              {['chat', 'advanced'].map(sectionId => {
                const section = SECTIONS.find(s => s.id === sectionId)
                if (!section) return null
                const view = `config:${section.id}` as SettingsViewId

                return (
                  <OverlayNavItem
                    active={activeView === view}
                    icon={section.icon}
                    key={section.id}
                    label={section.label}
                    nested
                    onClick={() => setActiveView(view)}
                  />
                )
              })}
              <OverlayNavItem
                active={activeView === 'providers'}
                icon={Zap}
                label="模型提供商"
                nested
                onClick={() => setActiveView('providers')}
              />
              {activeView === 'providers' && (
                <div className="ml-3.5 flex flex-col gap-0.5 pl-1.5">
                  <OverlayNavItem
                    active={providerView === 'accounts'}
                    icon={codiconIcon('account')}
                    label={t.settings.nav.providerAccounts}
                    nested
                    onClick={() => openProviderView('accounts')}
                  />
                  <OverlayNavItem
                    active={providerView === 'keys'}
                    icon={KeyRound}
                    label={t.settings.nav.providerApiKeys}
                    nested
                    onClick={() => openProviderView('keys')}
                  />
                </div>
              )}
              <OverlayNavItem
                active={activeView === 'gateway'}
                icon={Globe}
                label="连接诊断"
                nested
                onClick={() => setActiveView('gateway')}
              />
              <OverlayNavItem
                active={activeView === 'keys'}
                icon={KeyRound}
                label="API 密钥"
                nested
                onClick={() => setActiveView('keys')}
              />
              {activeView === 'keys' && (
                <div className="ml-3.5 flex flex-col gap-0.5 pl-1.5">
                  <OverlayNavItem
                    active={keysView === 'tools'}
                    icon={Wrench}
                    label={t.settings.nav.keysTools}
                    nested
                    onClick={() => openKeysView('tools')}
                  />
                  <OverlayNavItem
                    active={keysView === 'settings'}
                    icon={Settings2}
                    label={t.settings.nav.keysSettings}
                    nested
                    onClick={() => openKeysView('settings')}
                  />
                </div>
              )}
              <OverlayNavItem
                active={activeView === 'mcp'}
                icon={Wrench}
                label={t.settings.nav.mcp}
                nested
                onClick={() => setActiveView('mcp')}
              />
              <OverlayNavItem
                active={activeView === 'remote'}
                icon={codiconIcon('device-mobile')}
                label={t.settings.nav.remote}
                nested
                onClick={() => setActiveView('remote')}
              />
              <OverlayNavItem
                active={activeView === 'sessions'}
                icon={Archive}
                label="会话数据"
                nested
                onClick={() => setActiveView('sessions')}
              />
            </>
          )}

          <div className="my-2 h-px bg-border/30" />
          <OverlayNavItem
            active={activeView === 'about'}
            icon={Info}
            label={t.settings.nav.about}
            onClick={() => setViewAndCloseAdvancedIfDefault('about')}
          />
          <div className="mt-auto flex items-center gap-1 pt-2">
            <Tip label={t.settings.exportConfig}>
              <OverlayIconButton onClick={() => void exportConfig()}>
                <Download className="size-3.5" />
              </OverlayIconButton>
            </Tip>
            <Tip label={t.settings.importConfig}>
              <OverlayIconButton
                onClick={() => {
                  triggerHaptic('open')
                  importInputRef.current?.click()
                }}
              >
                <Upload className="size-3.5" />
              </OverlayIconButton>
            </Tip>
            <Tip label={t.settings.resetToDefaults}>
              <OverlayIconButton
                className="hover:text-destructive"
                onClick={() => {
                  triggerHaptic('warning')
                  void resetConfig()
                }}
              >
                <RefreshCw className="size-3.5" />
              </OverlayIconButton>
            </Tip>
          </div>
        </OverlaySidebar>

        <OverlayMain className="px-0 pb-0 pt-[calc(var(--titlebar-height)/2+1rem)]">
          {activeView === 'config:appearance' ? (
            <AppearanceSettings />
          ) : activeView === 'about' ? (
            <AboutSettings />
          ) : activeView === 'gateway' ? (
            <GatewaySettings />
          ) : activeView.startsWith('config:') ? (
            <ConfigSettings
              activeSectionId={activeView.slice('config:'.length)}
              importInputRef={importInputRef}
              onConfigSaved={onConfigSaved}
              onMainModelChanged={onMainModelChanged}
            />
          ) : activeView === 'providers' ? (
            <ProvidersSettings onClose={onClose} onViewChange={setProviderView} view={providerView} />
          ) : activeView === 'keys' ? (
            <KeysSettings view={keysView} />
          ) : activeView === 'mcp' ? (
            <McpSettings gateway={gateway} onConfigSaved={onConfigSaved} />
          ) : activeView === 'notifications' ? (
            <NotificationsSettings />
          ) : activeView === 'remote' ? (
            <RemoteSettings />
          ) : activeView === 'soul' ? (
            <SoulSettings />
          ) : (
            <SessionsSettings />
          )}
        </OverlayMain>
      </OverlaySplitLayout>
    </OverlayView>
  )
}

export { SettingsView as SettingsPage }
