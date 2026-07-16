import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

import { Codicon } from '@/components/ui/codicon'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileText,
  Globe,
  Loader2,
  Monitor,
  Pause,
  RefreshCw,
  Trash2,
  X,
  XCircle
} from '@/lib/icons'
import { cn } from '@/lib/utils'

import { CONTROL_TEXT } from './constants'
import { ListRow, Pill, SettingsContent } from './primitives'
import type { PairingOfferV1, PairedDeviceInfo, RemoteGatewayStatus } from '@/global'

interface NetworkInterface {
  name: string
  address: string
}

const DEFAULT_PORT = 8765

type PairingPhase = 'idle' | 'creating' | 'waiting' | 'device-connected' | 'confirming' | 'success' | 'failed'
type EmergencyConfirmPhase = 'idle' | 'confirming'

export function RemoteSettings() {
  const { t } = useI18n()
  const r = t.settings.remote

  const [gatewayEnabled, setGatewayEnabled] = useState(false)
  const [selectedInterface, setSelectedInterface] = useState('')
  const [networkInterfaces, setNetworkInterfaces] = useState<NetworkInterface[]>([])
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false)
  const [pairingOffer, setPairingOffer] = useState<PairingOfferV1 | null>(null)
  const [sasCode, setSasCode] = useState<string | null>(null)
  const [waitingForConfirmation, setWaitingForConfirmation] = useState(false)
  const [pairingPhase, setPairingPhase] = useState<PairingPhase>('idle')
  const [pairingError, setPairingError] = useState<string | null>(null)
  const [pairedDeviceName, setPairedDeviceName] = useState<string | null>(null)
  const [devices, setDevices] = useState<PairedDeviceInfo[]>([])
  const [devicesLoading, setDevicesLoading] = useState(false)
  const [gatewayStatus, setGatewayStatus] = useState<RemoteGatewayStatus | null>(null)
  const [emergencyPhase, setEmergencyPhase] = useState<EmergencyConfirmPhase>('idle')
  const [statusLoading, setStatusLoading] = useState(false)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadStatus = useCallback(async () => {
    if (!window.karnaDesktop?.remote) return
    setStatusLoading(true)
    try {
      const result = await window.karnaDesktop.remote.getStatus()
      if (result.ok && result.status) {
        setGatewayStatus(result.status)
        setGatewayEnabled(result.status.running)
        if (result.status.privateInterfaces?.length) {
          const ifaces = result.status.privateInterfaces.map(i => ({ name: i.name, address: i.address }))
          setNetworkInterfaces(ifaces)
          if (!selectedInterface && ifaces.length > 0) {
            setSelectedInterface(ifaces[0].address)
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setStatusLoading(false)
    }
  }, [selectedInterface])

  const loadDevices = useCallback(async () => {
    if (!window.karnaDesktop?.remote) return
    setDevicesLoading(true)
    try {
      const result = await window.karnaDesktop.remote.listDevices()
      if (result.ok && result.devices) {
        setDevices(result.devices)
      }
    } catch {
      // ignore
    } finally {
      setDevicesLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
    loadDevices()
  }, [loadStatus, loadDevices])

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const pollPairingState = useCallback(
    async (token: string) => {
      if (!window.karnaDesktop?.remote) return
      try {
        const result = await window.karnaDesktop.remote.getPairingState(token)
        if (result.ok && result.pairing) {
          const pairing = result.pairing
          if (pairing.deviceConnected || pairing.deviceFingerprint) {
            setPairingPhase('device-connected')
            setWaitingForConfirmation(true)
            if (pairing.deviceInfo?.name) {
              setPairedDeviceName(pairing.deviceInfo.name)
            }
            clearPolling()
          }
        }
      } catch {
        // ignore
      }
    },
    [clearPolling]
  )

  const handleStartGateway = async (enabled: boolean) => {
    if (!window.karnaDesktop?.remote) return
    if (enabled) {
      try {
        await window.karnaDesktop.remote.start({ bindAddress: selectedInterface || '0.0.0.0' })
        setGatewayEnabled(true)
      } catch {
        setGatewayEnabled(false)
      }
    } else {
      try {
        await window.karnaDesktop.remote.stop()
        setGatewayEnabled(false)
      } catch {
        // ignore
      }
    }
    loadStatus()
  }

  const handleAddDevice = async () => {
    if (!window.karnaDesktop?.remote) return

    setPairingPhase('creating')
    setPairingError(null)
    setSasCode(null)
    setWaitingForConfirmation(false)
    setPairedDeviceName(null)
    setIsPairingModalOpen(true)

    try {
      const result = await window.karnaDesktop.remote.createPairing()
      if (result.ok && result.offer) {
        const offer = result.offer
        setPairingOffer(offer)
        setSasCode(offer.sasCode)
        setPairingPhase('waiting')

        clearPolling()
        pollTimerRef.current = setInterval(() => {
          pollPairingState(offer.token)
        }, 1000)
      } else {
        setPairingError(result.error || '创建配对失败')
        setPairingPhase('failed')
      }
    } catch (err) {
      setPairingError(err instanceof Error ? err.message : '创建配对失败')
      setPairingPhase('failed')
    }
  }

  const handleConfirmMatch = async () => {
    if (!pairingOffer || !sasCode || !window.karnaDesktop?.remote) return

    setPairingPhase('confirming')
    clearPolling()

    try {
      const result = await window.karnaDesktop.remote.confirmPairing(
        pairingOffer.token,
        sasCode,
        pairedDeviceName ? { name: pairedDeviceName } : undefined
      )
      if (result.ok && result.success) {
        setPairingPhase('success')
        loadDevices()
      } else {
        setPairingError(result.reason || result.error || '配对确认失败')
        setPairingPhase('failed')
      }
    } catch (err) {
      setPairingError(err instanceof Error ? err.message : '配对确认失败')
      setPairingPhase('failed')
    }
  }

  const handleMismatch = async () => {
    if (!pairingOffer || !window.karnaDesktop?.remote) return
    clearPolling()
    try {
      await window.karnaDesktop.remote.cancelPairing(pairingOffer.token)
    } catch {
      // ignore
    }
    setPairingError('确认码不匹配，配对已取消')
    setPairingPhase('failed')
  }

  const handleClosePairingModal = async () => {
    if (pairingOffer && window.karnaDesktop?.remote) {
      try {
        await window.karnaDesktop.remote.cancelPairing(pairingOffer.token)
      } catch {
        // ignore
      }
    }
    clearPolling()
    setIsPairingModalOpen(false)
    setPairingOffer(null)
    setSasCode(null)
    setWaitingForConfirmation(false)
    setPairingPhase('idle')
    setPairingError(null)
    setPairedDeviceName(null)
  }

  const handlePauseDevice = async (deviceId: string) => {
    if (!window.karnaDesktop?.remote) return
    const device = devices.find(d => d.id === deviceId)
    if (!device) return
    try {
      await window.karnaDesktop.remote.updateDevice(deviceId, { paused: !device.paused })
      loadDevices()
    } catch {
      // ignore
    }
  }

  const handleRevokeDevice = async (deviceId: string) => {
    if (!window.karnaDesktop?.remote) return
    if (!window.confirm(r.revokeConfirm)) return
    try {
      await window.karnaDesktop.remote.revokeDevice(deviceId)
      loadDevices()
    } catch {
      // ignore
    }
  }

  const handleEmergencyDisconnect = async () => {
    if (emergencyPhase === 'confirming') {
      if (!window.karnaDesktop?.remote) return
      try {
        await window.karnaDesktop.remote.disconnectAll()
        loadDevices()
      } catch {
        // ignore
      }
      setEmergencyPhase('idle')
    } else {
      setEmergencyPhase('confirming')
    }
  }

  const handleCancelEmergency = () => {
    setEmergencyPhase('idle')
  }

  useEffect(() => {
    return () => {
      clearPolling()
    }
  }, [clearPolling])

  const selectedInterfaceInfo = networkInterfaces.find(iface => iface.address === selectedInterface)
  const displayAddress = selectedInterfaceInfo?.address || (gatewayStatus?.privateInterfaces?.[0]?.address ?? '127.0.0.1')

  const formatLastSeen = (timestamp?: number) => {
    if (!timestamp) return r.never
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return r.justNow
    if (minutes < 60) return r.minutesAgo.replace('{0}', String(minutes))
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return r.hoursAgo.replace('{0}', String(hours))
    const days = Math.floor(hours / 24)
    return r.daysAgo.replace('{0}', String(days))
  }

  return (
    <SettingsContent>
      <div className="mb-5">
        <div className="flex items-center gap-2 text-[length:var(--conversation-text-font-size)] font-medium">
          <Codicon className="size-4 text-muted-foreground" name="device-mobile" />
          {r.title}
        </div>
        <p className="mt-2 max-w-2xl text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
          {r.intro}
        </p>
      </div>

      <div className="grid gap-1">
        <ListRow
          action={
            <Switch
              checked={gatewayEnabled}
              onCheckedChange={handleStartGateway}
              disabled={statusLoading}
            />
          }
          description={r.enableRemoteAccessDesc}
          title={r.enableRemoteAccess}
        />

        {gatewayEnabled && (
          <>
            <ListRow
              action={
                <Select value={selectedInterface} onValueChange={setSelectedInterface}>
                  <SelectTrigger className={cn('w-64 h-8', CONTROL_TEXT)}>
                    <SelectValue placeholder={r.selectInterface} />
                  </SelectTrigger>
                  <SelectContent>
                    {networkInterfaces.length > 0 ? (
                      networkInterfaces.map(iface => (
                        <SelectItem key={iface.address} value={iface.address}>
                          {iface.name} ({iface.address})
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="0.0.0.0">0.0.0.0 (所有接口)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              }
              description={r.listenAddressDesc}
              title={r.listenAddress}
            />

            <ListRow
              action={
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-2.5 py-1.5 font-mono text-xs">
                    <Monitor className="size-3.5 text-muted-foreground" />
                    <span>{displayAddress}:{DEFAULT_PORT}</span>
                  </div>
                </div>
              }
              description={r.lanAddressDesc}
              title={r.lanAddress}
            />
          </>
        )}
      </div>

      {gatewayEnabled && (
        <>
          <div className="mt-6 mb-3 flex items-center justify-between">
            <div className="text-[length:var(--conversation-text-font-size)] font-medium">
              {r.pairedDevices}
              {devices.length > 0 && (
                <span className="ml-2 text-sm text-muted-foreground">({devices.length})</span>
              )}
            </div>
            <Button
              onClick={handleAddDevice}
              size="sm"
              disabled={pairingPhase !== 'idle' && pairingPhase !== 'success' && pairingPhase !== 'failed'}
            >
              <Codicon className="size-3.5" name="add" />
              {r.addDevice}
            </Button>
          </div>

          {devicesLoading ? (
            <div className="grid min-h-32 place-items-center rounded-xl border border-(--ui-stroke-tertiary)">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : devices.length === 0 ? (
            <div className="grid min-h-32 place-items-center rounded-xl border border-dashed border-(--ui-stroke-tertiary) text-center">
              <div>
                <div className="text-sm text-muted-foreground">{r.noDevices}</div>
                <div className="mt-1 text-xs text-muted-foreground/70">{r.addDeviceHint}</div>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-(--ui-stroke-tertiary)">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                    <th className="px-3 py-2 text-left font-medium">{r.deviceName}</th>
                    <th className="px-3 py-2 text-left font-medium">{r.fingerprint}</th>
                    <th className="px-3 py-2 text-left font-medium">{r.lastSeen}</th>
                    <th className="px-3 py-2 text-left font-medium">{r.permissions}</th>
                    <th className="px-3 py-2 text-left font-medium">{r.lastIp}</th>
                    <th className="px-3 py-2 text-right font-medium">{r.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map(device => (
                    <tr key={device.id} className="border-b border-(--ui-stroke-tertiary)/50 last:border-0 hover:bg-(--chrome-action-hover)/50">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Codicon className="size-4 text-muted-foreground" name="device-mobile" />
                          <div>
                            <div className="text-[length:var(--conversation-text-font-size)] font-medium">
                              {device.name}
                              {device.paused && (
                                <Pill tone="muted">
                                  <Pause className="size-3" />
                                </Pill>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[0.68rem] text-muted-foreground/60">
                        {device.fingerprint ? `${device.fingerprint.slice(0, 17)}...` : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                        {formatLastSeen(device.lastSeenAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Pill tone={device.permissions === 'full' ? 'primary' : 'muted'}>
                          {device.permissions === 'full' ? r.permissionFull : r.permissionReadonly}
                        </Pill>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                        {device.lastIp || '-'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            onClick={() => handlePauseDevice(device.id)}
                            size="xs"
                            title={device.paused ? r.resume : r.pause}
                            variant="ghost"
                          >
                            {device.paused ? <RefreshCw className="size-3.5" /> : <Pause className="size-3.5" />}
                          </Button>
                          <Button
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleRevokeDevice(device.id)}
                            size="xs"
                            title={r.revoke}
                            variant="ghost"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="mt-6 grid gap-1">
        <ListRow
          action={
            <Button size="sm" variant="textStrong" disabled>
              <FileText />
              {r.viewAuditLog}
            </Button>
          }
          description={r.viewAuditLogDesc}
          title={r.auditLog}
        />
      </div>

      {gatewayEnabled && devices.length > 0 && (
        <div className="mt-6">
          {emergencyPhase === 'confirming' ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                <div className="flex-1">
                  <div className="font-medium text-destructive">{r.emergencyConfirmTitle}</div>
                  <div className="mt-1 text-sm text-destructive/80">{r.emergencyDisconnectConfirm}</div>
                  <div className="mt-3 flex gap-2">
                    <Button onClick={handleCancelEmergency} size="sm" variant="outline">
                      {t.common.cancel}
                    </Button>
                    <Button onClick={handleEmergencyDisconnect} size="sm" variant="destructive">
                      <X className="size-3.5" />
                      {r.emergencyDisconnect}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={handleEmergencyDisconnect}
              variant="destructive"
            >
              <X />
              {r.emergencyDisconnect}
            </Button>
          )}
        </div>
      )}

      <Dialog open={isPairingModalOpen} onOpenChange={open => {
        if (!open) handleClosePairingModal()
      }}>
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle icon={Globe}>
              {pairingPhase === 'success' ? r.pairingSuccess :
               pairingPhase === 'failed' ? r.pairingFailed :
               r.qrPairing}
            </DialogTitle>
            <DialogDescription>
              {pairingPhase === 'waiting' && r.waitingForDevice}
              {pairingPhase === 'device-connected' && (pairedDeviceName
                ? r.deviceConnectedNamed.replace('{0}', pairedDeviceName)
                : r.deviceConnected)}
              {pairingPhase === 'confirming' && r.confirming}
              {pairingPhase === 'success' && r.pairingSuccessDesc}
              {pairingPhase === 'failed' && (pairingError || r.pairingFailedDesc)}
              {pairingPhase === 'creating' && r.creatingPairing}
            </DialogDescription>
          </DialogHeader>

          {pairingPhase === 'creating' && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="size-12 animate-spin text-primary" />
            </div>
          )}

          {(pairingPhase === 'waiting' || pairingPhase === 'device-connected' || pairingPhase === 'confirming') && pairingOffer && (
            <>
              <div className="flex justify-center">
                <div className="rounded-lg border border-(--ui-stroke-tertiary) bg-white p-4">
                  {pairingPhase === 'waiting' ? (
                    <QRCodeSVG
                      value={pairingOffer.qrPayload}
                      size={192}
                      level="M"
                      includeMargin
                    />
                  ) : pairingPhase === 'device-connected' || pairingPhase === 'confirming' ? (
                    <div className="grid size-48 place-items-center">
                      {pairingPhase === 'confirming' ? (
                        <Loader2 className="size-12 animate-spin text-primary" />
                      ) : (
                        <CheckCircle2 className="size-16 text-green-500" />
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              {pairingPhase === 'waiting' && (
                <div className="text-center text-xs text-muted-foreground">
                  {r.scanQrHint}
                </div>
              )}

              {(pairingPhase === 'device-connected' || pairingPhase === 'confirming') && sasCode && (
                <div className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) p-4">
                  <div className="text-center text-[length:var(--conversation-caption-font-size)] font-medium">
                    {r.confirmationCode}
                  </div>
                  <div className="mt-2 text-center text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                    {r.confirmationCodeHint}
                  </div>
                  <div className="mt-3 flex justify-center gap-2">
                    {sasCode.split('').map((digit, i) => (
                      <div
                        key={i}
                        className="flex size-12 items-center justify-center rounded-lg border-2 border-primary bg-primary/5 font-mono text-2xl font-bold text-primary"
                      >
                        {digit}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {pairingPhase === 'success' && (
            <div className="flex flex-col items-center justify-center py-4">
              <div className="mb-4 rounded-full bg-green-500/10 p-4">
                <Check className="size-12 text-green-500" />
              </div>
              <div className="text-center text-sm text-muted-foreground">
                {pairedDeviceName
                  ? r.devicePairedNamed.replace('{0}', pairedDeviceName)
                  : r.devicePaired}
              </div>
            </div>
          )}

          {pairingPhase === 'failed' && (
            <div className="flex flex-col items-center justify-center py-4">
              <div className="mb-4 rounded-full bg-destructive/10 p-4">
                <XCircle className="size-12 text-destructive" />
              </div>
            </div>
          )}

          <DialogFooter>
            {pairingPhase === 'device-connected' && (
              <>
                <Button onClick={handleMismatch} variant="outline">
                  <X className="size-3.5" />
                  {r.codeMismatch}
                </Button>
                <Button onClick={handleConfirmMatch}>
                  <Check className="size-3.5" />
                  {r.codeMatch}
                </Button>
              </>
            )}
            {(pairingPhase === 'waiting' || pairingPhase === 'creating' || pairingPhase === 'confirming') && (
              <Button onClick={handleClosePairingModal} variant="text">
                {t.common.cancel}
              </Button>
            )}
            {(pairingPhase === 'success' || pairingPhase === 'failed') && (
              <Button onClick={handleClosePairingModal}>
                {t.common.done}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsContent>
  )
}
