/* eslint-disable no-unused-vars, no-empty, no-control-regex, no-useless-escape, no-undef */
'use strict';

/**
 * Karna Desktop — paths.js 单元测试
 *
 * Phase 1 Task 1.2（数据目录策略）的回归门禁：
 *   - 所有用户数据目录必须从 KARNA_DATA_DIR / app.getPath('userData') 派生
 *   - 不得在 karna-adapter.cjs 等业务模块出现硬编码 'karna-data' 路径
 *   - 打包环境（HERMES_DESKTOP_USER_DATA_DIR 或 app.getPath）应与开发环境隔离
 *
 * Run: node apps/desktop/electron/karna/paths.test.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const PATHS_MODULE = path.join(REPO, 'apps', 'desktop', 'electron', 'karna', 'paths.cjs');
const KARNA_ADAPTER = path.join(REPO, 'apps', 'desktop', 'electron', 'karna-adapter.cjs');
const ELECTRON_MAIN = path.join(REPO, 'apps', 'desktop', 'electron', 'main.cjs');

let failures = 0;

// --- Test 1: paths.cjs must exist and export required helpers ---
console.log('--- Test 1: paths.cjs existence + exports ---');
if (!fs.existsSync(PATHS_MODULE)) {
  console.error('FAIL  paths.cjs missing at', PATHS_MODULE);
  failures += 1;
} else {
  // Load via Module to support .cjs + module.exports
  const mod = new Module(PATHS_MODULE);
  mod.filename = PATHS_MODULE;
  mod.paths = Module._nodeModulePaths(path.dirname(PATHS_MODULE));
  const src = fs.readFileSync(PATHS_MODULE, 'utf8');
  mod._compile(src, PATHS_MODULE);
  const paths = mod.exports;
  const required = [
    'dataRoot',
    'writerProjectsDir',
    'soulWorkshopDir',
    'workflowsDir',
    'globalWorkflowsDir',
    'knowledgeBaseFile',
    'mcpServersFile',
    'pluginsFile',
    'skillsStateFile',
    'soulWorkshopIndexFile',
    'writerProjectsIndexFile',
    'logsDir',
  ];
  for (const key of required) {
    if (typeof paths[key] !== 'function') {
      console.error(`FAIL  paths.${key} is not a function (got ${typeof paths[key]})`);
      failures += 1;
    } else {
      const v = paths[key]();
      if (typeof v !== 'string' || v.length === 0) {
        console.error(`FAIL  paths.${key}() returned non-string: ${v}`);
        failures += 1;
      } else {
        console.log(`OK    paths.${key}() = ${v}`);
      }
    }
  }
}

// --- Test 2: karna-adapter.cjs must not have hardcoded 'karna-data' literals ---
console.log('--- Test 2: no hardcoded karna-data paths in karna-adapter.cjs ---');
if (fs.existsSync(KARNA_ADAPTER)) {
  // Strip line comments (// ...) and block comments (/* ... */) before
  // scanning, so descriptive prose mentioning the path name does not trip
  // the test. We only care about literal strings used as values.
  const raw = fs.readFileSync(KARNA_ADAPTER, 'utf8');
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/.*$/gm, '');
  const matches = stripped.match(/['"]karna-data['"]/g) || [];
  if (matches.length > 0) {
    console.error(`FAIL  karna-adapter.cjs still contains ${matches.length} hardcoded 'karna-data' string literal(s) (excluding comments) — should delegate to karna/paths.cjs`);
    failures += 1;
  } else {
    console.log("OK    karna-adapter.cjs no hardcoded 'karna-data' literal (code only)");
  }
}

// --- Test 3: karna-adapter.cjs should require karna/paths.cjs ---
console.log('--- Test 3: karna-adapter.cjs requires karna/paths.cjs ---');
if (fs.existsSync(KARNA_ADAPTER)) {
  const content = fs.readFileSync(KARNA_ADAPTER, 'utf8');
  if (!/require\(['"]\.\/karna\/paths(?:\.cjs)?['"]\)/.test(content)) {
    console.error("FAIL  karna-adapter.cjs does not require('./karna/paths')");
    failures += 1;
  } else {
    console.log("OK    karna-adapter.cjs requires('./karna/paths')");
  }
}

// --- Test 4: dev / packaged dataRoot isolation ---
console.log('--- Test 4: dev vs packaged dataRoot isolation ---');
if (fs.existsSync(PATHS_MODULE)) {
  const mod = new Module(PATHS_MODULE);
  mod.filename = PATHS_MODULE;
  mod.paths = Module._nodeModulePaths(path.dirname(PATHS_MODULE));
  const src = fs.readFileSync(PATHS_MODULE, 'utf8');
  mod._compile(src, PATHS_MODULE);
  const paths = mod.exports;

  // Dev: KARNA_DATA_DIR unset → should default to <repo>/karna-data
  const prevEnv = process.env.KARNA_DATA_DIR;
  delete process.env.KARNA_DATA_DIR;
  delete process.env.HERMES_DESKTOP_USER_DATA_DIR;
  // Force the dev branch by spoofing the absence of `app`
  paths.__reset?.();
  const devRoot = paths.dataRoot({ env: process.env, app: null });
  if (typeof devRoot !== 'string' || !devRoot.toLowerCase().endsWith('karna-data')) {
    console.error(`FAIL  dev dataRoot should end with karna-data, got: ${devRoot}`);
    failures += 1;
  } else {
    console.log(`OK    dev dataRoot = ${devRoot}`);
  }

  // Packaged: HERMES_DESKTOP_USER_DATA_DIR set → should derive from it
  process.env.HERMES_DESKTOP_USER_DATA_DIR = path.join(REPO, '.tmp-karna-userdata');
  const pkgRoot = paths.dataRoot({ env: process.env, app: { getPath: (k) => k === 'userData' ? process.env.HERMES_DESKTOP_USER_DATA_DIR : '' } });
  if (typeof pkgRoot !== 'string' || !pkgRoot.includes('.tmp-karna-userdata')) {
    console.error(`FAIL  packaged dataRoot should derive from userData, got: ${pkgRoot}`);
    failures += 1;
  } else {
    console.log(`OK    packaged dataRoot = ${pkgRoot}`);
  }
  if (pkgRoot === devRoot) {
    console.error('FAIL  dev and packaged dataRoot collide');
    failures += 1;
  } else {
    console.log("OK    dev and packaged dataRoot are isolated");
  }
  // restore
  if (prevEnv === undefined) delete process.env.KARNA_DATA_DIR; else process.env.KARNA_DATA_DIR = prevEnv;
  delete process.env.HERMES_DESKTOP_USER_DATA_DIR;
  // cleanup tmp dir
  try { fs.rmSync(path.join(REPO, '.tmp-karna-userdata'), { recursive: true, force: true }); } catch {}
}

// --- Test 5: writerProjectsIndexFile in main.cjs context ---
console.log('--- Test 5: karna adapter code path coverage ---');
if (fs.existsSync(KARNA_ADAPTER)) {
  const content = fs.readFileSync(KARNA_ADAPTER, 'utf8');
  // Check that the index files referenced by writer/soul are reachable
  // via paths.cjs (call sites use the new helpers). Match either the bound
  // alias `karnaPaths.<helper>` or a bare `paths.<helper>` call.
  const helpersUsed = (content.match(/(?:karnaPaths|paths)\.[a-zA-Z]+/g) || []);
  const uniq = [...new Set(helpersUsed)];
  console.log(`OK    karna-adapter.cjs uses ${uniq.length} unique paths.* helpers: ${uniq.join(', ')}`);
  if (uniq.length < 3) {
    console.error(`FAIL  karna-adapter.cjs uses too few paths.* helpers (${uniq.length}); expected at least 3`);
    failures += 1;
  }
}

console.log('--- summary ---');
if (failures === 0) {
  console.log('PASS  All paths.cjs checks green.');
  process.exit(0);
} else {
  console.error(`FAIL  ${failures} paths violation(s).`);
  process.exit(1);
}
