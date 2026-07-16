'use strict'

const crypto = require('crypto')
const { EventEmitter } = require('events')
const { execFileSync } = require('child_process')
const { slugify } = require('./slugify.cjs')

function createIngestService({ fs, path, os, execFile, dataRoot, karnaPaths, storage, callChatCompletion, findProvider, isProviderConfigured, getCurrentModelConfig }) {
  const resolveDataRoot = () => {
    const root = dataRoot || (typeof karnaPaths?.dataRoot === 'function' ? karnaPaths.dataRoot() : karnaPaths?.dataRoot)
    if (typeof root !== 'string' || !root.trim()) {
      throw new TypeError('createIngestService requires a string dataRoot or karnaPaths.dataRoot() result')
    }
    return root
  }
  const ingestCacheDir = () => path.join(resolveDataRoot(), 'ingest_cache')
  const jobsFile = () => path.join(ingestCacheDir(), 'jobs.json')
  const resultsDir = () => path.join(ingestCacheDir(), 'results')
  const artifactsDir = () => path.join(ingestCacheDir(), 'artifacts')

  function ensureDirs() {
    for (const dir of [ingestCacheDir(), resultsDir(), artifactsDir()]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }
  }

  function jobId() {
    return `ingest_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
  }

  function resultIdFor(jobId) {
    return `result_${jobId.replace(/^ingest_/, '')}`
  }

  function redactPath(filePath) {
    if (!filePath) return ''
    const homeDir = os.homedir()
    let display = filePath
    if (display.startsWith(homeDir)) {
      display = '~' + display.slice(homeDir.length)
    }
    return display.replace(/\\/g, '/')
  }

  function getMediaType(filePath) {
    const ext = path.extname(filePath || '').toLowerCase()
    const map = {
      '.pdf': 'pdf',
      '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image', '.bmp': 'image', '.svg': 'image',
      '.doc': 'office_doc', '.docx': 'office_doc', '.odt': 'office_doc', '.rtf': 'office_doc',
      '.xls': 'spreadsheet', '.xlsx': 'spreadsheet', '.csv': 'spreadsheet',
      '.ppt': 'presentation', '.pptx': 'presentation',
      '.txt': 'text', '.md': 'text', '.markdown': 'text', '.json': 'text', '.html': 'text', '.htm': 'text', '.xml': 'text',
      '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.flac': 'audio', '.m4a': 'audio',
      '.mp4': 'video', '.mov': 'video', '.mkv': 'video', '.webm': 'video', '.avi': 'video',
    }
    return map[ext] || 'unknown_binary'
  }

  function isImageType(mediaType) {
    return mediaType === 'image'
  }

  function isPdfType(mediaType) {
    return mediaType === 'pdf'
  }

  function isTextType(mediaType) {
    return ['text', 'office_doc', 'spreadsheet', 'presentation'].includes(mediaType)
  }

  function isVideoType(mediaType) {
    return mediaType === 'video'
  }

  function isAudioType(mediaType) {
    return mediaType === 'audio'
  }

  function chunkText(text, sourceLabel, options = {}) {
    const { chunkSize = 2000, overlap = 200, page = null } = options
    const cleanText = String(text || '').trim()
    if (!cleanText) return []

    const chunks = []
    const paragraphs = cleanText.split(/\n{2,}/)
    let currentChunk = ''
    let chunkIndex = 0

    for (const para of paragraphs) {
      if ((currentChunk + '\n\n' + para).length > chunkSize && currentChunk.length > 100) {
        chunks.push({
          id: `chunk_${chunkIndex}`,
          index: chunkIndex,
          text: currentChunk.trim(),
          page,
          source_label: sourceLabel,
        })
        chunkIndex++
        currentChunk = para
      } else {
        currentChunk = currentChunk ? currentChunk + '\n\n' + para : para
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        id: `chunk_${chunkIndex}`,
        index: chunkIndex,
        text: currentChunk.trim(),
        page,
        source_label: sourceLabel,
      })
    }

    return chunks
  }

  function extractDocxText(filePath) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-docx-'))
    try {
      try {
        execFileSync('powershell.exe', [
          '-NoProfile', '-Command',
          `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory(${JSON.stringify(filePath)}, ${JSON.stringify(tmp)})`
        ], { stdio: 'ignore', timeout: 15000 })
      } catch (e) {
        try {
          const AdmZip = require('adm-zip')
          const zip = new AdmZip(filePath)
          zip.extractAllTo(tmp, true)
        } catch (zipErr) {
          return null
        }
      }

      const docXml = path.join(tmp, 'word', 'document.xml')
      if (!fs.existsSync(docXml)) return null

      const xml = fs.readFileSync(docXml, 'utf8')
      const text = xml
        .replace(/<w:p[^>]*>/g, '\n')
        .replace(/<w:tab[^>]*\/>/g, '\t')
        .replace(/<w:br[^>]*\/>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

      return text
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
    }
  }

  function extractPdfTextPython(filePath) {
    return new Promise((resolve) => {
      const pythonScript = `
import sys, json
try:
    import fitz
    doc = fitz.open(sys.argv[1])
    pages = []
    meta = {"pages": len(doc), "engine": "pymupdf", "ocr": False}
    for i, page in enumerate(doc):
        text = page.get_text()
        pages.append({"page": i+1, "text": text})
    doc.close()
    print(json.dumps({"ok": True, "pages": pages, "meta": meta}))
except Exception as e:
    try:
        import pdfplumber
        pages = []
        with pdfplumber.open(sys.argv[1]) as pdf:
            meta = {"pages": len(pdf.pages), "engine": "pdfplumber", "ocr": False}
            for i, page in enumerate(pdf.pages):
                pages.append({"page": i+1, "text": page.extract_text() or ""})
        print(json.dumps({"ok": True, "pages": pages, "meta": meta}))
    except Exception as e2:
        try:
            from pypdf import PdfReader
            reader = PdfReader(sys.argv[1])
            pages = []
            meta = {"pages": len(reader.pages), "engine": "pypdf", "ocr": False}
            for i, page in enumerate(reader.pages):
                pages.append({"page": i+1, "text": page.extract_text() or ""})
            print(json.dumps({"ok": True, "pages": pages, "meta": meta}))
        except Exception as e3:
            print(json.dumps({"ok": False, "error": str(e3), "engine": "none"}))
`
      const tmpScript = path.join(os.tmpdir(), `karna_pdf_${Date.now()}.py`)
      fs.writeFileSync(tmpScript, pythonScript, 'utf8')

      const pythonExes = [process.platform === 'win32' ? 'python' : 'python3', 'python']
      let resolved = false

      const tryPython = (index) => {
        if (index >= pythonExes.length || resolved) {
          if (!resolved) resolve({ ok: false, error: 'No Python PDF parser available' })
          return
        }
        try {
          execFile(pythonExes[index], [tmpScript, filePath], { encoding: 'utf8', timeout: 30000, maxBuffer: 50 * 1024 * 1024, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } }, (err, stdout) => {
            try { fs.unlinkSync(tmpScript) } catch {}
            if (resolved) return
            if (err) {
              tryPython(index + 1)
              return
            }
            try {
              const result = JSON.parse(stdout.trim())
              resolved = true
              resolve(result)
            } catch (parseErr) {
              tryPython(index + 1)
            }
          })
        } catch (spawnErr) {
          tryPython(index + 1)
        }
      }

      tryPython(0)
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          try { fs.unlinkSync(tmpScript) } catch {}
          resolve({ ok: false, error: 'PDF parsing timed out' })
        }
      }, 35000)
    })
  }

  async function detectPdfRoute(filePath) {
    try {
      const stat = fs.statSync(filePath)
      const fileSizeMb = stat.size / (1024 * 1024)
      if (fileSizeMb > 50) return { route: 'mineru', reason: 'large_file', needs_ocr: false }

      const result = await extractPdfTextPython(filePath)
      if (!result.ok) {
        return { route: 'ocr', reason: 'no_parser', needs_ocr: true }
      }

      const totalText = (result.pages || []).reduce((sum, p) => sum + (p.text || '').length, 0)
      const avgChars = result.meta?.pages ? totalText / result.meta.pages : 0
      const hasText = avgChars > 50

      if (!hasText) {
        return { route: 'ocr', reason: 'scanned_pdf', needs_ocr: true, engine: result.meta?.engine }
      }

      return { route: 'fast', reason: 'text_pdf', needs_ocr: false, engine: result.meta?.engine }
    } catch (err) {
      return { route: 'ocr', reason: 'detection_failed', needs_ocr: true }
    }
  }

  async function parsePdf(filePath, options = {}) {
    const warnings = []
    const engine = options.engine || 'auto'

    if (engine === 'auto') {
      const route = await detectPdfRoute(filePath)
      if (route.needs_ocr) {
        return {
          ok: false,
          status: 'partial',
          warnings: [...warnings, `PDF appears to be scanned or image-based (${route.reason}). OCR is not available in Phase 1.`],
          media_type: 'pdf',
          meta: { pages: 0, engine: 'none', ocr: true, route: route.route },
          text: '',
          markdown: '',
          chunks: [],
        }
      }
    }

    const result = await extractPdfTextPython(filePath)
    if (!result.ok) {
      return {
        ok: false,
        status: 'failed',
        error: result.error || 'PDF parsing failed',
        warnings,
        media_type: 'pdf',
        text: '',
        markdown: '',
        chunks: [],
      }
    }

    const pages = result.pages || []
    const allText = pages.map(p => p.text || '').join('\n\n')
    const markdown = pages.map((p, i) => {
      const text = (p.text || '').trim()
      return text ? `## Page ${p.page}\n\n${text}` : ''
    }).filter(Boolean).join('\n\n')

    const allChunks = []
    for (const p of pages) {
      const pageChunks = chunkText(p.text || '', `${path.basename(filePath)} p.${p.page}`, { page: p.page, chunkSize: 1500 })
      allChunks.push(...pageChunks)
    }

    const hasMinimalText = allText.trim().length < 100
    if (hasMinimalText) {
      warnings.push('Very little text extracted; this may be a scanned PDF.')
    }

    return {
      ok: true,
      status: hasMinimalText ? 'partial' : 'parsed',
      media_type: 'pdf',
      text: allText,
      markdown,
      chunks: allChunks,
      warnings,
      meta: {
        pages: result.meta?.pages || pages.length,
        engine: result.meta?.engine || 'pymupdf',
        ocr: false,
        file_size: fs.statSync(filePath).size,
      },
    }
  }

  async function parseImage(filePath, options = {}) {
    const warnings = []
    const mediaType = getMediaType(filePath)
    const ext = path.extname(filePath).toLowerCase()

    let previewDataUrl = null
    try {
      const stat = fs.statSync(filePath)
      if (stat.size < 5 * 1024 * 1024) {
        const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' }
        const mime = mimeMap[ext] || 'image/png'
        const buffer = fs.readFileSync(filePath)
        previewDataUrl = `data:${mime};base64,${buffer.toString('base64')}`
      }
    } catch (e) {
      warnings.push('Could not generate preview data URL')
    }

    let ocrText = ''
    let ocrConfidence = 0

    if (options.ocr !== false && callChatCompletion && previewDataUrl) {
      try {
        const modelConfig = getCurrentModelConfig ? getCurrentModelConfig() : null
        if (modelConfig && modelConfig.provider && modelConfig.model) {
          const provider = findProvider ? findProvider(modelConfig.provider) : null
          if (provider && isProviderConfigured && isProviderConfigured(provider)) {
            const ocrPrompt = 'Extract and transcribe ALL visible text from this image. Return only the extracted text, preserving line breaks and structure. If no text is visible, return exactly: [NO_TEXT_VISIBLE]'
            const content = await callChatCompletion(modelConfig.provider, modelConfig.model, [
              { role: 'user', content: [
                { type: 'text', text: ocrPrompt },
                { type: 'image_url', image_url: { url: previewDataUrl } }
              ]}
            ], { temperature: 0.1, maxTokens: 2048, timeoutMs: 30000 })

            const result = String(content || '').trim()
            if (result && result !== '[NO_TEXT_VISIBLE]') {
              ocrText = result
              ocrConfidence = 0.8
            }
          }
        }
      } catch (ocrErr) {
        warnings.push(`OCR via vision model failed: ${ocrErr.message}`)
      }
    }

    const baseName = path.basename(filePath)
    const chunks = ocrText ? chunkText(ocrText, `${baseName} (OCR)`) : []
    const markdown = ocrText ? `# Image: ${baseName}\n\n## Extracted Text\n\n${ocrText}` : `# Image: ${baseName}\n\n(No text extracted - preview only)`

    return {
      ok: true,
      status: ocrText ? 'parsed' : 'partial',
      media_type: 'image',
      text: ocrText,
      markdown,
      chunks,
      warnings,
      meta: {
        width: null,
        height: null,
        ocr: Boolean(ocrText),
        ocr_confidence: ocrConfidence,
        has_preview: Boolean(previewDataUrl),
      },
      artifacts: previewDataUrl ? [] : [],
    }
  }

  function parseTextFile(filePath) {
    const warnings = []
    const ext = path.extname(filePath).toLowerCase()
    const baseName = path.basename(filePath)

    let text = ''
    try {
      text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
    } catch (err) {
      return { ok: false, status: 'failed', error: `Cannot read file: ${err.message}`, media_type: 'text', text: '', markdown: '', chunks: [], warnings }
    }

    let markdown = text
    if (ext === '.json') {
      try {
        const parsed = JSON.parse(text)
        markdown = '```json\n' + JSON.stringify(parsed, null, 2) + '\n```'
      } catch {}
    } else if (ext === '.csv') {
      markdown = text.split('\n').map(line => '| ' + line.split(',').join(' | ') + ' |').join('\n')
      markdown = markdown.replace(/^/, '| ').replace(/\n/g, '\n| ')
    }

    const chunks = chunkText(text, baseName, { chunkSize: 3000 })

    return {
      ok: true,
      status: 'parsed',
      media_type: getMediaType(filePath),
      text,
      markdown,
      chunks,
      warnings,
      meta: {
        file_size: fs.statSync(filePath).size,
        line_count: text.split('\n').length,
      },
    }
  }

  function parseOfficeDoc(filePath) {
    const ext = path.extname(filePath).toLowerCase()
    const warnings = []

    if (ext === '.docx') {
      const text = extractDocxText(filePath)
      if (text !== null) {
        const chunks = chunkText(text, path.basename(filePath), { chunkSize: 2000 })
        return {
          ok: true,
          status: 'parsed',
          media_type: 'office_doc',
          text,
          empty: text.length === 0,
          markdown: `# ${path.basename(filePath)}\n\n${text}`,
          chunks,
          warnings,
          meta: {
            engine: 'docx-xml',
            file_size: fs.statSync(filePath).size,
            paragraph_count: text ? text.split(/\n+/).filter(Boolean).length : 0
          },
        }
      }
      warnings.push('Could not extract DOCX text')
    }

    if (ext === '.txt' || ext === '.md' || ext === '.markdown') {
      return parseTextFile(filePath)
    }

    return {
      ok: false,
      status: 'unsupported',
      error: `Office format ${ext} parsing not yet implemented in Phase 1`,
      media_type: getMediaType(filePath),
      text: '',
      markdown: '',
      chunks: [],
      warnings,
    }
  }

  function parseVideoMetadata(filePath) {
    return new Promise((resolve) => {
      const baseName = path.basename(filePath)
      const warnings = []

      try {
        const stat = fs.statSync(filePath)
        const ffprobe = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'

        execFile(ffprobe, [
          '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath
        ], { encoding: 'utf8', timeout: 10000 }, (err, stdout) => {
          if (err || !stdout) {
            resolve({
              ok: true,
              status: 'partial',
              media_type: 'video',
              text: '',
              markdown: `# Video: ${baseName}\n\n(Metadata only - install ffmpeg for full video parsing)`,
              chunks: [],
              warnings: [...warnings, 'ffprobe not available; limited metadata only. Video content extraction requires ffmpeg + ASR.'],
              meta: {
                file_size: stat.size,
                duration: null,
                width: null,
                height: null,
                fps: null,
                has_audio: null,
              },
            })
            return
          }

          try {
            const info = JSON.parse(stdout)
            const format = info.format || {}
            const videoStream = (info.streams || []).find(s => s.codec_type === 'video')
            const audioStream = (info.streams || []).find(s => s.codec_type === 'audio')

            const duration = parseFloat(format.duration) || 0
            const width = videoStream?.width || null
            const height = videoStream?.height || null
            const fps = videoStream?.r_frame_rate ? eval(videoStream.r_frame_rate) : null
            const hasAudio = Boolean(audioStream)

            const meta = {
              file_size: stat.size,
              duration,
              duration_label: duration ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}` : 'unknown',
              width,
              height,
              fps: fps ? Math.round(fps * 10) / 10 : null,
              has_audio: hasAudio,
            }

            resolve({
              ok: true,
              status: 'partial',
              media_type: 'video',
              text: '',
              markdown: `# Video: ${baseName}\n\n- Duration: ${meta.duration_label}\n- Resolution: ${width}x${height}\n- Audio: ${hasAudio ? 'Yes' : 'No'}\n\n(Phase 1: metadata only. ASR transcription and keyframe extraction coming in Phase 3.)`,
              chunks: [],
              warnings: [...warnings, 'Video metadata extracted. Full transcription/keyframe analysis requires Phase 3 implementation.'],
              meta,
            })
          } catch (parseErr) {
            resolve({
              ok: true,
              status: 'partial',
              media_type: 'video',
              text: '',
              markdown: `# Video: ${baseName}\n\n(Metadata only)`,
              chunks: [],
              warnings: [...warnings, 'Could not parse video metadata'],
              meta: { file_size: stat.size, duration: null },
            })
          }
        })
      } catch (spawnErr) {
        resolve({
          ok: true,
          status: 'partial',
          media_type: 'video',
          text: '',
          markdown: `# Video: ${baseName}\n\n(File attached as reference)`,
          chunks: [],
          warnings: ['Video parsing infrastructure not available'],
          meta: { file_size: 0, duration: null },
        })
      }
    })
  }

  async function parseFile(filePath, options = {}) {
    if (!fs.existsSync(filePath)) {
      return { ok: false, status: 'failed', error: 'File not found', media_type: 'unknown_binary', text: '', markdown: '', chunks: [], warnings: [] }
    }

    const mediaType = getMediaType(filePath)

    if (isPdfType(mediaType)) {
      return parsePdf(filePath, options)
    }
    if (isImageType(mediaType)) {
      return parseImage(filePath, options)
    }
    if (mediaType === 'office_doc') {
      return parseOfficeDoc(filePath)
    }
    if (mediaType === 'spreadsheet' || mediaType === 'presentation') {
      return parseOfficeDoc(filePath)
    }
    if (isTextType(mediaType)) {
      return parseTextFile(filePath)
    }
    if (isVideoType(mediaType)) {
      return parseVideoMetadata(filePath)
    }
    if (isAudioType(mediaType)) {
      const stat = fs.statSync(filePath)
      return {
        ok: true,
        status: 'partial',
        media_type: 'audio',
        text: '',
        markdown: `# Audio: ${path.basename(filePath)}\n\n(Audio file attached. ASR transcription not available in Phase 1.)`,
        chunks: [],
        warnings: ['Audio transcription not yet implemented'],
        meta: { file_size: stat.size },
      }
    }

    return {
      ok: false,
      status: 'unsupported',
      error: `Unsupported media type: ${mediaType}`,
      media_type: mediaType,
      text: '',
      markdown: '',
      chunks: [],
      warnings: [],
    }
  }

  const jobs = new Map()
  const jobEvents = new EventEmitter()
  jobEvents.setMaxListeners(100)

  function loadJobs() {
    try {
      if (fs.existsSync(jobsFile())) {
        const data = JSON.parse(fs.readFileSync(jobsFile(), 'utf8'))
        if (data.jobs) {
          for (const [id, job] of Object.entries(data.jobs)) {
            if (job.status === 'running' || job.status === 'queued') {
              job.status = 'failed'
              job.error = 'Interrupted by restart'
            }
            jobs.set(id, job)
          }
        }
      }
    } catch {}
  }

  function saveJobs() {
    try {
      const obj = {}
      for (const [id, job] of jobs) {
        obj[id] = job
      }
      fs.writeFileSync(jobsFile(), JSON.stringify({ jobs: obj }, null, 2), 'utf8')
    } catch {}
  }

  function saveResult(resultId, result) {
    try {
      ensureDirs()
      fs.writeFileSync(path.join(resultsDir(), `${resultId}.json`), JSON.stringify(result, null, 2), 'utf8')
    } catch {}
  }

  function loadResult(resultId) {
    try {
      const file = path.join(resultsDir(), `${resultId}.json`)
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
      }
    } catch {}
    return null
  }

  function createJob(source, options = {}) {
    ensureDirs()
    loadJobs()

    const id = jobId()
    const now = new Date().toISOString()

    const safeDisplayName = source.kind === 'local_file' && source.path
      ? redactPath(source.path)
      : source.original_name || source.url || 'unknown'

    const job = {
      job_id: id,
      status: 'queued',
      progress: 0,
      stage: 'queued',
      message: 'Queued for parsing',
      source: {
        ...source,
        safe_display_path: safeDisplayName,
      },
      project_id: options.projectId || options.project_id || null,
      library_id: options.libraryId || options.library_id || null,
      intent: options.intent || 'chat_context',
      options: options.options || {},
      created_at: now,
      started_at: null,
      completed_at: null,
      result_id: resultIdFor(id),
    }

    jobs.set(id, job)
    saveJobs()

    process.nextTick(() => runJob(id))

    return job
  }

  async function runJob(jobId) {
    const job = jobs.get(jobId)
    if (!job) return

    job.status = 'running'
    job.started_at = new Date().toISOString()
    job.stage = 'detecting'
    job.progress = 0.05
    job.message = 'Detecting file type...'
    jobEvents.emit('update', job)
    saveJobs()

    try {
      const resultId = job.result_id
      let parseResult

      if (job.source.kind === 'local_file' && job.source.path) {
        job.stage = 'parsing'
        job.progress = 0.2
        job.message = 'Parsing file content...'
        jobEvents.emit('update', job)
        saveJobs()

        parseResult = await parseFile(job.source.path, job.options || {})
      } else if (job.source.kind === 'composer_attachment' && job.source.path) {
        job.stage = 'parsing'
        job.progress = 0.2
        job.message = 'Parsing attachment...'
        jobEvents.emit('update', job)
        saveJobs()

        parseResult = await parseFile(job.source.path, job.options || {})
      } else if (job.source.kind === 'remote_url' && job.source.url) {
        job.stage = 'fetching'
        job.progress = 0.1
        job.message = 'URL fetching not yet implemented'
        parseResult = {
          ok: false,
          status: 'unsupported',
          error: 'URL parsing not yet implemented',
          media_type: 'webpage',
          text: '',
          markdown: '',
          chunks: [],
          warnings: ['URL resource parsing coming in future phases'],
        }
      } else {
        parseResult = {
          ok: false,
          status: 'failed',
          error: 'Invalid source',
          media_type: 'unknown_binary',
          text: '',
          markdown: '',
          chunks: [],
          warnings: [],
        }
      }

      job.progress = 0.9
      job.stage = 'finalizing'
      job.message = 'Finalizing results...'
      jobEvents.emit('update', job)

      const now = new Date().toISOString()
      const resultStatus = parseResult.status || (parseResult.ok ? 'parsed' : 'failed')
      const result = {
        id: resultId,
        job_id: jobId,
        source: job.source,
        media_type: parseResult.media_type || 'unknown_binary',
        status: resultStatus,
        text: parseResult.text || '',
        markdown: parseResult.markdown || '',
        json: parseResult.json || null,
        chunks: parseResult.chunks || [],
        artifacts: parseResult.artifacts || [],
        warnings: parseResult.warnings || [],
        error: parseResult.error || null,
        metadata: parseResult.meta || {},
        created_at: now,
        project_id: job.project_id,
        library_id: job.library_id,
        intent: job.intent,
      }

      saveResult(resultId, result)

      job.status = resultStatus === 'parsed' ? 'parsed' : (resultStatus === 'partial' ? 'partial' : 'failed')
      job.progress = 1
      job.stage = 'done'
      job.message = resultStatus === 'parsed' ? 'Parsing complete' : (resultStatus === 'partial' ? 'Parsed with warnings' : (parseResult.error || 'Parse failed'))
      job.completed_at = now
      jobEvents.emit('update', job)
      jobEvents.emit('complete', job)
      saveJobs()
    } catch (err) {
      job.status = 'failed'
      job.progress = 1
      job.stage = 'error'
      job.message = err.message || String(err)
      job.error = err.message || String(err)
      job.completed_at = new Date().toISOString()
      jobEvents.emit('update', job)
      jobEvents.emit('error', job)
      saveJobs()
    }
  }

  function getJob(jobId) {
    loadJobs()
    const job = jobs.get(jobId)
    return job || null
  }

  function getResult(resultId) {
    return loadResult(resultId)
  }

  function getResultByJobId(jobId) {
    const job = jobs.get(jobId)
    if (!job) return null
    return loadResult(job.result_id)
  }

  function cancelJob(jobId) {
    const job = jobs.get(jobId)
    if (job && (job.status === 'queued' || job.status === 'running')) {
      job.status = 'cancelled'
      job.message = 'Cancelled by user'
      job.error = 'Cancelled'
      job.completed_at = new Date().toISOString()
      saveJobs()
      jobEvents.emit('update', job)
      return true
    }
    return false
  }

  function getParseCapabilities() {
    const caps = {
      pdf: {
        available: false,
        engines: [],
        default_engine: 'auto',
        mineru_enabled: false,
      },
      ocr: {
        available: false,
        engines: [],
      },
      video: {
        available: false,
        ffmpeg_found: false,
      },
    }

    let pdfEngine = null
    try {
      execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', 'import fitz; print("ok")'], { stdio: 'pipe', timeout: 5000 })
      pdfEngine = 'pymupdf'
    } catch {}

    if (!pdfEngine) {
      try {
        execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', 'import pdfplumber; print("ok")'], { stdio: 'pipe', timeout: 5000 })
        pdfEngine = 'pdfplumber'
      } catch {}
    }

    if (!pdfEngine) {
      try {
        execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', 'from pypdf import PdfReader; print("ok")'], { stdio: 'pipe', timeout: 5000 })
        pdfEngine = 'pypdf'
      } catch {}
    }

    if (pdfEngine) {
      caps.pdf.available = true
      caps.pdf.engines = [pdfEngine]
    }

    try {
      execFileSync(process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe', ['-version'], { stdio: 'pipe', timeout: 5000 })
      caps.video.available = true
      caps.video.ffmpeg_found = true
    } catch {}

    caps.ocr.available = Boolean(callChatCompletion)
    if (caps.ocr.available) {
      caps.ocr.engines = ['vision_model']
    }

    return caps
  }

  function materializeResult({ resultId, markdown, originalName }) {
    try {
      ensureDirs()
      const safeName = slugify(originalName || resultId)
      const fileName = `${resultId}_${safeName}.md`
      const filePath = path.join(artifactsDir(), fileName)
      fs.writeFileSync(filePath, markdown || '', 'utf8')
      return { ok: true, normalizedPath: path.resolve(filePath) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  ensureDirs()
  loadJobs()

  return {
    createJob,
    getJob,
    getResult,
    getResultByJobId,
    cancelJob,
    parseFile,
    getParseCapabilities,
    getMediaType,
    redactPath,
    chunkText,
    materializeResult,
    jobEvents,
  }
}

module.exports = { createIngestService }
