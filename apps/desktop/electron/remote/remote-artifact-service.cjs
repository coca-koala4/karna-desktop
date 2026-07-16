'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const TICKET_TTL_MS = 5 * 60 * 1000
const DEFAULT_CHUNK_SIZE = 256 * 1024
const MAX_FILE_SIZE = 100 * 1024 * 1024
const MAX_FILE_TREE_DEPTH = 20
const MAX_FILES_PER_TREE = 10000

const WINDOWS_DEVICE_PATH_PREFIXES = ['\\\\.\\', '\\\\?\\']
const WINDOWS_UNC_PREFIX = '\\\\'

function isWindowsDevicePath(filePath) {
  const normalized = filePath.replace(/\//g, '\\')
  for (const prefix of WINDOWS_DEVICE_PATH_PREFIXES) {
    if (normalized.startsWith(prefix)) return true
  }
  return false
}

function isWindowsUncPath(filePath) {
  if (process.platform !== 'win32') return false
  const normalized = filePath.replace(/\//g, '\\')
  return normalized.startsWith(WINDOWS_UNC_PREFIX) && !normalized.startsWith('\\\\?\\') && !normalized.startsWith('\\\\.\\')
}

function containsPathTraversal(filePath) {
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  for (const part of parts) {
    if (part === '..') return true
  }
  return false
}

function createArtifactService(deps = {}) {
  const {
    fsDep = fs,
    pathDep = path,
    cryptoDep = crypto,
    projectFacade,
    authorizationManager,
    auditLogger,
    eventStore,
    fileIdResolver,
    previewService
  } = deps

  const downloadTickets = new Map()
  const projectRoots = new Map()
  let ticketSeq = 0

  function generateTicketId() {
    ticketSeq += 1
    return `ticket_${Date.now()}_${ticketSeq}_${cryptoDep.randomBytes(6).toString('hex')}`
  }

  function safeRealPath(filePath) {
    try {
      return fsDep.realpathSync.native(filePath)
    } catch (_) {
      try {
        return fsDep.realpathSync(filePath)
      } catch (_) {
        return null
      }
    }
  }

  function isPathContained(targetPath, rootPath) {
    if (!fileIdResolver) {
      const normalizedTarget = pathDep.resolve(targetPath)
      const normalizedRoot = pathDep.resolve(rootPath)
      if (normalizedTarget === normalizedRoot) return true
      const relative = pathDep.relative(normalizedRoot, normalizedTarget)
      return relative && !relative.startsWith('..') && !pathDep.isAbsolute(relative)
    }
    return fileIdResolver.isPathContained(targetPath, rootPath, pathDep)
  }

  function validatePath(filePath, rootPath) {
    if (!filePath || typeof filePath !== 'string') {
      return { valid: false, error: 'invalid_path' }
    }

    if (containsPathTraversal(filePath)) {
      return { valid: false, error: 'path_outside_project' }
    }

    if (process.platform === 'win32') {
      if (isWindowsDevicePath(filePath)) {
        return { valid: false, error: 'access_denied' }
      }
    }

    const resolvedPath = pathDep.resolve(filePath)
    const realPath = safeRealPath(resolvedPath)
    if (!realPath) {
      return { valid: false, error: 'file_not_found' }
    }

    try {
      const stat = fsDep.lstatSync(realPath)
      if (stat.isSymbolicLink()) {
        const linkTarget = safeRealPath(realPath)
        if (!linkTarget) {
          return { valid: false, error: 'access_denied' }
        }
        if (rootPath && !isPathContained(linkTarget, rootPath)) {
          return { valid: false, error: 'path_outside_project' }
        }
      }

      const realStat = fsDep.statSync(realPath)
      if (!realStat.isFile()) {
        return { valid: false, error: 'not_a_file' }
      }
      if (realStat.size > MAX_FILE_SIZE) {
        return { valid: false, error: 'file_too_large', maxSize: MAX_FILE_SIZE }
      }
    } catch (_) {
      return { valid: false, error: 'file_not_found' }
    }

    if (rootPath) {
      const normalizedRoot = pathDep.resolve(rootPath)
      if (process.platform === 'win32') {
        if (realPath.toLowerCase().indexOf(normalizedRoot.toLowerCase()) !== 0) {
          return { valid: false, error: 'path_outside_project' }
        }
      } else {
        if (!isPathContained(realPath, normalizedRoot)) {
          return { valid: false, error: 'path_outside_project' }
        }
      }
    }

    return { valid: true, realPath }
  }

  function registerProjectRoot(projectId, rootPath) {
    if (!projectId || !rootPath) return false
    const resolved = pathDep.resolve(rootPath)
    try {
      const stat = fsDep.statSync(resolved)
      if (!stat.isDirectory()) return false
    } catch (_) {
      return false
    }
    projectRoots.set(projectId, resolved)
    if (fileIdResolver) {
      fileIdResolver.invalidateProject(projectId)
    }
    return true
  }

  function getProjectRoot(projectId) {
    return projectRoots.get(projectId) || null
  }

  function ensureProjectRoot(projectId, deviceId) {
    let rootPath = getProjectRoot(projectId)
    if (rootPath) return { ok: true, rootPath }

    if (projectFacade) {
      const projectResult = projectFacade.getProject(deviceId, projectId)
      if (projectResult.ok && projectResult.project && projectResult.project.folder) {
        registerProjectRoot(projectId, projectResult.project.folder)
        rootPath = getProjectRoot(projectId)
        if (rootPath) return { ok: true, rootPath }
      }
    }

    return { ok: false, error: 'project_not_found' }
  }

  function detectFileType(filename) {
    if (previewService) {
      return previewService.detectFileType(filename)
    }
    const ext = pathDep.extname(filename).toLowerCase()
    const markdownExts = new Set(['.md', '.markdown', '.mdown'])
    const codeExts = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.html', '.css', '.scss', '.xml', '.yaml', '.yml', '.toml', '.ini', '.sh', '.bash', '.ps1', '.sql'])
    const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])
    if (markdownExts.has(ext)) return 'markdown'
    if (ext === '.pdf') return 'pdf'
    if (ext === '.docx' || ext === '.doc') return 'docx'
    if (ext === '.json') return 'json'
    if (imageExts.has(ext)) return 'image'
    if (codeExts.has(ext)) return 'code'
    if (ext === '.txt') return 'txt'
    return 'unknown'
  }

  function getRelativePath(fullPath, rootPath) {
    const relative = pathDep.relative(rootPath, fullPath)
    return relative.replace(/\\/g, '/')
  }

  function listDirectoryRecursive(dirPath, rootPath, projectId, depth = 0, result = { files: [], count: 0 }) {
    if (depth > MAX_FILE_TREE_DEPTH) return result
    if (result.count > MAX_FILES_PER_TREE) return result

    let entries
    try {
      entries = fsDep.readdirSync(dirPath, { withFileTypes: true })
    } catch (_) {
      return result
    }

    for (const entry of entries) {
      if (result.count > MAX_FILES_PER_TREE) break
      const fullPath = pathDep.join(dirPath, entry.name)

      if (entry.name.startsWith('.') && entry.name !== '.') continue
      if (entry.name === 'node_modules' || entry.name === '.git') continue

      let realPath
      try {
        realPath = safeRealPath(fullPath)
        if (!realPath) continue
      } catch (_) {
        continue
      }

      if (process.platform === 'win32') {
        const normalizedRoot = pathDep.resolve(rootPath).toLowerCase()
        if (realPath.toLowerCase().indexOf(normalizedRoot) !== 0) continue
      } else {
        if (!isPathContained(realPath, rootPath)) continue
      }

      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        listDirectoryRecursive(fullPath, rootPath, projectId, depth + 1, result)
      } else if (entry.isFile() && !entry.isSymbolicLink()) {
        try {
          const stat = fsDep.statSync(realPath)
          const relativePath = getRelativePath(realPath, rootPath)
          let fid = null

          if (fileIdResolver) {
            fid = fileIdResolver.generateFileId(projectId, relativePath)
            fileIdResolver.registerFile(projectId, relativePath, realPath, stat)
          }

          result.files.push({
            filename: entry.name,
            relativePath,
            type: detectFileType(entry.name),
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            fileId: fid
          })
          result.count += 1
        } catch (_) {}
      }
    }

    return result
  }

  function getProjectFiles(projectId, deviceId) {
    const rootResult = ensureProjectRoot(projectId, deviceId)
    if (!rootResult.ok) {
      return { ok: false, error: rootResult.error }
    }

    if (authorizationManager) {
      const auth = authorizationManager.checkCapability(deviceId, 'project_read', { projectId })
      if (!auth.allowed) {
        return { ok: false, error: auth.reason || 'access_denied' }
      }
    }

    const rootPath = rootResult.rootPath
    const treeResult = listDirectoryRecursive(rootPath, rootPath, projectId)

    return {
      ok: true,
      projectId,
      rootPath,
      files: treeResult.files
    }
  }

  function registerFileByPath(projectId, relativePath, deviceId) {
    const rootResult = ensureProjectRoot(projectId, deviceId)
    if (!rootResult.ok) {
      return { ok: false, error: rootResult.error }
    }

    const rootPath = rootResult.rootPath
    const normalizedRelative = relativePath.replace(/\\/g, '/').replace(/^\.\//, '')

    if (containsPathTraversal(normalizedRelative)) {
      return { ok: false, error: 'path_outside_project' }
    }

    const fullPath = pathDep.resolve(rootPath, normalizedRelative)

    if (process.platform === 'win32') {
      if (isWindowsDevicePath(fullPath)) {
        return { ok: false, error: 'access_denied' }
      }
    }

    const validation = validatePath(fullPath, rootPath)
    if (!validation.valid) {
      return { ok: false, error: validation.error }
    }

    const realPath = validation.realPath
    const stat = fsDep.statSync(realPath)

    if (fileIdResolver) {
      const entry = fileIdResolver.registerFile(projectId, normalizedRelative, realPath, stat)
      return {
        ok: true,
        fileId: entry.fileId,
        version: entry.version,
        size: stat.size,
        filename: pathDep.basename(realPath),
        relativePath: normalizedRelative,
        mtimeMs: stat.mtimeMs,
        type: detectFileType(pathDep.basename(realPath))
      }
    }

    const version = cryptoDep.createHash('sha256').update(`${realPath}:${stat.mtimeMs}:${stat.size}`).digest('hex').slice(0, 16)
    const fileId = `file_${projectId}_${cryptoDep.createHash('sha256').update(normalizedRelative).digest('hex').slice(0, 16)}`

    return {
      ok: true,
      fileId,
      version,
      size: stat.size,
      filename: pathDep.basename(realPath),
      relativePath: normalizedRelative,
      mtimeMs: stat.mtimeMs,
      type: detectFileType(pathDep.basename(realPath)),
      realPath
    }
  }

  function getFileInfo(fileId) {
    if (fileIdResolver) {
      const resolved = fileIdResolver.resolveFileSync(fileId, projectRoots)
      if (!resolved.ok) {
        return { ok: false, error: 'file_not_found' }
      }
      const entry = resolved.file
      return {
        ok: true,
        file: {
          fileId: entry.fileId,
          filename: entry.filename,
          projectId: entry.projectId,
          relativePath: entry.relativePath,
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          version: entry.version,
          type: detectFileType(entry.filename)
        }
      }
    }

    return { ok: false, error: 'file_not_found' }
  }

  function resolveFileEntry(fileId, deviceId) {
    if (fileIdResolver) {
      const resolved = fileIdResolver.resolveFileSync(fileId, projectRoots)
      if (!resolved.ok) {
        return { ok: false, error: 'file_not_found' }
      }

      const entry = resolved.file
      const rootPath = projectRoots.get(entry.projectId)
      if (rootPath) {
        if (!isPathContained(entry.realPath, rootPath)) {
          fileIdResolver.invalidateFile(fileId)
          return { ok: false, error: 'path_outside_project' }
        }
      }

      if (authorizationManager) {
        const auth = authorizationManager.checkCapability(deviceId, 'project_read', { projectId: entry.projectId })
        if (!auth.allowed) {
          return { ok: false, error: 'access_denied' }
        }
      }

      return { ok: true, entry }
    }
    return { ok: false, error: 'file_not_found' }
  }

  function createDownloadTicket(fileId, context = {}) {
    const { deviceId, projectId } = context

    const fileResult = resolveFileEntry(fileId, deviceId)
    if (!fileResult.ok) {
      return { ok: false, error: fileResult.error }
    }

    const entry = fileResult.entry

    if (projectId && entry.projectId !== projectId) {
      return { ok: false, error: 'access_denied' }
    }

    const ticketId = generateTicketId()
    const expiresAt = Date.now() + TICKET_TTL_MS
    const ticketHash = cryptoDep.createHash('sha256')
      .update(ticketId)
      .update(deviceId || '')
      .update(entry.version)
      .update(String(expiresAt))
      .digest('hex')

    const ticket = {
      ticketId,
      ticketHash,
      fileId,
      fileVersion: entry.version,
      deviceId: deviceId || null,
      projectId: entry.projectId,
      createdAt: Date.now(),
      expiresAt,
      used: false,
      chunkSize: DEFAULT_CHUNK_SIZE,
      filename: entry.filename,
      size: entry.size
    }

    downloadTickets.set(ticketId, ticket)
    pruneExpiredTickets()

    if (eventStore) {
      eventStore.append('artifact.ticket_created', {
        ticketId,
        fileId,
        deviceId,
        projectId: entry.projectId,
        expiresAt
      })
    }

    return {
      ok: true,
      ticket: {
        ticketId,
        ticketHash,
        fileId,
        fileVersion: entry.version,
        expiresAt,
        chunkSize: DEFAULT_CHUNK_SIZE,
        size: entry.size,
        filename: entry.filename,
        type: detectFileType(entry.filename)
      }
    }
  }

  function validateTicket(ticketId, ticketHash, deviceId) {
    pruneExpiredTickets()
    const ticket = downloadTickets.get(ticketId)
    if (!ticket) {
      return { valid: false, error: 'invalid_ticket' }
    }
    if (ticket.used) {
      return { valid: false, error: 'invalid_ticket' }
    }
    if (Date.now() > ticket.expiresAt) {
      downloadTickets.delete(ticketId)
      return { valid: false, error: 'invalid_ticket' }
    }
    if (ticket.deviceId && ticket.deviceId !== deviceId) {
      return { valid: false, error: 'invalid_ticket' }
    }
    const expectedHash = cryptoDep.createHash('sha256')
      .update(ticketId)
      .update(deviceId || '')
      .update(ticket.fileVersion)
      .update(String(ticket.expiresAt))
      .digest('hex')
    if (ticketHash && ticketHash !== expectedHash) {
      return { valid: false, error: 'invalid_ticket' }
    }
    return { valid: true, ticket }
  }

  function consumeTicket(ticketId) {
    const ticket = downloadTickets.get(ticketId)
    if (ticket) {
      ticket.used = true
    }
  }

  function readChunk(filePath, offset, length) {
    return new Promise((resolve, reject) => {
      const stream = fsDep.createReadStream(filePath, { start: offset, end: offset + length - 1 })
      const chunks = []
      stream.on('data', chunk => chunks.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })
  }

  async function handleDownload(ticketId, ticketHash, deviceId, rangeHeader) {
    const validation = validateTicket(ticketId, ticketHash, deviceId)
    if (!validation.valid) {
      return { ok: false, error: validation.error, statusCode: 403 }
    }

    const ticket = validation.ticket
    const fileResult = resolveFileEntry(ticket.fileId, deviceId)
    if (!fileResult.ok) {
      return { ok: false, error: fileResult.error, statusCode: 404 }
    }

    const entry = fileResult.entry

    try {
      const stat = fsDep.statSync(entry.realPath)
      const currentVersion = cryptoDep.createHash('sha256')
        .update(`${entry.realPath}:${stat.mtimeMs}:${stat.size}`)
        .digest('hex')
        .slice(0, 16)

      if (currentVersion !== ticket.fileVersion) {
        downloadTickets.delete(ticketId)
        if (previewService) previewService.invalidatePreviewsForFile(ticket.fileId)
        return { ok: false, error: 'file_modified', statusCode: 409 }
      }

      let start = 0
      let end = stat.size - 1
      let isRangeRequest = false

      if (rangeHeader) {
        const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/)
        if (rangeMatch) {
          start = parseInt(rangeMatch[1], 10)
          if (rangeMatch[2]) {
            end = parseInt(rangeMatch[2], 10)
          }
          if (start >= stat.size) {
            return { ok: false, error: 'range_not_satisfiable', statusCode: 416 }
          }
          end = Math.min(end, stat.size - 1)
          isRangeRequest = true
        }
      }

      const chunkLength = end - start + 1
      const data = await readChunk(entry.realPath, start, chunkLength)

      if (!isRangeRequest) {
        consumeTicket(ticketId)
      } else if (end >= stat.size - 1) {
        consumeTicket(ticketId)
      }

      return {
        ok: true,
        data,
        start,
        end,
        totalSize: stat.size,
        isRangeRequest,
        filename: entry.filename,
        contentType: getContentType(entry.filename),
        done: end >= stat.size - 1
      }
    } catch (err) {
      return { ok: false, error: 'read_failed', statusCode: 500, message: err.message }
    }
  }

  async function downloadChunk(ticketId, ticketHash, deviceId, offset = 0) {
    const validation = validateTicket(ticketId, ticketHash, deviceId)
    if (!validation.valid) {
      return { ok: false, error: validation.error }
    }

    const ticket = validation.ticket
    const fileResult = resolveFileEntry(ticket.fileId, deviceId)
    if (!fileResult.ok) {
      return { ok: false, error: fileResult.error }
    }

    const entry = fileResult.entry

    try {
      const stat = fsDep.statSync(entry.realPath)
      const currentVersion = cryptoDep.createHash('sha256')
        .update(`${entry.realPath}:${stat.mtimeMs}:${stat.size}`)
        .digest('hex')
        .slice(0, 16)

      if (currentVersion !== ticket.fileVersion) {
        downloadTickets.delete(ticketId)
        return { ok: false, error: 'file_modified' }
      }

      if (offset >= stat.size) {
        consumeTicket(ticketId)
        return { ok: true, done: true, data: null, offset: stat.size }
      }

      const chunkLength = Math.min(ticket.chunkSize, stat.size - offset)
      const data = await readChunk(entry.realPath, offset, chunkLength)
      const isLast = offset + chunkLength >= stat.size
      if (isLast) {
        consumeTicket(ticketId)
      }

      return {
        ok: true,
        done: isLast,
        data: data.toString('base64'),
        offset: offset + chunkLength,
        totalSize: stat.size
      }
    } catch (err) {
      return { ok: false, error: 'read_failed', message: err.message }
    }
  }

  function getContentType(filename) {
    const ext = pathDep.extname(filename).toLowerCase()
    const types = {
      '.md': 'text/markdown',
      '.markdown': 'text/markdown',
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.jsx': 'text/javascript',
      '.tsx': 'text/typescript',
      '.py': 'text/x-python',
      '.html': 'text/html',
      '.css': 'text/css',
      '.xml': 'application/xml',
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',
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

  async function createPreview(fileId, context = {}, options = {}) {
    if (!previewService) {
      return { ok: false, error: 'preview_service_unavailable' }
    }

    const { deviceId } = context
    const fileResult = resolveFileEntry(fileId, deviceId)
    if (!fileResult.ok) {
      return { ok: false, error: fileResult.error }
    }

    const entry = fileResult.entry
    const stat = fsDep.statSync(entry.realPath)

    const previewEntry = {
      fileId: entry.fileId,
      filename: entry.filename,
      projectId: entry.projectId,
      relativePath: entry.relativePath,
      realPath: entry.realPath,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      version: entry.version
    }

    const result = await previewService.createPreview(previewEntry, {
      projectId: entry.projectId,
      ...options
    })

    if (!result.ok) {
      return result
    }

    if (eventStore) {
      eventStore.append('artifact.preview_created', {
        fileId,
        previewId: result.previewId,
        fileType: result.fileType
      })
    }

    return result
  }

  function getPreviewManifest(previewId) {
    if (!previewService) {
      return { ok: false, error: 'preview_service_unavailable' }
    }
    return previewService.getPreviewManifest(previewId)
  }

  async function getPreviewChunk(previewId, chunkIndex) {
    if (!previewService) {
      return { ok: false, error: 'preview_service_unavailable' }
    }
    return previewService.getPreviewChunk(previewId, chunkIndex)
  }

  function pruneExpiredTickets() {
    const now = Date.now()
    for (const [id, ticket] of downloadTickets.entries()) {
      if (now > ticket.expiresAt || ticket.used) {
        downloadTickets.delete(id)
      }
    }
  }

  function revokeFile(fileId) {
    if (fileIdResolver) {
      fileIdResolver.invalidateFile(fileId)
    }
    for (const [tid, ticket] of downloadTickets.entries()) {
      if (ticket.fileId === fileId) {
        downloadTickets.delete(tid)
      }
    }
    if (previewService) {
      previewService.invalidatePreviewsForFile(fileId)
    }
    return { ok: true }
  }

  function getStats() {
    pruneExpiredTickets()
    return {
      activeTickets: downloadTickets.size,
      projectRoots: projectRoots.size,
      maxFileSize: MAX_FILE_SIZE,
      defaultChunkSize: DEFAULT_CHUNK_SIZE,
      ticketTtlMs: TICKET_TTL_MS,
      previewStats: previewService ? previewService.getStats() : null,
      fileResolverStats: fileIdResolver ? fileIdResolver.getStats() : null
    }
  }

  function initialize() {
    downloadTickets.clear()
    projectRoots.clear()
    ticketSeq = 0
    if (fileIdResolver) fileIdResolver.initialize()
    if (previewService) previewService.initialize()
  }

  function setDeps(newDeps = {}) {
    if (newDeps.previewService) deps.previewService = newDeps.previewService
    if (newDeps.fileIdResolver) deps.fileIdResolver = newDeps.fileIdResolver
  }

  return Object.freeze({
    initialize,
    setDeps,
    registerProjectRoot,
    getProjectRoot,
    ensureProjectRoot,
    registerFileByPath,
    getProjectFiles,
    getFileInfo,
    resolveFileEntry,
    createDownloadTicket,
    downloadChunk,
    handleDownload,
    validateTicket,
    revokeFile,
    createPreview,
    getPreviewManifest,
    getPreviewChunk,
    detectFileType,
    getContentType,
    isPathContained,
    validatePath,
    getStats
  })
}

module.exports = {
  createArtifactService,
  TICKET_TTL_MS,
  DEFAULT_CHUNK_SIZE,
  MAX_FILE_SIZE
}
