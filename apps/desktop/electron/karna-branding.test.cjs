'use strict';

/**
 * Karna Desktop Branding Verification Test
 *
 * Verifies that all user-visible installation artifacts use the Karna brand
 * name, not the upstream Hermes name. The only legitimate places where
 * "Hermes" may appear are runtime references (e.g. "powered by Hermes Agent").
 *
 * This test exists as the regression gate for Phase 1 Task 1.1 (品牌清理).
 * It is a structural test (file content + JSON parse) — running the desktop
 * build is out of scope for CI.
 *
 * Run: node apps/desktop/electron/karna-branding.test.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..', '..');
const DESKTOP_PKG = path.join(REPO, 'apps', 'desktop', 'package.json');
const ELECTRON_MAIN = path.join(REPO, 'apps', 'desktop', 'electron', 'main.cjs');

const FORBIDDEN_LITERALS = [
  // macOS CFBundle
  '"CFBundleDisplayName": "Hermes"',
  '"CFBundleExecutable": "Hermes"',
  '"CFBundleName": "Hermes"',
  // macOS privacy descriptions
  'Hermes uses audio capture',
  'Hermes uses the microphone',
  // dmg / nsis
  '"title": "Install Hermes"',
  '"shortcutName": "Hermes"',
  '"uninstallDisplayName": "Hermes"',
  '"legalTrademarks": "Hermes"',
  // linux
  'Native desktop shell for Hermes Agent',
  'Nous Research <support@nousresearch.com>',
  // electron main
  "APP_NAME = 'Hermes'",
  // windows aumid
  'com.nousresearch.hermes',
];

const ALLOWED_LITERALS = [
  // OK: technical reference to upstream runtime
  'Powered by Hermes Agent',
  'Hermes Agent runtime',
];

let failures = 0;
const seen = [];

function checkFile(filePath, scope) {
  if (!fs.existsSync(filePath)) {
    console.error(`MISSING  ${scope}  ${filePath}`);
    failures += 1;
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  for (const literal of FORBIDDEN_LITERALS) {
    if (content.includes(literal)) {
      console.error(`FAIL  ${scope}  contains forbidden literal: ${literal}`);
      failures += 1;
      seen.push(`${scope}: ${literal}`);
    }
  }
  for (const literal of ALLOWED_LITERALS) {
    // informational only — these must exist somewhere but we don't fail if missing
    if (!content.includes(literal)) {
      console.log(`INFO  ${scope}  missing allowed literal: ${literal}`);
    }
  }
}

function checkJsonBrand(filePath) {
  if (!fs.existsSync(filePath)) return;
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const build = pkg.build || {};
  const mac = build.mac || {};
  const win = build.win || {};
  const linux = build.linux || {};
  const nsis = build.nsis || {};
  const dmg = build.dmg || {};
  const extendInfo = mac.extendInfo || {};

  const checks = [
    ['productName', pkg.productName, 'Karna'],
    ['appId', build.appId, 'com.karna.desktop'],
    ['mac.extendInfo.CFBundleDisplayName', extendInfo.CFBundleDisplayName, 'Karna'],
    ['mac.extendInfo.CFBundleExecutable', extendInfo.CFBundleExecutable, 'Karna'],
    ['mac.extendInfo.CFBundleName', extendInfo.CFBundleName, 'Karna'],
    ['dmg.title', dmg.title, 'Install Karna'],
    ['win.legalTrademarks', win.legalTrademarks, 'Karna'],
    ['nsis.shortcutName', nsis.shortcutName, 'Karna'],
    ['nsis.uninstallDisplayName', nsis.uninstallDisplayName, 'Karna'],
  ];

  for (const [field, actual, expected] of checks) {
    if (actual !== expected) {
      console.error(`FAIL  package.json.${field}  expected ${JSON.stringify(expected)}  got ${JSON.stringify(actual)}`);
      failures += 1;
    } else {
      console.log(`OK    package.json.${field} = ${JSON.stringify(actual)}`);
    }
  }

  // linux.maintainer must NOT be "Nous Research <support@nousresearch.com>"
  if (linux.maintainer && linux.maintainer.includes('nousresearch.com')) {
    console.error(`FAIL  package.json.linux.maintainer still references nousresearch: ${linux.maintainer}`);
    failures += 1;
  }
  // linux.synopsis must NOT mention "Hermes Agent"
  if (linux.synopsis && linux.synopsis.toLowerCase().includes('hermes')) {
    console.error(`FAIL  package.json.linux.synopsis still references Hermes: ${linux.synopsis}`);
    failures += 1;
  }
}

console.log('--- Karna branding verification ---');
checkJsonBrand(DESKTOP_PKG);
checkFile(DESKTOP_PKG, 'apps/desktop/package.json');
checkFile(ELECTRON_MAIN, 'apps/desktop/electron/main.cjs');

console.log('--- summary ---');
if (failures === 0) {
  console.log('PASS  All branding checks green.');
  process.exit(0);
} else {
  console.error(`FAIL  ${failures} branding violation(s):`);
  for (const s of seen) console.error('  - ' + s);
  process.exit(1);
}
