import { useEffect, useState } from 'react'

import { Switch } from '@/components/ui/switch'

import { ListRow } from './primitives'

export function DesktopSettings({ chinese }: { chinese: boolean }) {
  const bridge = window.hermesDesktop?.settings
  const [autostart, setAutostart] = useState(false)
  const [shortcut, setShortcut] = useState(false)
  const [installDir, setInstallDir] = useState('')
  const [busy, setBusy] = useState<'autostart' | 'shortcut' | null>(null)

  useEffect(() => {
    if (!bridge) return
    void Promise.all([bridge.getAutostart(), bridge.getDesktopShortcut(), bridge.getInstallation()]).then(([start, link, install]) => {
      setAutostart(start.enabled)
      setShortcut(link.enabled)
      setInstallDir(install.directory)
    })
  }, [bridge])

  return (
    <div className="mb-5 divide-y divide-border/60 rounded-xl border border-border/70 px-4">
      <ListRow
        action={<Switch checked={autostart} disabled={busy === 'autostart'} onCheckedChange={async enabled => {
          if (!bridge) return
          setBusy('autostart')
          try { setAutostart((await bridge.setAutostart(enabled)).enabled) } finally { setBusy(null) }
        }} />}
        description={chinese ? '登录 Windows 后在系统托盘中启动，不弹出主窗口。' : 'Start in the system tray after signing in to Windows.'}
        title={chinese ? '开机自启动' : 'Launch at startup'}
      />
      <ListRow
        action={<Switch checked={shortcut} disabled={busy === 'shortcut'} onCheckedChange={async enabled => {
          if (!bridge) return
          setBusy('shortcut')
          try { setShortcut((await bridge.setDesktopShortcut(enabled)).enabled) } finally { setBusy(null) }
        }} />}
        description={chinese ? '在当前用户桌面创建或删除 Karna 快捷方式。' : 'Create or remove the Karna shortcut for this user.'}
        title={chinese ? '桌面快捷方式' : 'Desktop shortcut'}
      />
      <ListRow
        description={chinese ? '应用位置只能通过重新安装修改；工作空间可在下方随时更改。' : 'Change this location by reinstalling. The workspace below can be changed anytime.'}
        hint={installDir || '—'}
        title={chinese ? '应用安装位置' : 'Application location'}
      />
    </div>
  )
}
