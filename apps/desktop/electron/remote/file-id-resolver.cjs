'use strict'

const crypto = require('node:crypto')

function base64urlEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function base64urlDecode(str) {
  let padded = str.replace(/-/g, '+').replace(/_/g, '/')
  while (padded.length % 4) padded += '='
  return Buffer.from(padded, 'base64')
}

function hashRelativePath(relativePath) {
  return crypto.createHash('sha256')
    .update(relativePath)
    .digest()
}

function generateFileId(projectId, relativePath) {
  const normalizedPath = relativePath.replace(/\\/g, '/')
  const pathHash = hashRelativePath(normalizedPath)
  const data = `${projectId}:${pathHash.toString('base64').slice(0, 16)}`
  return base64urlEncode(Buffer.from(data))
}

function parseFileId(fileId) {
  try {
    const decoded = base64urlDecode(fileId).toString('utf8')
    const colonIndex = decoded.lastIndexOf(':')
    if (colonIndex <= 0) {
      return null
    }
    const projectId = decoded.slice(0, colonIndex)
    const pathHashPart = decoded.slice(colonIndex + 1)
    return { projectId, pathHashPart }
  } catch (_) {
    return null
  }
}

function createFileIdResolver(deps = {}) {
  const {
    cryptoDep = crypto,
    fsDep = require('node:fs'),
    pathDep = require('node:path')
  } = deps

  const resolvedFiles = new Map()

  function computeSourceHash(filePath) {
    return new Promise((resolve) => {
      try {
        const hash = cryptoDep.createHash('sha256')
        const stream = fsDep.createReadStream(filePath)
        stream.on('data', chunk => hash.update(chunk))
        stream.on('end', () => resolve(hash.digest('hex')))
        stream.on('error', () => resolve(null))
      } catch (_) {
        resolve(null)
      }
    })
  }

  function computeSourceHashSync(filePath) {
    try {
      const hash = cryptoDep.createHash('sha256')
      const data = fsDep.readFileSync(filePath)
      hash.update(data)
      return hash.digest('hex')
    } catch (_) {
      return null
    }
  }

  async function resolveFile(fileId, projectRoots) {
    const parsed = parseFileId(fileId)
    if (!parsed) {
      return { ok: false, error: 'invalid_file_id' }
    }

    const { projectId, pathHashPart } = parsed
    const rootPath = projectRoots.get(projectId)
    if (!rootPath) {
      return { ok: false, error: 'project_not_found' }
    }

    const cacheKey = `${projectId}:${pathHashPart}`
    const cached = resolvedFiles.get(cacheKey)
    if (cached) {
      try {
        const stat = fsDep.statSync(cached.realPath)
        const currentVersion = cryptoDep.createHash('sha256')
          .update(`${cached.realPath}:${stat.mtimeMs}:${stat.size}`)
          .digest('hex')
          .slice(0, 16)

        if (currentVersion === cached.version) {
          if (!isPathContained(cached.realPath, rootPath, pathDep)) {
            resolvedFiles.delete(cacheKey)
            return { ok: false, error: 'path_outside_project' }
          }
          return { ok: true, file: cached }
        } else {
          resolvedFiles.delete(cacheKey)
        }
      } catch (_) {
        resolvedFiles.delete(cacheKey)
      }
    }

    return { ok: false, error: 'file_not_registered' }
  }

  function resolveFileSync(fileId, projectRoots) {
    const parsed = parseFileId(fileId)
    if (!parsed) {
      return { ok: false, error: 'invalid_file_id' }
    }

    const { projectId, pathHashPart } = parsed
    const rootPath = projectRoots.get(projectId)
    if (!rootPath) {
      return { ok: false, error: 'project_not_found' }
    }

    const cacheKey = `${projectId}:${pathHashPart}`
    const cached = resolvedFiles.get(cacheKey)
    if (cached) {
      try {
        const stat = fsDep.statSync(cached.realPath)
        const currentVersion = cryptoDep.createHash('sha256')
          .update(`${cached.realPath}:${stat.mtimeMs}:${stat.size}`)
          .digest('hex')
          .slice(0, 16)

        if (currentVersion === cached.version) {
          if (!isPathContained(cached.realPath, rootPath, pathDep)) {
            resolvedFiles.delete(cacheKey)
            return { ok: false, error: 'path_outside_project' }
          }
          return { ok: true, file: cached }
        } else {
          resolvedFiles.delete(cacheKey)
        }
      } catch (_) {
        resolvedFiles.delete(cacheKey)
      }
    }

    return { ok: false, error: 'file_not_registered' }
  }

  function registerFile(projectId, relativePath, realPath, stat) {
    const normalizedPath = relativePath.replace(/\\/g, '/')
    const fileId = generateFileId(projectId, normalizedPath)
    const version = cryptoDep.createHash('sha256')
      .update(`${realPath}:${stat.mtimeMs}:${stat.size}`)
      .digest('hex')
      .slice(0, 16)

    const pathHashPart = parseFileId(fileId)?.pathHashPart
    const cacheKey = `${projectId}:${pathHashPart}`

    const entry = {
      fileId,
      projectId,
      relativePath: normalizedPath,
      realPath,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      version,
      filename: pathDep.basename(realPath),
      registeredAt: Date.now()
    }

    resolvedFiles.set(cacheKey, entry)
    return entry
  }

  function isPathContained(targetPath, rootPath, pathModule = pathDep) {
    const normalizedTarget = pathModule.resolve(targetPath)
    const normalizedRoot = pathModule.resolve(rootPath)
    if (normalizedTarget === normalizedRoot) return true
    const relative = pathModule.relative(normalizedRoot, normalizedTarget)
    return relative && !relative.startsWith('..') && !pathModule.isAbsolute(relative)
  }

  function invalidateFile(fileId) {
    const parsed = parseFileId(fileId)
    if (!parsed) return false
    const cacheKey = `${parsed.projectId}:${parsed.pathHashPart}`
    return resolvedFiles.delete(cacheKey)
  }

  function invalidateProject(projectId) {
    const prefix = `${projectId}:`
    for (const [key] of resolvedFiles.entries()) {
      if (key.startsWith(prefix)) {
        resolvedFiles.delete(key)
      }
    }
  }

  function getStats() {
    return {
      cachedFiles: resolvedFiles.size
    }
  }

  function initialize() {
    resolvedFiles.clear()
  }

  return Object.freeze({
    generateFileId,
    parseFileId,
    resolveFile,
    resolveFileSync,
    registerFile,
    isPathContained,
    invalidateFile,
    invalidateProject,
    computeSourceHash,
    computeSourceHashSync,
    getStats,
    initialize
  })
}

module.exports = {
  createFileIdResolver,
  generateFileId,
  parseFileId
}
