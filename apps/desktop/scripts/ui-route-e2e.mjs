import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

import { chromium } from 'playwright'

const desktopRoot = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const viteBin = path.resolve(require.resolve('vite'), '..', '..', '..', 'bin', 'vite.js')
const outputDir = path.join(desktopRoot, 'test-results', 'ui-routes')
const baseUrl = `http://127.0.0.1:${process.env.KARNA_E2E_PORT || '4174'}`
const routes = [
  ['home', '/'],
  ['skills', '/skills'],
  ['flow', '/karna/flow'],
  ['writer', '/karna/writer'],
  ['soul', '/karna/soul'],
  ['mcp', '/karna/mcp'],
  ['artifacts', '/artifacts'],
  ['settings', '/settings']
]
const responsiveRoutes = [
  ['writer', '/karna/writer'],
  ['flow', '/karna/flow'],
  ['settings', '/settings']
]

fs.rmSync(outputDir, { force: true, recursive: true })
fs.mkdirSync(outputDir, { recursive: true })

const preview = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', baseUrl.split(':').at(-1), '--strictPort'], {
  cwd: desktopRoot,
  env: { ...process.env },
  stdio: ['ignore', 'pipe', 'pipe']
})
let previewOutput = ''
preview.stdout.on('data', chunk => { previewOutput += chunk })
preview.stderr.on('data', chunk => { previewOutput += chunk })

const waitForPreview = async () => {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (preview.exitCode !== null) throw new Error(`Vite preview exited early (${preview.exitCode}).\n${previewOutput}`)
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // Preview is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${baseUrl}.\n${previewOutput}`)
}

let browser
try {
  await waitForPreview()
  const edgePath = process.platform === 'win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : ''
  browser = await chromium.launch(edgePath && fs.existsSync(edgePath) ? { executablePath: edgePath } : {})
  const context = await browser.newContext({ viewport: { height: 800, width: 1280 } })
  const page = await context.newPage()
  const failures = []
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`))
  page.on('console', message => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`)
  })

  for (const [name, route] of routes) {
    await page.goto(`${baseUrl}/?browser-demo=1#${route}`, { waitUntil: 'networkidle' })
    await page.locator('#root').waitFor({ state: 'visible' })
    await page.waitForTimeout(500)
    await page.screenshot({ fullPage: true, path: path.join(outputDir, `${name}-1280.png`) })
  }

  for (const width of [1024, 768]) {
    await page.setViewportSize({ height: 800, width })
    for (const [name, route] of responsiveRoutes) {
      await page.goto(`${baseUrl}/?browser-demo=1#${route}`, { waitUntil: 'networkidle' })
      await page.locator('#root').waitFor({ state: 'visible' })
      await page.waitForTimeout(500)
      await page.screenshot({ fullPage: true, path: path.join(outputDir, `${name}-${width}.png`) })
    }
  }

  // Writer project context must survive route remounts instead of depending
  // only on an in-memory event emitted while the chat route is unmounted.
  await page.setViewportSize({ height: 800, width: 1280 })
  await page.goto(`${baseUrl}/?browser-demo=1#/karna/writer`, { waitUntil: 'networkidle' })
  await page.goto(`${baseUrl}/?browser-demo=1#/`, { waitUntil: 'networkidle' })
  await page.getByText(/当前创作项目/).waitFor({ state: 'visible' })

  if (failures.length) throw new Error(`Renderer errors detected:\n${[...new Set(failures)].join('\n')}`)
  console.log(JSON.stringify({ ok: true, responsiveWidths: [1280, 1024, 768], routes: routes.map(([name]) => name), screenshots: fs.readdirSync(outputDir).length }, null, 2))
} finally {
  if (browser) await browser.close()
  preview.kill('SIGTERM')
}
