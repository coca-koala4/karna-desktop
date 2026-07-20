"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { execSync } = require("node:child_process")

const DESKTOP_ROOT = path.resolve(__dirname, "..")
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "..", "..")
const PKG_FILE = path.join(DESKTOP_ROOT, "package.json")
const STAMP_FILE = path.join(DESKTOP_ROOT, "build", "install-stamp.json")
const RELEASE_NOTES_FILE = path.join(DESKTOP_ROOT, "electron", "release-notes.md")

const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

function parseArgs(argv) {
  const args = { allowDirty: false }
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--allow-dirty") {
      args.allowDirty = true
    }
  }
  return args
}

function isValidSemver(version) {
  return SEMVER_REGEX.test(String(version || "").trim())
}

function readPackageVersion() {
  if (!fs.existsSync(PKG_FILE)) {
    return { source: "package.json", version: null, error: `File not found: ${PKG_FILE}` }
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(PKG_FILE, "utf8"))
    const version = pkg.version || null
    const valid = version ? isValidSemver(version) : false
    return {
      source: "package.json",
      version,
      valid,
      error: version && !valid ? `Invalid semver format: ${version}` : null
    }
  } catch (err) {
    return { source: "package.json", version: null, error: `Parse error: ${err.message}` }
  }
}

function readStampVersion() {
  if (!fs.existsSync(STAMP_FILE)) {
    return { source: "install-stamp.json", version: null, warning: `File not found: ${STAMP_FILE} (expected after build)` }
  }
  try {
    const stamp = JSON.parse(fs.readFileSync(STAMP_FILE, "utf8"))
    const version = stamp.desktopVersion || null
    const valid = version ? isValidSemver(version) : false
    return {
      source: "install-stamp.json",
      version,
      valid,
      error: version && !valid ? `Invalid semver format: ${version}` : null
    }
  } catch (err) {
    return { source: "install-stamp.json", version: null, error: `Parse error: ${err.message}` }
  }
}

function readReleaseNotesVersion() {
  if (!fs.existsSync(RELEASE_NOTES_FILE)) {
    return { source: "release-notes.md", version: null, warning: `File not found: ${RELEASE_NOTES_FILE}` }
  }
  try {
    const content = fs.readFileSync(RELEASE_NOTES_FILE, "utf8")
    const lines = content.split("\n")
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("#")) continue
      const match = /#+\s*v?(\d+\.\d+\.\d+)/i.exec(trimmed)
      if (match) {
        const version = match[1]
        const valid = isValidSemver(version)
        return {
          source: "release-notes.md",
          version,
          valid,
          error: !valid ? `Invalid semver format: ${version}` : null
        }
      }
    }
    return { source: "release-notes.md", version: null, warning: "No version heading found in release notes" }
  } catch (err) {
    return { source: "release-notes.md", version: null, error: `Read error: ${err.message}` }
  }
}

function checkGitDirty() {
  try {
    const status = execSync("git status --porcelain -uno", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim()
    const dirty = status.length > 0
    const dirtyFiles = dirty ? status.split("\n").map(l => l.trim()).filter(Boolean) : []
    return { dirty, dirtyFiles, error: null }
  } catch (err) {
    return { dirty: false, dirtyFiles: [], error: `Git status check failed: ${err.message}` }
  }
}

function main() {
  const args = parseArgs(process.argv)
  const results = []
  const errors = []
  const warnings = []

  const pkgResult = readPackageVersion()
  results.push(pkgResult)
  if (pkgResult.error) errors.push(`${pkgResult.source}: ${pkgResult.error}`)
  if (pkgResult.warning) warnings.push(`${pkgResult.source}: ${pkgResult.warning}`)

  const stampResult = readStampVersion()
  results.push(stampResult)
  if (stampResult.error) errors.push(`${stampResult.source}: ${stampResult.error}`)
  if (stampResult.warning) warnings.push(`${stampResult.source}: ${stampResult.warning}`)

  const notesResult = readReleaseNotesVersion()
  results.push(notesResult)
  if (notesResult.error) errors.push(`${notesResult.source}: ${notesResult.error}`)
  if (notesResult.warning) warnings.push(`${notesResult.source}: ${notesResult.warning}`)

  const canonicalVersion = pkgResult.version
  if (!canonicalVersion) {
    console.error("[verify-version] ERROR: cannot determine canonical version from package.json")
    for (const err of errors) console.error(`  - ${err}`)
    process.exit(1)
  }

  const versionMismatches = []
  for (const result of results) {
    if (result.version && result.version !== canonicalVersion) {
      versionMismatches.push(`${result.source}: ${result.version} (expected ${canonicalVersion})`)
    }
  }
  if (versionMismatches.length > 0) {
    errors.push("Version mismatch across files:")
    for (const m of versionMismatches) errors.push(`  - ${m}`)
  }

  const gitCheck = checkGitDirty()
  if (gitCheck.error) {
    warnings.push(`Git check: ${gitCheck.error}`)
  } else if (gitCheck.dirty && !args.allowDirty) {
    errors.push("Git working tree is dirty (use --allow-dirty to skip this check):")
    for (const f of gitCheck.dirtyFiles.slice(0, 20)) errors.push(`  - ${f}`)
    if (gitCheck.dirtyFiles.length > 20) {
      errors.push(`  ... and ${gitCheck.dirtyFiles.length - 20} more`)
    }
  }

  if (warnings.length > 0) {
    for (const w of warnings) console.warn(`[verify-version] WARNING: ${w}`)
  }

  if (errors.length > 0) {
    console.error("[verify-version] ERROR: version consistency check failed")
    for (const err of errors) {
      if (err.startsWith("  ")) {
        console.error(err)
      } else {
        console.error(`  - ${err}`)
      }
    }
    process.exit(1)
  }

  console.log(`Version check passed: ${canonicalVersion}`)
  process.exit(0)
}

main()
