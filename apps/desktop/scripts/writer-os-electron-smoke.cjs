const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const CDP_PORT = Number(process.env.KARNA_ELECTRON_SMOKE_PORT || 9339)
const TIMEOUT_MS = Number(process.env.KARNA_ELECTRON_SMOKE_TIMEOUT_MS || 90000)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitFor(fn, label, timeoutMs = TIMEOUT_MS) {
  const start = Date.now()
  let lastError = null
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await fn()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await sleep(500)
  }
  const suffix = lastError ? ` Last error: ${lastError.message || lastError}` : ''
  throw new Error(`Timed out waiting for ${label}.${suffix}`)
}

function electronBinary() {
  const electron = require('electron')
  if (typeof electron === 'string') return electron
  throw new Error('Cannot resolve Electron binary from package "electron"')
}

async function cdpTargets() {
  const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)
  if (!response.ok) throw new Error(`CDP target list failed: ${response.status}`)
  return response.json()
}

class CdpClient {
  constructor(wsUrl) {
    this.nextId = 1
    this.pending = new Map()
    this.ws = new WebSocket(wsUrl)
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket open timeout')), 15000)
      this.ws.addEventListener('open', () => {
        clearTimeout(timer)
        resolve()
      }, { once: true })
      this.ws.addEventListener('error', event => {
        clearTimeout(timer)
        reject(new Error(`CDP WebSocket error: ${event.message || 'unknown'}`))
      }, { once: true })
    })
    this.ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data)
      if (!msg.id) return
      const slot = this.pending.get(msg.id)
      if (!slot) return
      this.pending.delete(msg.id)
      if (msg.error) slot.reject(new Error(`${msg.error.message || 'CDP error'} ${msg.error.data || ''}`.trim()))
      else slot.resolve(msg.result)
    })
  }

  async send(method, params = {}) {
    await this.ready
    const id = this.nextId++
    const payload = JSON.stringify({ id, method, params })
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
    this.ws.send(payload)
    return result
  }

  async eval(expression, awaitPromise = true) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      timeout: 60000
    })
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.text || 'Evaluation failed'
      const detail = result.exceptionDetails.exception?.description || ''
      throw new Error(`${text}: ${detail}`)
    }
    return result.result?.value
  }

  close() {
    try { this.ws.close() } catch {}
  }
}

async function main() {
  const distIndex = path.join(ROOT, 'dist', 'index.html')
  if (!fs.existsSync(distIndex)) {
    throw new Error('dist/index.html is missing. Run npm run build before Electron smoke.')
  }

  const child = spawn(electronBinary(), [`--remote-debugging-port=${CDP_PORT}`, '.'], {
    cwd: ROOT,
    env: {
      ...process.env,
      HERMES_DESKTOP_BOOT_FAKE: '1',
      HERMES_DESKTOP_BOOT_FAKE_STEP_MS: '40',
      KARNA_ELECTRON_SMOKE: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const logs = []
  child.stdout.on('data', chunk => logs.push(String(chunk)))
  child.stderr.on('data', chunk => logs.push(String(chunk)))

  let cdp = null
  try {
    const target = await waitFor(async () => {
      const targets = await cdpTargets()
      return targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
    }, 'Electron page CDP target')

    cdp = new CdpClient(target.webSocketDebuggerUrl)
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')

    await waitFor(async () => cdp.eval('document.readyState === "complete" || document.readyState === "interactive"'), 'renderer DOM ready')
    const title = await cdp.eval('document.title')
    const hasBridge = await waitFor(async () => cdp.eval('Boolean(window.karnaDesktop && window.karnaDesktop.api)'), 'karnaDesktop IPC bridge')
    if (!hasBridge) throw new Error('window.karnaDesktop.api is not available')

    const previewSummary = await cdp.eval(`(async () => {
      if (!window.karnaDesktop.writerPreview) throw new Error('writerPreview bridge is unavailable')
      const created = await window.karnaDesktop.writerPreview.create({
        filePath: ${JSON.stringify(path.join(ROOT, 'package.json'))},
        kind: 'text'
      })
      if (!created.ok) throw new Error(created.error || 'preview creation failed')
      const manifest = await window.karnaDesktop.writerPreview.get(created.previewId)
      const released = await window.karnaDesktop.writerPreview.release(created.previewId)
      return {
        ok: Boolean(manifest.ok && manifest.format === 'text' && JSON.parse(manifest.content || '{}').name === 'karna'),
        released
      }
    })()`)
    if (!previewSummary.ok || !previewSummary.released) throw new Error(`Writer preview IPC lifecycle failed: ${JSON.stringify(previewSummary)}`)

    const apiSummary = await cdp.eval(`(async () => {
      const projects = await window.karnaDesktop.api({ path: '/api/writer/projects?includeArchived=1', method: 'GET' })
      const rows = projects.projects || []
      const smoke = rows.find(p => p.slug === 'writer-os-smoke-lab' || p.id === 'writer-os-smoke-lab') || rows[0]
      if (!smoke) throw new Error('No writer project available for smoke verification')
      const ref = smoke.slug || smoke.id
      const [rag, verify, bench, audit, artifacts] = await Promise.all([
        window.karnaDesktop.api({ path: '/api/writer/projects/' + encodeURIComponent(ref) + '/os/rag', method: 'GET' }),
        window.karnaDesktop.api({ path: '/api/writer/projects/' + encodeURIComponent(ref) + '/os/rag', method: 'POST', body: { action: 'verify-vector-db' } }),
        window.karnaDesktop.api({ path: '/api/writer/projects/' + encodeURIComponent(ref) + '/os/benchmark', method: 'GET' }),
        window.karnaDesktop.api({ path: '/api/writer/projects/' + encodeURIComponent(ref) + '/os/benchmark', method: 'POST', body: { action: 'audit' } }),
        window.karnaDesktop.api({ path: '/api/writer/projects/' + encodeURIComponent(ref) + '/os/artifacts', method: 'POST', body: { action: 'verify-delivery' } })
      ])
      return {
        project: ref,
        projects: rows.length,
        ragMode: rag.stats && rag.stats.mode,
        chunks: rag.stats && rag.stats.chunks,
        vectorVerified: Boolean(verify.vector_db_verification && verify.vector_db_verification.ok),
        vectorRows: verify.vector_db_verification && verify.vector_db_verification.segment_rows,
        benchmarkRuns: (bench.runs || []).length,
        auditStatus: (audit.audit || audit.report || {}).status,
        deliveryOk: Boolean((artifacts.verification || artifacts.report || {}).ok !== false),
        deliveryPassed: (artifacts.verification || artifacts.report || {}).passed || 0
      }
    })()`)

    if (!apiSummary.vectorVerified) throw new Error('Vector DB verification failed through Electron IPC')
    if (!apiSummary.auditStatus) throw new Error('Acceptance audit did not return through Electron IPC')
    if (!apiSummary.deliveryOk) throw new Error('Delivery verification failed through Electron IPC')

    const aliasSummary = await cdp.eval(`(async () => {
      const ref = ${JSON.stringify(apiSummary.project)}
      const aliases = ['bible', 'wiki', 'graph', 'state', 'critic', 'memory', 'search']
      const checks = await Promise.all(aliases.map(async alias => {
        const result = await window.karnaDesktop.api({
          path: '/api/writer/projects/' + encodeURIComponent(ref) + '/os/' + alias,
          method: 'GET'
        })
        return { alias, ok: Boolean(result && result.ok !== false && !result.error) }
      }))
      return { checks, ok: checks.every(check => check.ok) }
    })()`)

    if (!aliasSummary.ok) throw new Error(`Writer OS alias route verification failed: ${JSON.stringify(aliasSummary.checks)}`)

    const uiSummary = await cdp.eval(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms))
      const seen = {}
      for (const route of ['/karna/writer', '/karna/soul', '/karna']) {
        history.pushState({}, '', route)
        window.dispatchEvent(new PopStateEvent('popstate'))
        await wait(900)
        seen[route] = document.body.innerText.slice(0, 8000)
      }
      return {
        writer: /作品工坊|Writer OS|长篇创作/.test(seen['/karna/writer']),
        soul: /Soul 工坊|Soul Workshop|创建第一个 Soul|作者/.test(seen['/karna/soul']),
        hub: /Karna|工坊|多智能体/.test(seen['/karna']),
        writerText: seen['/karna/writer'].slice(0, 240),
        soulText: seen['/karna/soul'].slice(0, 180)
      }
    })()`)

    if (!uiSummary.writer) throw new Error(`Writer workshop route did not render expected text: ${uiSummary.writerText}`)
    if (!uiSummary.soul) throw new Error(`Soul workshop route did not render expected text: ${uiSummary.soulText}`)
    if (!uiSummary.hub) throw new Error('Karna hub route did not render expected text')

    console.log(JSON.stringify({
      ok: true,
      title,
      bridge: true,
      preview: previewSummary,
      api: apiSummary,
      aliases: aliasSummary,
      ui: { writer: uiSummary.writer, soul: uiSummary.soul, hub: uiSummary.hub }
    }, null, 2))
  } finally {
    if (cdp) cdp.close()
    if (!child.killed) child.kill()
    await sleep(1000)
    if (!child.killed) child.kill('SIGKILL')
    if (process.env.KARNA_ELECTRON_SMOKE_DEBUG_LOGS === '1') {
      console.error(logs.join('').slice(-12000))
    }
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error)
  process.exit(1)
})
