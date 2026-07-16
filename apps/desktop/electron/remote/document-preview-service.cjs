'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFile } = require('node:child_process')
const os = require('node:os')

const PREVIEW_CACHE_TTL_MS = 30 * 60 * 1000
const TEMP_FILE_TTL_MS = 60 * 60 * 1000
const DEFAULT_CHUNK_SIZE = 256 * 1024
const MAX_TEXT_PREVIEW_LINES = 10000
const MAX_TEXT_PREVIEW_BYTES = 5 * 1024 * 1024
const MAX_JSON_PREVIEW_BYTES = 10 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 4096

const FILE_TYPES = {
  MARKDOWN: 'markdown',
  PDF: 'pdf',
  DOCX: 'docx',
  SPREADSHEET: 'spreadsheet',
  PRESENTATION: 'presentation',
  TXT: 'txt',
  JSON: 'json',
  IMAGE: 'image',
  CODE: 'code',
  BINARY: 'binary',
  UNKNOWN: 'unknown'
}

const EXTENSION_TYPE_MAP = {
  '.md': FILE_TYPES.MARKDOWN,
  '.markdown': FILE_TYPES.MARKDOWN,
  '.mdown': FILE_TYPES.MARKDOWN,
  '.pdf': FILE_TYPES.PDF,
  '.docx': FILE_TYPES.DOCX,
  '.doc': FILE_TYPES.DOCX,
  '.xls': FILE_TYPES.SPREADSHEET,
  '.xlsx': FILE_TYPES.SPREADSHEET,
  '.xlsm': FILE_TYPES.SPREADSHEET,
  '.et': FILE_TYPES.SPREADSHEET,
  '.ppt': FILE_TYPES.PRESENTATION,
  '.pptx': FILE_TYPES.PRESENTATION,
  '.dps': FILE_TYPES.PRESENTATION,
  '.xmind': FILE_TYPES.BINARY,
  '.txt': FILE_TYPES.TXT,
  '.json': FILE_TYPES.JSON,
  '.js': FILE_TYPES.CODE,
  '.ts': FILE_TYPES.CODE,
  '.jsx': FILE_TYPES.CODE,
  '.tsx': FILE_TYPES.CODE,
  '.py': FILE_TYPES.CODE,
  '.java': FILE_TYPES.CODE,
  '.c': FILE_TYPES.CODE,
  '.h': FILE_TYPES.CODE,
  '.cpp': FILE_TYPES.CODE,
  '.hpp': FILE_TYPES.CODE,
  '.cs': FILE_TYPES.CODE,
  '.go': FILE_TYPES.CODE,
  '.rs': FILE_TYPES.CODE,
  '.rb': FILE_TYPES.CODE,
  '.php': FILE_TYPES.CODE,
  '.swift': FILE_TYPES.CODE,
  '.kt': FILE_TYPES.CODE,
  '.scala': FILE_TYPES.CODE,
  '.html': FILE_TYPES.CODE,
  '.css': FILE_TYPES.CODE,
  '.scss': FILE_TYPES.CODE,
  '.less': FILE_TYPES.CODE,
  '.xml': FILE_TYPES.CODE,
  '.yaml': FILE_TYPES.CODE,
  '.yml': FILE_TYPES.CODE,
  '.toml': FILE_TYPES.CODE,
  '.ini': FILE_TYPES.CODE,
  '.cfg': FILE_TYPES.CODE,
  '.conf': FILE_TYPES.CODE,
  '.sh': FILE_TYPES.CODE,
  '.bash': FILE_TYPES.CODE,
  '.zsh': FILE_TYPES.CODE,
  '.fish': FILE_TYPES.CODE,
  '.ps1': FILE_TYPES.CODE,
  '.bat': FILE_TYPES.CODE,
  '.cmd': FILE_TYPES.CODE,
  '.sql': FILE_TYPES.CODE,
  '.png': FILE_TYPES.IMAGE,
  '.jpg': FILE_TYPES.IMAGE,
  '.jpeg': FILE_TYPES.IMAGE,
  '.gif': FILE_TYPES.IMAGE,
  '.webp': FILE_TYPES.IMAGE,
  '.bmp': FILE_TYPES.IMAGE,
  '.svg': FILE_TYPES.IMAGE
}

function detectFileType(filename) {
  const ext = path.extname(filename).toLowerCase()
  return EXTENSION_TYPE_MAP[ext] || FILE_TYPES.UNKNOWN
}

function sanitizeMarkdownHtml(content) {
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

function extractMarkdownResources(markdown, fileIdResolver, projectId) {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  const resources = []
  let match
  while ((match = imageRegex.exec(markdown)) !== null) {
    const alt = match[1]
    const imgPath = match[2].split('?')[0].split('#')[0]
    if (!imgPath.startsWith('http://') && !imgPath.startsWith('https://') && !imgPath.startsWith('data:')) {
      try {
        const normalizedPath = imgPath.replace(/\\/g, '/').replace(/^\.\//, '')
        const refFileId = fileIdResolver.generateFileId(projectId, normalizedPath)
        resources.push({
          originalPath: imgPath,
          alt,
          fileId: refFileId,
          type: 'image'
        })
      } catch (_) {}
    }
  }
  return resources
}

async function checkWordAvailable() {
  if (process.platform !== 'win32') return false
  return new Promise((resolve) => {
    const psScript = `
      try {
        $word = New-Object -ComObject Word.Application
        $word.Quit()
        Write-Output "available"
      } catch {
        Write-Output "unavailable"
      }
    `
    execFile('powershell', ['-NoProfile', '-Command', psScript], { timeout: 10000 }, (error, stdout) => {
      if (error) return resolve(false)
      resolve(stdout.trim() === 'available')
    })
  })
}

async function checkWpsAvailable() {
  if (process.platform !== 'win32') return null
  const progIds = ['WPS.Application', 'KWPS.Application', 'Et.Application']
  for (const progId of progIds) {
    const available = await new Promise((resolve) => {
      const psScript = `
        try {
          $wps = New-Object -ComObject '${progId}'
          try { $wps.Quit() } catch {}
          Write-Output "available"
        } catch {
          Write-Output "unavailable"
        }
      `
      execFile('powershell', ['-NoProfile', '-Command', psScript], { timeout: 10000 }, (error, stdout) => {
        if (error) return resolve(false)
        resolve(stdout.trim() === 'available')
      })
    })
    if (available) return progId
  }
  return null
}

async function checkLibreOfficeAvailable() {
  const commands = process.platform === 'win32'
    ? ['soffice', 'C:\\Program Files\\LibreOffice\\program\\soffice.exe']
    : ['soffice', 'libreoffice']

  for (const cmd of commands) {
    const available = await new Promise((resolve) => {
      execFile(cmd, ['--version'], { timeout: 5000 }, (error, stdout) => {
        if (error) return resolve(false)
        resolve(stdout.toLowerCase().includes('libreoffice'))
      })
    })
    if (available) return cmd
  }
  return null
}

async function convertDocxWithWord(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const psScript = `
      $ErrorActionPreference = 'Stop'
      try {
        $word = New-Object -ComObject Word.Application
        $word.Visible = $false
        $doc = $word.Documents.Open('${inputPath.replace(/'/g, "''")}')
        $doc.SaveAs2('${outputPath.replace(/'/g, "''")}', 17)
        $doc.Close()
        $word.Quit()
        Write-Output "success"
      } catch {
        if ($doc) { $doc.Close($false) }
        if ($word) { $word.Quit() }
        Write-Output $_.Exception.Message
        exit 1
      }
    `
    execFile('powershell', ['-NoProfile', '-Command', psScript], { timeout: 60000 }, (error, stdout) => {
      if (error || stdout.trim() !== 'success') {
        reject(new Error('word_conversion_failed'))
      } else {
        resolve(outputPath)
      }
    })
  })
}

async function convertDocxWithLibreOffice(inputPath, outputDir, sofficeCmd) {
  return new Promise((resolve, reject) => {
    execFile(sofficeCmd, [
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', outputDir,
      inputPath
    ], { timeout: 120000 }, (error) => {
      if (error) return reject(new Error('libreoffice_conversion_failed'))
      const outputPath = path.join(outputDir, path.basename(inputPath, path.extname(inputPath)) + '.pdf')
      if (!fs.existsSync(outputPath)) {
        return reject(new Error('conversion_output_not_found'))
      }
      resolve(outputPath)
    })
  })
}

async function convertDocxWithWps(inputPath, outputPath, wpsProgId) {
  return new Promise((resolve, reject) => {
    const psScript = `
      $ErrorActionPreference = 'Stop'
      try {
        $wps = New-Object -ComObject '${wpsProgId}'
        $wps.Visible = $false
        $doc = $wps.Documents.Open('${inputPath.replace(/'/g, "''")}')
        $doc.SaveAs2('${outputPath.replace(/'/g, "''")}', 17)
        $doc.Close($false)
        try { $wps.Quit() } catch {}
        Write-Output "success"
      } catch {
        try { if ($doc) { $doc.Close($false) } } catch {}
        try { if ($wps) { $wps.Quit() } } catch {}
        Write-Output $_.Exception.Message
        exit 1
      }
    `
    execFile('powershell', ['-NoProfile', '-Command', psScript], { timeout: 120000 }, (error, stdout) => {
      if (error || stdout.trim() !== 'success') {
        reject(new Error('wps_conversion_failed'))
      } else {
        resolve(outputPath)
      }
    })
  })
}

async function checkPowerPointAvailable() {
  if (process.platform !== 'win32') return null
  for (const progId of ['PowerPoint.Application', 'KWPP.Application']) {
    const available = await new Promise(resolve => {
      const psScript = `
        try {
          $app = New-Object -ComObject '${progId}'
          try { $app.Quit() } catch {}
          Write-Output "available"
        } catch { Write-Output "unavailable" }
      `
      execFile('powershell', ['-NoProfile', '-Command', psScript], { timeout: 10000 }, (error, stdout) => {
        resolve(!error && stdout.trim() === 'available')
      })
    })
    if (available) return progId
  }
  return null
}

async function checkSpreadsheetAvailable() {
  if (process.platform !== 'win32') return null
  for (const progId of ['Excel.Application', 'Et.Application']) {
    try {
      await new Promise((resolve, reject) => {
        const script = `
          try {
            $app = New-Object -ComObject '${progId}'
            try { $app.Quit() } catch {}
            exit 0
          } catch { exit 1 }
        `
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 5000 }, error => error ? reject(error) : resolve())
      })
      return progId
    } catch { /* try next provider */ }
  }
  return null
}

async function convertSpreadsheetWithCom(inputPath, outputPath, progId) {
  return new Promise((resolve, reject) => {
    const script = `
      $app = $null
      $book = $null
      try {
        $app = New-Object -ComObject '${progId}'
        $app.Visible = $false
        $app.DisplayAlerts = $false
        $book = $app.Workbooks.Open('${inputPath.replace(/'/g, "''")}')
        $book.ExportAsFixedFormat(0, '${outputPath.replace(/'/g, "''")}')
        $book.Close($false)
        $app.Quit()
        exit 0
      } catch {
        try { if ($book) { $book.Close($false) } } catch {}
        try { if ($app) { $app.Quit() } } catch {}
        exit 1
      }
    `
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 120000 }, error => {
      if (error) reject(new Error('spreadsheet_conversion_failed'))
      else resolve(outputPath)
    })
  })
}

async function convertPresentationWithCom(inputPath, outputPath, progId) {
  return new Promise((resolve, reject) => {
    const psScript = `
      $ErrorActionPreference = 'Stop'
      try {
        $app = New-Object -ComObject '${progId}'
        $presentation = $app.Presentations.Open('${inputPath.replace(/'/g, "''")}', $false, $false, $false)
        $presentation.SaveAs('${outputPath.replace(/'/g, "''")}', 32)
        $presentation.Close()
        $app.Quit()
        Write-Output "success"
      } catch {
        try { if ($presentation) { $presentation.Close() } } catch {}
        try { if ($app) { $app.Quit() } } catch {}
        Write-Output $_.Exception.Message
        exit 1
      }
    `
    execFile('powershell', ['-NoProfile', '-Command', psScript], { timeout: 120000 }, (error, stdout) => {
      if (error || stdout.trim() !== 'success') reject(new Error('presentation_conversion_failed'))
      else resolve(outputPath)
    })
  })
}

function createDocumentPreviewService(deps = {}) {
  const {
    fsDep = fs,
    pathDep = path,
    cryptoDep = crypto,
    osDep = os,
    fileIdResolver,
    tempDir,
    auditLogger,
    eventStore
  } = deps

  const previewCache = new Map()
  const tempFiles = new Map()
  let previewSeq = 0
  let cleanupInterval = null

  function generatePreviewId() {
    previewSeq += 1
    const rand = cryptoDep.randomBytes(8).toString('hex')
    return `preview_${Date.now()}_${previewSeq}_${rand}`
  }

  function computeCacheKey(sourceHash, converterId, converterVersion, previewOptionsHash) {
    return cryptoDep.createHash('sha256')
      .update(`${sourceHash}:${converterId}:${converterVersion}:${previewOptionsHash}`)
      .digest('hex')
  }

  function getOrCreateTempDir() {
    if (tempDir && fsDep.existsSync(tempDir)) return tempDir
    return osDep.tmpdir()
  }

  function createTempPath(prefix = 'preview-') {
    const tmpDir = getOrCreateTempDir()
    const rand = cryptoDep.randomBytes(16).toString('hex')
    const tmpPath = pathDep.join(tmpDir, `${prefix}${rand}`)
    tempFiles.set(tmpPath, {
      path: tmpPath,
      createdAt: Date.now()
    })
    return tmpPath
  }

  function cleanupTempFile(filePath) {
    try {
      if (fsDep.existsSync(filePath)) {
        fsDep.unlinkSync(filePath)
      }
    } catch (_) {}
    tempFiles.delete(filePath)
  }

  function pruneExpiredCache() {
    const now = Date.now()
    for (const [id, preview] of previewCache.entries()) {
      if (now > preview.expiresAt) {
        if (preview.tempPath) {
          cleanupTempFile(preview.tempPath)
        }
        previewCache.delete(id)
      }
    }
    for (const [path, info] of tempFiles.entries()) {
      if (now - info.createdAt > TEMP_FILE_TTL_MS) {
        cleanupTempFile(path)
      }
    }
  }

  async function readFileChunk(filePath, offset, length) {
    return new Promise((resolve, reject) => {
      const stream = fsDep.createReadStream(filePath, { start: offset, end: offset + length - 1 })
      const chunks = []
      stream.on('data', chunk => chunks.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })
  }

  function getFileStat(filePath) {
    try {
      return fsDep.statSync(filePath)
    } catch (_) {
      return null
    }
  }

  async function previewMarkdown(fileEntry, options = {}) {
    const { projectId } = options
    try {
      let content = fsDep.readFileSync(fileEntry.realPath, 'utf8')
      if (content.length > MAX_TEXT_PREVIEW_BYTES) {
        content = content.slice(0, MAX_TEXT_PREVIEW_BYTES) + '\n... [truncated]'
      }
      const lines = content.split('\n')
      if (lines.length > MAX_TEXT_PREVIEW_LINES) {
        content = lines.slice(0, MAX_TEXT_PREVIEW_LINES).join('\n') + '\n... [truncated]'
      }
      content = sanitizeMarkdownHtml(content)
      const resources = fileIdResolver
        ? extractMarkdownResources(content, fileIdResolver, projectId || fileEntry.projectId)
        : []

      return {
        type: FILE_TYPES.MARKDOWN,
        format: 'text',
        content,
        resources,
        metadata: {
          lines: Math.min(lines.length, MAX_TEXT_PREVIEW_LINES),
          truncated: lines.length > MAX_TEXT_PREVIEW_LINES || content.length > MAX_TEXT_PREVIEW_BYTES
        }
      }
    } catch (err) {
      return { error: 'read_failed', message: err.message }
    }
  }

  async function previewPdf(fileEntry, options = {}) {
    return {
      type: FILE_TYPES.PDF,
      format: 'binary',
      filePath: fileEntry.realPath,
      size: fileEntry.size,
      metadata: {
        chunkSize: DEFAULT_CHUNK_SIZE,
        totalChunks: Math.ceil(fileEntry.size / DEFAULT_CHUNK_SIZE)
      }
    }
  }

  async function previewText(fileEntry, options = {}) {
    try {
      let content = fsDep.readFileSync(fileEntry.realPath, 'utf8')
      if (content.length > MAX_TEXT_PREVIEW_BYTES) {
        content = content.slice(0, MAX_TEXT_PREVIEW_BYTES) + '\n... [truncated]'
      }
      const lines = content.split('\n')
      if (lines.length > MAX_TEXT_PREVIEW_LINES) {
        content = lines.slice(0, MAX_TEXT_PREVIEW_LINES).join('\n') + '\n... [truncated]'
      }

      return {
        type: FILE_TYPES.TXT,
        format: 'text',
        content,
        language: detectFileType(fileEntry.filename) === FILE_TYPES.CODE
          ? pathDep.extname(fileEntry.filename).slice(1)
          : 'plaintext',
        metadata: {
          lines: Math.min(lines.length, MAX_TEXT_PREVIEW_LINES),
          truncated: lines.length > MAX_TEXT_PREVIEW_LINES || content.length > MAX_TEXT_PREVIEW_BYTES
        }
      }
    } catch (err) {
      return { error: 'read_failed', message: err.message }
    }
  }

  async function previewJson(fileEntry, options = {}) {
    try {
      const rawContent = fsDep.readFileSync(fileEntry.realPath, 'utf8')
      if (rawContent.length > MAX_JSON_PREVIEW_BYTES) {
        return {
          type: FILE_TYPES.JSON,
          format: 'text',
          content: rawContent.slice(0, MAX_JSON_PREVIEW_BYTES) + '\n... [truncated]',
          metadata: { lines: 0, truncated: true, parseError: 'file_too_large' }
        }
      }
      const parsed = JSON.parse(rawContent)
      const formatted = JSON.stringify(parsed, null, 2)
      const lines = formatted.split('\n')

      return {
        type: FILE_TYPES.JSON,
        format: 'text',
        content: formatted,
        metadata: {
          lines: lines.length,
          truncated: false,
          valid: true
        }
      }
    } catch (err) {
      if (err instanceof SyntaxError) {
        const rawContent = fsDep.readFileSync(fileEntry.realPath, 'utf8').slice(0, MAX_TEXT_PREVIEW_BYTES)
        return {
          type: FILE_TYPES.JSON,
          format: 'text',
          content: rawContent,
          metadata: { lines: rawContent.split('\n').length, truncated: false, valid: false, parseError: err.message }
        }
      }
      return { error: 'read_failed', message: err.message }
    }
  }

  async function previewImage(fileEntry, options = {}) {
    return {
      type: FILE_TYPES.IMAGE,
      format: 'binary',
      filePath: fileEntry.realPath,
      size: fileEntry.size,
      metadata: {
        chunkSize: DEFAULT_CHUNK_SIZE,
        totalChunks: Math.ceil(fileEntry.size / DEFAULT_CHUNK_SIZE),
        maxDimension: MAX_IMAGE_DIMENSION,
        contentType: getImageContentType(fileEntry.filename)
      }
    }
  }

  async function previewBinary(fileEntry) {
    return {
      type: FILE_TYPES.BINARY,
      format: 'binary',
      filePath: fileEntry.realPath,
      size: fileEntry.size,
      metadata: {
        chunkSize: DEFAULT_CHUNK_SIZE,
        totalChunks: Math.ceil(fileEntry.size / DEFAULT_CHUNK_SIZE),
        contentType: 'application/octet-stream'
      }
    }
  }

  function getImageContentType(filename) {
    const ext = pathDep.extname(filename).toLowerCase()
    const types = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml'
    }
    return types[ext] || 'application/octet-stream'
  }

  async function previewDocx(fileEntry, options = {}) {
    const wordAvailable = await checkWordAvailable()
    const wpsProgId = wordAvailable ? null : await checkWpsAvailable()
    const sofficeCmd = (wordAvailable || wpsProgId) ? null : await checkLibreOfficeAvailable()

    if (!wordAvailable && !wpsProgId && !sofficeCmd) {
      return { error: 'converter_unavailable' }
    }

    try {
      const outputDir = getOrCreateTempDir()
      let pdfPath = null
      let converterId = null
      let converterVersion = '1.0'

      if (wordAvailable) {
        converterId = 'win32word'
        const tempOutput = createTempPath('docx-convert-') + '.pdf'
        await convertDocxWithWord(fileEntry.realPath, tempOutput)
        pdfPath = tempOutput
      } else if (wpsProgId) {
        converterId = 'win32wps'
        const tempOutput = createTempPath('docx-convert-') + '.pdf'
        await convertDocxWithWps(fileEntry.realPath, tempOutput, wpsProgId)
        pdfPath = tempOutput
      } else {
        converterId = 'libreoffice'
        const tempInput = createTempPath('docx-input-') + pathDep.extname(fileEntry.realPath)
        fsDep.copyFileSync(fileEntry.realPath, tempInput)
        try {
          pdfPath = await convertDocxWithLibreOffice(tempInput, outputDir, sofficeCmd)
          tempFiles.set(pdfPath, { path: pdfPath, createdAt: Date.now() })
        } finally {
          cleanupTempFile(tempInput)
        }
      }

      if (!pdfPath || !fsDep.existsSync(pdfPath)) {
        return { error: 'conversion_failed' }
      }

      const pdfStat = getFileStat(pdfPath)
      if (!pdfStat) {
        cleanupTempFile(pdfPath)
        return { error: 'conversion_failed' }
      }

      const converterName = wordAvailable
        ? 'Microsoft Word'
        : wpsProgId
          ? 'WPS Office'
          : 'LibreOffice'

      return {
        type: FILE_TYPES.DOCX,
        convertedTo: FILE_TYPES.PDF,
        format: 'binary',
        filePath: pdfPath,
        size: pdfStat.size,
        tempPath: pdfPath,
        converterId,
        converterVersion,
        metadata: {
          chunkSize: DEFAULT_CHUNK_SIZE,
          totalChunks: Math.ceil(pdfStat.size / DEFAULT_CHUNK_SIZE),
          converter: converterName
        }
      }
    } catch (err) {
      return { error: 'conversion_failed', message: err.message }
    }
  }

  async function previewPresentation(fileEntry) {
    const presentationProgId = await checkPowerPointAvailable()
    const sofficeCmd = presentationProgId ? null : await checkLibreOfficeAvailable()
    if (!presentationProgId && !sofficeCmd) return { error: 'converter_unavailable' }

    try {
      const outputDir = getOrCreateTempDir()
      let pdfPath
      if (presentationProgId) {
        pdfPath = createTempPath('presentation-convert-') + '.pdf'
        await convertPresentationWithCom(fileEntry.realPath, pdfPath, presentationProgId)
      } else {
        const tempInput = createTempPath('presentation-input-') + pathDep.extname(fileEntry.realPath)
        fsDep.copyFileSync(fileEntry.realPath, tempInput)
        try {
          pdfPath = await convertDocxWithLibreOffice(tempInput, outputDir, sofficeCmd)
          tempFiles.set(pdfPath, { path: pdfPath, createdAt: Date.now() })
        } finally {
          cleanupTempFile(tempInput)
        }
      }
      const pdfStat = pdfPath && getFileStat(pdfPath)
      if (!pdfPath || !pdfStat) return { error: 'conversion_failed' }
      return {
        type: FILE_TYPES.PRESENTATION,
        convertedTo: FILE_TYPES.PDF,
        format: 'binary',
        filePath: pdfPath,
        size: pdfStat.size,
        tempPath: pdfPath,
        metadata: {
          chunkSize: DEFAULT_CHUNK_SIZE,
          totalChunks: Math.ceil(pdfStat.size / DEFAULT_CHUNK_SIZE),
          converter: presentationProgId === 'PowerPoint.Application' ? 'Microsoft PowerPoint' : presentationProgId ? 'WPS Office' : 'LibreOffice'
        }
      }
    } catch (err) {
      return { error: 'conversion_failed', message: err.message }
    }
  }

  async function previewSpreadsheet(fileEntry) {
    const spreadsheetProgId = await checkSpreadsheetAvailable()
    const sofficeCmd = spreadsheetProgId ? null : await checkLibreOfficeAvailable()
    if (!spreadsheetProgId && !sofficeCmd) return { error: 'converter_unavailable' }
    try {
      const outputDir = getOrCreateTempDir()
      let pdfPath
      if (spreadsheetProgId) {
        pdfPath = createTempPath('spreadsheet-convert-') + '.pdf'
        await convertSpreadsheetWithCom(fileEntry.realPath, pdfPath, spreadsheetProgId)
      } else {
        const tempInput = createTempPath('spreadsheet-input-') + pathDep.extname(fileEntry.realPath)
        fsDep.copyFileSync(fileEntry.realPath, tempInput)
        try {
          pdfPath = await convertDocxWithLibreOffice(tempInput, outputDir, sofficeCmd)
          tempFiles.set(pdfPath, { path: pdfPath, createdAt: Date.now() })
        } finally {
          cleanupTempFile(tempInput)
        }
      }
      const pdfStat = pdfPath && getFileStat(pdfPath)
      if (!pdfPath || !pdfStat) return { error: 'conversion_failed' }
      return {
        type: FILE_TYPES.SPREADSHEET,
        convertedTo: FILE_TYPES.PDF,
        format: 'binary',
        filePath: pdfPath,
        size: pdfStat.size,
        tempPath: pdfPath,
        metadata: {
          chunkSize: DEFAULT_CHUNK_SIZE,
          totalChunks: Math.ceil(pdfStat.size / DEFAULT_CHUNK_SIZE),
          converter: spreadsheetProgId === 'Excel.Application' ? 'Microsoft Excel' : spreadsheetProgId ? 'WPS Office' : 'LibreOffice'
        }
      }
    } catch (err) {
      return { error: 'conversion_failed', message: err.message }
    }
  }

  async function createPreview(fileEntry, options = {}) {
    const fileType = detectFileType(fileEntry.filename)
    const sourceHash = fileIdResolver
      ? fileIdResolver.computeSourceHashSync(fileEntry.realPath)
      : cryptoDep.createHash('sha256').update(fsDep.readFileSync(fileEntry.realPath)).digest('hex')

    const previewOptionsHash = cryptoDep.createHash('sha256')
      .update(JSON.stringify(options || {}))
      .digest('hex')

    let converterId = 'native'
    let converterVersion = '1.0'
    let cacheKey = null

    if (fileType === FILE_TYPES.DOCX || fileType === FILE_TYPES.PRESENTATION || fileType === FILE_TYPES.SPREADSHEET) {
      if (fileType === FILE_TYPES.PRESENTATION) {
        const presentationProgId = await checkPowerPointAvailable()
        const sofficeCmd = presentationProgId ? null : await checkLibreOfficeAvailable()
        if (!presentationProgId && !sofficeCmd) return { ok: false, error: 'converter_unavailable' }
        converterId = presentationProgId || 'libreoffice'
        cacheKey = computeCacheKey(sourceHash, converterId, converterVersion, previewOptionsHash)
        const cached = previewCache.get(cacheKey)
        if (cached && Date.now() < cached.expiresAt) return { ok: true, previewId: cached.previewId, cached: true }
      } else if (fileType === FILE_TYPES.SPREADSHEET) {
        const spreadsheetProgId = await checkSpreadsheetAvailable()
        const sofficeCmd = spreadsheetProgId ? null : await checkLibreOfficeAvailable()
        if (!spreadsheetProgId && !sofficeCmd) return { ok: false, error: 'converter_unavailable' }
        converterId = spreadsheetProgId || 'libreoffice'
        cacheKey = computeCacheKey(sourceHash, converterId, converterVersion, previewOptionsHash)
        const cached = previewCache.get(cacheKey)
        if (cached && Date.now() < cached.expiresAt) return { ok: true, previewId: cached.previewId, cached: true }
      } else {
      const wordAvailable = await checkWordAvailable()
      const wpsProgId = wordAvailable ? null : await checkWpsAvailable()
      const sofficeCmd = (wordAvailable || wpsProgId) ? null : await checkLibreOfficeAvailable()
      if (!wordAvailable && !wpsProgId && !sofficeCmd) {
        return { ok: false, error: 'converter_unavailable' }
      }
      converterId = wordAvailable ? 'win32word' : wpsProgId ? 'win32wps' : 'libreoffice'
      cacheKey = computeCacheKey(sourceHash, converterId, converterVersion, previewOptionsHash)
      const cached = previewCache.get(cacheKey)
      if (cached && Date.now() < cached.expiresAt) {
        return { ok: true, previewId: cached.previewId, cached: true }
      }
      }
    } else {
      cacheKey = computeCacheKey(sourceHash, converterId, converterVersion, previewOptionsHash)
      const cached = previewCache.get(cacheKey)
      if (cached && Date.now() < cached.expiresAt) {
        return { ok: true, previewId: cached.previewId, cached: true }
      }
    }

    let result
    switch (fileType) {
      case FILE_TYPES.MARKDOWN:
        result = await previewMarkdown(fileEntry, options)
        break
      case FILE_TYPES.PDF:
        result = await previewPdf(fileEntry, options)
        break
      case FILE_TYPES.DOCX:
        result = await previewDocx(fileEntry, options)
        break
      case FILE_TYPES.SPREADSHEET:
        result = await previewSpreadsheet(fileEntry, options)
        break
      case FILE_TYPES.PRESENTATION:
        result = await previewPresentation(fileEntry, options)
        break
      case FILE_TYPES.JSON:
        result = await previewJson(fileEntry, options)
        break
      case FILE_TYPES.IMAGE:
        result = await previewImage(fileEntry, options)
        break
      case FILE_TYPES.BINARY:
        result = await previewBinary(fileEntry, options)
        break
      case FILE_TYPES.CODE:
      case FILE_TYPES.TXT:
      default:
        result = await previewText(fileEntry, options)
        break
    }

    if (result.error) {
      return { ok: false, error: result.error, message: result.message }
    }

    const previewId = generatePreviewId()
    const expiresAt = Date.now() + PREVIEW_CACHE_TTL_MS

    const preview = {
      previewId,
      fileId: fileEntry.fileId,
      fileType,
      sourceHash,
      converterId,
      converterVersion,
      cacheKey,
      expiresAt,
      createdAt: Date.now(),
      ...result
    }

    previewCache.set(cacheKey, preview)
    previewCache.set(previewId, preview)

    if (eventStore) {
      eventStore.append('preview.created', {
        previewId,
        fileId: fileEntry.fileId,
        fileType,
        converterId
      })
    }

    pruneExpiredCache()

    return {
      ok: true,
      previewId,
      fileType,
      type: result.type,
      format: result.format,
      metadata: result.metadata,
      expiresAt
    }
  }

  function getPreviewManifest(previewId) {
    const preview = previewCache.get(previewId)
    if (!preview) {
      return { ok: false, error: 'preview_not_found' }
    }
    if (Date.now() > preview.expiresAt) {
      previewCache.delete(previewId)
      if (preview.tempPath) cleanupTempFile(preview.tempPath)
      return { ok: false, error: 'preview_expired' }
    }

    return {
      ok: true,
      previewId: preview.previewId,
      fileId: preview.fileId,
      type: preview.type,
      format: preview.format,
      size: preview.size,
      content: preview.content,
      resources: preview.resources,
      language: preview.language,
      metadata: preview.metadata,
      chunkSize: preview.metadata?.chunkSize || DEFAULT_CHUNK_SIZE,
      totalChunks: preview.metadata?.totalChunks || 0,
      expiresAt: preview.expiresAt
    }
  }

  async function getPreviewChunk(previewId, chunkIndex) {
    const preview = previewCache.get(previewId)
    if (!preview) {
      return { ok: false, error: 'preview_not_found' }
    }
    if (Date.now() > preview.expiresAt) {
      previewCache.delete(previewId)
      if (preview.tempPath) cleanupTempFile(preview.tempPath)
      return { ok: false, error: 'preview_expired' }
    }
    if (preview.format !== 'binary') {
      return { ok: false, error: 'not_binary_preview' }
    }

    const chunkSize = preview.metadata?.chunkSize || DEFAULT_CHUNK_SIZE
    const totalChunks = preview.metadata?.totalChunks || Math.ceil(preview.size / chunkSize)
    const idx = parseInt(chunkIndex, 10)

    if (isNaN(idx) || idx < 0 || idx >= totalChunks) {
      return { ok: false, error: 'invalid_chunk_index' }
    }

    const offset = idx * chunkSize
    const length = Math.min(chunkSize, preview.size - offset)

    try {
      const data = await readFileChunk(preview.filePath, offset, length)
      return {
        ok: true,
        previewId,
        chunkIndex: idx,
        offset,
        length,
        data: data.toString('base64'),
        done: idx === totalChunks - 1
      }
    } catch (err) {
      return { ok: false, error: 'read_failed', message: err.message }
    }
  }

  function getPreviewStatus(previewId) {
    const preview = previewCache.get(previewId)
    if (!preview) return 'not_found'
    if (Date.now() > preview.expiresAt) return 'expired'
    return 'ready'
  }

  function invalidatePreviewsForFile(fileId) {
    for (const [key, preview] of previewCache.entries()) {
      if (preview.fileId === fileId) {
        if (preview.tempPath) cleanupTempFile(preview.tempPath)
        previewCache.delete(key)
      }
    }
  }

  function releasePreview(previewId) {
    const preview = previewCache.get(previewId)
    if (!preview) return false
    if (preview.tempPath) cleanupTempFile(preview.tempPath)
    for (const [key, cached] of previewCache.entries()) {
      if (cached === preview) previewCache.delete(key)
    }
    return true
  }

  function getStats() {
    pruneExpiredCache()
    return {
      activePreviews: previewCache.size,
      tempFiles: tempFiles.size,
      cacheTtlMs: PREVIEW_CACHE_TTL_MS,
      defaultChunkSize: DEFAULT_CHUNK_SIZE
    }
  }

  function initialize() {
    previewCache.clear()
    tempFiles.clear()
    previewSeq = 0
    if (cleanupInterval) clearInterval(cleanupInterval)
    cleanupInterval = setInterval(pruneExpiredCache, 5 * 60 * 1000)
    cleanupInterval.unref()
  }

  function shutdown() {
    if (cleanupInterval) clearInterval(cleanupInterval)
    for (const [path] of tempFiles.entries()) {
      cleanupTempFile(path)
    }
    for (const [, preview] of previewCache.entries()) {
      if (preview.tempPath) cleanupTempFile(preview.tempPath)
    }
    previewCache.clear()
    tempFiles.clear()
  }

  return Object.freeze({
    initialize,
    shutdown,
    createPreview,
    getPreviewManifest,
    getPreviewChunk,
    getPreviewStatus,
    invalidatePreviewsForFile,
    releasePreview,
    detectFileType,
    getStats,
    FILE_TYPES
  })
}

module.exports = {
  createDocumentPreviewService,
  FILE_TYPES,
  detectFileType,
  PREVIEW_CACHE_TTL_MS,
  DEFAULT_CHUNK_SIZE
}
