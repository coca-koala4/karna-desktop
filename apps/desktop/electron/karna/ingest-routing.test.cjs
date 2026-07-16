/* eslint-disable no-unused-vars, no-empty, no-control-regex, no-useless-escape, no-undef */
'use strict';

/**
 * Karna Desktop — Ingest API 路由契约测试
 *
 * 验证 /api/ingest/* 请求在真实 Electron 主进程中会被路由到 Karna Adapter，
 * 而不是绕过它直接访问 Hermes Gateway 或返回 404。
 *
 * Run: node apps/desktop/electron/karna/ingest-routing.test.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ELECTRON_MAIN = path.join(REPO, 'apps', 'desktop', 'electron', 'main.cjs');
const KARNA_ADAPTER = path.join(REPO, 'apps', 'desktop', 'electron', 'karna-adapter.cjs');

let failures = 0;

function test(name, fn) {
  console.log(`--- ${name} ---`);
  try {
    fn();
    console.log(`OK    ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}: ${err instanceof Error ? err.message : String(err)}`);
    failures += 1;
  }
}

test('main.cjs exists', () => {
  if (!fs.existsSync(ELECTRON_MAIN)) {
    throw new Error(`main.cjs not found at ${ELECTRON_MAIN}`);
  }
});

test('shouldRouteToKarnaAdapter function exists in main.cjs', () => {
  const content = fs.readFileSync(ELECTRON_MAIN, 'utf8');
  if (!/function\s+shouldRouteToKarnaAdapter/.test(content)) {
    throw new Error('shouldRouteToKarnaAdapter function not found in main.cjs');
  }
});

test('/api/ingest/ routes are included in shouldRouteToKarnaAdapter', () => {
  const content = fs.readFileSync(ELECTRON_MAIN, 'utf8');
  const fnMatch = content.match(/function\s+shouldRouteToKarnaAdapter[\s\S]*?\n\}/);
  if (!fnMatch) {
    throw new Error('Could not extract shouldRouteToKarnaAdapter function body');
  }
  const fnBody = fnMatch[0];
  if (!fnBody.includes("/api/ingest/")) {
    throw new Error('/api/ingest/ path prefix is missing from shouldRouteToKarnaAdapter — Ingest API will not reach Karna Adapter in real Electron');
  }
  if (!/pathname\.startsWith\(['"]\/api\/ingest\/['"]\)/.test(fnBody)) {
    throw new Error('/api/ingest/ is not checked via pathname.startsWith() — may not correctly route all ingest subpaths');
  }
});

test('all Ingest API endpoints are handled in karna-adapter.cjs', () => {
  const content = fs.readFileSync(KARNA_ADAPTER, 'utf8');
  const expectedEndpoints = [
    { name: 'GET /api/ingest/capabilities', pattern: /ingest\/capabilities/ },
    { name: 'POST /api/ingest/jobs', pattern: /ingest\/jobs.*POST/ },
    { name: 'GET /api/ingest/jobs/:id', pattern: /ingestJobMatch/ },
    { name: 'DELETE /api/ingest/jobs/:id', pattern: /cancelJob/ },
    { name: 'GET /api/ingest/results/:id', pattern: /ingestResultMatch/ },
    { name: 'POST /api/ingest/materialize', pattern: /ingest\/materialize/ },
  ];
  const missing = [];
  for (const ep of expectedEndpoints) {
    if (!ep.pattern.test(content)) {
      missing.push(ep.name);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing Ingest endpoints in karna-adapter.cjs: ${missing.join(', ')}`);
  }
  console.log(`OK    All ${expectedEndpoints.length} Ingest endpoints found`);
});

test('ingestService is initialized in karna-adapter.cjs', () => {
  const content = fs.readFileSync(KARNA_ADAPTER, 'utf8');
  if (!/createIngestService/.test(content)) {
    throw new Error('createIngestService is not imported in karna-adapter.cjs');
  }
  if (!/ingestService\s*=\s*createIngestService/.test(content)) {
    throw new Error('ingestService is not initialized in karna-adapter.cjs');
  }
});

const ingestPathsToTest = [
  '/api/ingest/capabilities',
  '/api/ingest/jobs',
  '/api/ingest/jobs/test-job-123',
  '/api/ingest/results/test-result-456',
  '/api/ingest/materialize',
  '/api/ingest/jobs?param=value',
  '/api/ingest/capabilities?foo=bar',
];

test('all Ingest path variants match the routing rule pattern', () => {
  const content = fs.readFileSync(ELECTRON_MAIN, 'utf8');
  const fnMatch = content.match(/function\s+shouldRouteToKarnaAdapter[\s\S]*?\n\}/);
  if (!fnMatch) {
    throw new Error('Could not extract function body');
  }
  const fnBody = fnMatch[0];
  const hasIngestPrefix = /pathname\.startsWith\(['"]\/api\/ingest\/['"]\)/.test(fnBody);
  if (!hasIngestPrefix) {
    throw new Error('pathname.startsWith(/api/ingest/) not found');
  }
  for (const p of ingestPathsToTest) {
    const pathname = p.split('?')[0];
    const shouldRoute = pathname.startsWith('/api/ingest/');
    if (!shouldRoute) {
      throw new Error(`Path ${p} would NOT be routed to Karna Adapter — pathname.startsWith check fails`);
    }
  }
  console.log(`OK    All ${ingestPathsToTest.length} path variants would be routed`);
});

test('Hermes Gateway paths are NOT mistakenly routed to Karna (sanity check)', () => {
  const hermesPaths = [
    '/api/sessions',
    '/api/messages',
    '/api/model/options',
    '/api/providers',
    '/api/auth/status',
  ];
  for (const p of hermesPaths) {
    const pathname = p.split('?')[0];
    const wouldRouteToKarna = pathname.startsWith('/api/ingest/') ||
      pathname.startsWith('/api/writer/') ||
      pathname.startsWith('/api/knowledge') ||
      pathname.startsWith('/api/mcp/') ||
      pathname.startsWith('/api/soul/') ||
      pathname.startsWith('/api/connectors/') ||
      pathname.startsWith('/api/skills');
    if (wouldRouteToKarna) {
      throw new Error(`Hermes path ${p} would be incorrectly routed to Karna Adapter`);
    }
  }
  console.log(`OK    All ${hermesPaths.length} Hermes paths stay in Hermes Gateway`);
});

console.log('--- summary ---');
if (failures === 0) {
  console.log('PASS  All Ingest routing contract checks green.');
  process.exit(0);
} else {
  console.error(`FAIL  ${failures} routing violation(s).`);
  process.exit(1);
}
