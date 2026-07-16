/* eslint-disable no-empty -- optional filesystem fallbacks intentionally degrade to defaults. */
'use strict'

function createStorageUtils({ fs, path }) {
  const cloneJson = value => JSON.parse(JSON.stringify(value))

  const ensureDir = dir => {
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  const readJsonFile = (file, fallback) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
  }

  const writeJsonFile = (file, data) => {
    ensureDir(path.dirname(file))
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    return data
  }

  const atomicWrite = (file, data) => {
    const tempFile = `${file}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    ensureDir(path.dirname(file))
    fs.writeFileSync(tempFile, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    fs.renameSync(tempFile, file)
    return data
  }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

  const withLock = async (lockFile, fn) => {
    const maxRetries = 3
    const retryDelay = 50
    let lastError

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        fs.mkdirSync(lockFile)
        try {
          return await fn()
        } finally {
          try { fs.rmdirSync(lockFile) } catch {}
        }
      } catch (err) {
        lastError = err
        if (attempt < maxRetries) {
          await sleep(retryDelay)
        }
      }
    }

    throw new Error(`Failed to acquire lock: ${lockFile}`, { cause: lastError })
  }

  return {
    cloneJson,
    ensureDir,
    readJsonFile,
    writeJsonFile,
    atomicWrite,
    withLock
  }
}

module.exports = { createStorageUtils }
