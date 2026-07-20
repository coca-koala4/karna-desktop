"use strict"

/**
 * Writes apps/desktop/build/install-stamp.json with the git ref the desktop
 * .exe should pin to at first-launch bootstrap time.  This file ships inside
 * the packaged app via electron-builder's extraResources entry and is read
 * by electron/main.cjs to drive the install.ps1 stage bootstrap flow.
 *
 * Schema (subject to bump via STAMP_SCHEMA_VERSION):
 *   {
 *     "schemaVersion": 2,
 *     "commit":         "<40-char SHA>",
 *     "branch":         "<branch name>",
 *     "builtAt":        "<ISO 8601 UTC timestamp>",
 *     "builtBy":        "<hostname or CI runner name>",
 *     "dirty":          true|false,
 *     "source":         "ci" | "local",
 *     "desktopVersion": "<semver from package.json>",
 *     "versionFingerprint": "<sha256 of version+commit+builtAt>",
 *     "buildConfig":    { "allowDirtyBuilds": true|false },
 *     "buildTiming":    { "startedAt": "...", "endedAt": "...", "durationMs": N }
 *   }
 *
 * Source preference order:
 *   1. CI env vars ($GITHUB_SHA / $GITHUB_REF_NAME) -- avoid edge cases with
 *      shallow clones, detached HEADs, etc. in CI.
 *   2. Local `git rev-parse` against the parent repo (../..).
 *
 * Dev / out-of-repo builds without git produce an explicit error rather than
 * silently writing an unstamped manifest -- the packaged app refuses to
 * bootstrap without a stamp.
 *
 * CI/production builds: dirty working tree causes process.exit(1) to block
 * the build. Local dev builds only warn.
 */

const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { execSync } = require("node:child_process")

const STAMP_SCHEMA_VERSION = 2

const DESKTOP_ROOT = path.resolve(__dirname, "..")
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "..", "..")
const OUT_DIR = path.join(DESKTOP_ROOT, "build")
const OUT_FILE = path.join(OUT_DIR, "install-stamp.json")
const PKG_FILE = path.join(DESKTOP_ROOT, "package.json")
const RELEASE_NOTES_FILE = path.join(DESKTOP_ROOT, "electron", "release-notes.md")
const VERIFY_SCRIPT = path.join(__dirname, "verify-version-consistency.cjs")

const buildLog = []

function logStep(step, message) {
  const entry = { step, message, ts: new Date().toISOString() }
  buildLog.push(entry)
  console.log(`[write-build-stamp] [${step}] ${message}`)
}

function logError(step, message) {
  const entry = { step, message, ts: new Date().toISOString(), level: "error" }
  buildLog.push(entry)
  console.error(`[write-build-stamp] [${step}] ERROR: ${message}`)
}

function logWarn(step, message) {
  const entry = { step, message, ts: new Date().toISOString(), level: "warn" }
  buildLog.push(entry)
  console.warn(`[write-build-stamp] [${step}] WARNING: ${message}`)
}

function isCIEnvironment() {
  return (
    process.env.CI === "true" ||
    process.env.GITHUB_ACTIONS === "true" ||
    process.env.NODE_ENV === "production"
  )
}

function getBuildMachine() {
  if (process.env.GITHUB_RUNNER_NAME) return process.env.GITHUB_RUNNER_NAME
  if (process.env.CI_RUNNER_NAME) return process.env.CI_RUNNER_NAME
  try {
    return os.hostname()
  } catch {
    return "unknown"
  }
}

function tryExec(cmd, opts) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], ...opts }).trim()
  } catch {
    return null
  }
}

function fromCI() {
  const sha = process.env.GITHUB_SHA
  if (!sha) return null
  const branch = process.env.GITHUB_REF_NAME || process.env.GITHUB_HEAD_REF || null
  return {
    commit: sha,
    branch: branch,
    dirty: false, // CI builds from a checkout-of-ref by definition
    source: "ci"
  }
}

function fromLocalGit() {
  const sha = tryExec("git rev-parse HEAD", { cwd: REPO_ROOT })
  if (!sha) return null
  const branch = tryExec("git rev-parse --abbrev-ref HEAD", { cwd: REPO_ROOT })
  // `git status --porcelain -uno` is empty iff tracked files match HEAD.
  // We exclude untracked files (-uno) intentionally: a developer who's
  // checked out an installer scratch dir alongside the repo shouldn't
  // poison every local build with a [DIRTY] stamp.  We DO care about
  // tracked-but-modified files because those mean the .exe content
  // differs from the commit being pinned.
  const status = tryExec("git status --porcelain -uno", { cwd: REPO_ROOT })
  const dirty = status !== null && status.length > 0
  return {
    commit: sha,
    branch: branch === "HEAD" ? null : branch, // detached HEAD -> null
    dirty: dirty,
    source: "local"
  }
}

function computeVersionFingerprint(version, commit, builtAt) {
  const input = `${version}|${commit}|${builtAt}`
  return crypto.createHash("sha256").update(input, "utf8").digest("hex")
}

function getLastReleasedVersion() {
  try {
    const tags = tryExec("git tag --sort=-v:refname", { cwd: REPO_ROOT })
    if (!tags) return null
    const tagList = tags.split("\n").map(t => t.trim()).filter(Boolean)
    const semverTagRegex = /^v?(\d+\.\d+\.\d+)$/
    for (const tag of tagList) {
      const match = semverTagRegex.exec(tag)
      if (match) return match[1]
    }
    return null
  } catch {
    return null
  }
}

function compareVersions(a, b) {
  const pa = String(a).split(".").map(n => parseInt(n, 10) || 0)
  const pb = String(b).split(".").map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0
    const vb = pb[i] || 0
    if (va > vb) return 1
    if (va < vb) return -1
  }
  return 0
}

function checkVersionRollback(currentVersion) {
  const lastVersion = getLastReleasedVersion()
  if (!lastVersion) return { rollback: false, lastVersion: null }
  const cmp = compareVersions(currentVersion, lastVersion)
  if (cmp < 0) {
    return { rollback: true, currentVersion, lastVersion }
  }
  return { rollback: false, currentVersion, lastVersion }
}

function main() {
  const buildStartedAt = new Date()
  logStep("init", `build started at ${buildStartedAt.toISOString()}`)

  const isCI = isCIEnvironment()
  const allowDirtyBuilds = !isCI
  const builtBy = getBuildMachine()
  logStep("env", `isCI=${isCI}, builtBy=${builtBy}`)

  logStep("version-check", "verifying version consistency...")
  try {
    require("node:child_process").execSync(
      `node "${VERIFY_SCRIPT}" --allow-dirty`,
      { cwd: DESKTOP_ROOT, stdio: "pipe", encoding: "utf8" }
    )
    logStep("version-check", "version consistency check passed")
  } catch (err) {
    const stderr = err.stderr || err.message || String(err)
    logWarn("version-check", `version consistency check warning: ${stderr.trim().split("\n")[0]}`)
  }

  logStep("git", "resolving git info...")
  const stamp = fromCI() || fromLocalGit()
  if (!stamp || !stamp.commit) {
    logError("git",
      "could not determine git commit.\n" +
        "  - $GITHUB_SHA not set\n" +
        "  - `git rev-parse HEAD` failed at " +
        REPO_ROOT +
        "\n" +
        "Packaged builds require a git ref to pin first-launch install.ps1\n" +
        "against. Run from a git checkout or set $GITHUB_SHA explicitly."
    )
    process.exit(1)
  }
  logStep("git", `commit=${stamp.commit.slice(0, 12)} branch=${stamp.branch || "HEAD"}`)

  if (stamp.dirty) {
    if (isCI) {
      logError("git",
        "dirty working tree in CI/production build.\n" +
          "  CI builds require a clean working tree. Pinning to " +
          stamp.commit.slice(0, 12) +
          " but the packaged code may differ from that commit.\n" +
          "  This is blocked to prevent inconsistent builds."
      )
      process.exit(1)
    } else {
      logWarn("git",
        "working tree is dirty.\n" +
          "  Pinning to " +
          stamp.commit.slice(0, 12) +
          " but the packaged code may differ from that commit.\n" +
          "  Commit your changes before publishing this build."
      )
    }
  }

  logStep("package", "reading package.json...")
  const pkg = JSON.parse(fs.readFileSync(PKG_FILE, "utf8"))
  const desktopVersion = pkg.version
  logStep("package", `desktopVersion=${desktopVersion}`)

  logStep("rollback-check", "checking for version rollback...")
  const rollbackCheck = checkVersionRollback(desktopVersion)
  if (rollbackCheck.rollback) {
    const msg = `version rollback detected: current ${desktopVersion} < last released ${rollbackCheck.lastVersion}`
    if (isCI) {
      logError("rollback-check", msg + "\n  This is blocked in CI to prevent accidental downgrade releases.")
      process.exit(1)
    } else {
      logWarn("rollback-check", msg + "\n  Make sure this is intentional before publishing.")
    }
  } else if (rollbackCheck.lastVersion) {
    logStep("rollback-check", `version OK: ${desktopVersion} >= ${rollbackCheck.lastVersion}`)
  } else {
    logStep("rollback-check", "no previous release tags found")
  }

  const builtAt = new Date().toISOString()
  const versionFingerprint = computeVersionFingerprint(desktopVersion, stamp.commit, builtAt)
  logStep("fingerprint", `versionFingerprint=${versionFingerprint.slice(0, 16)}...`)

  const buildEndedAt = new Date()
  const durationMs = buildEndedAt.getTime() - buildStartedAt.getTime()

  const payload = {
    schemaVersion: STAMP_SCHEMA_VERSION,
    commit: stamp.commit,
    branch: stamp.branch,
    builtAt,
    builtBy,
    dirty: stamp.dirty,
    source: stamp.source,
    desktopVersion,
    versionFingerprint,
    lastReleasedVersion: rollbackCheck.lastVersion || null,
    buildConfig: {
      allowDirtyBuilds: allowDirtyBuilds
    },
    buildTiming: {
      startedAt: buildStartedAt.toISOString(),
      endedAt: buildEndedAt.toISOString(),
      durationMs
    },
    buildLog: buildLog
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2) + "\n", "utf8")
  logStep("write",
    `wrote ${path.relative(REPO_ROOT, OUT_FILE)} -> ${desktopVersion} ${stamp.commit.slice(0, 12)}` +
      (stamp.branch ? ` (${stamp.branch})` : "") +
      (stamp.dirty ? " [DIRTY]" : "") +
      (isCI ? " [CI]" : " [LOCAL]") +
      ` in ${durationMs}ms`
  )
}

main()
