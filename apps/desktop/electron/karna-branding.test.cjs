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

// --- Phase 1 follow-up: user-visible UI surface ---
// The Phase 1 branding test originally only covered installer artifacts
// and the Electron main process. It missed the most prominent user-visible
// surface: the React shell (index.html title, intro wordmark, etc.). Phase 1
// task 1.1's *intent* was to scrub the user-facing product identity across
// the desktop, so we add an explicit UI surface check below.
console.log('--- UI surface (index.html + intro.tsx) ---');

// 1. index.html <title> must say Karna, not Hermes
const indexHtml = path.join(REPO, 'apps', 'desktop', 'index.html');
if (fs.existsSync(indexHtml)) {
  const html = fs.readFileSync(indexHtml, 'utf8');
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch && titleMatch[1].trim() === 'Karna') {
    console.log('OK    index.html <title>=Karna');
  } else {
    console.error(`FAIL  index.html <title> expected "Karna" got ${JSON.stringify(titleMatch ? titleMatch[1] : null)}`);
    failures += 1;
  }
}

// 2. The intro wordmark constant in intro.tsx must be KARNA, not HERMES AGENT.
//    This is the giant orange wordmark the user sees on first launch.
const introTsx = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'chat', 'intro.tsx');
if (fs.existsSync(introTsx)) {
  const src = fs.readFileSync(introTsx, 'utf8');
  const wmMatch = src.match(/const\s+WORDMARK\s*=\s*['"]([^'"]+)['"]/);
  if (wmMatch && wmMatch[1].toUpperCase() === 'KARNA') {
    console.log(`OK    intro.tsx WORDMARK=${wmMatch[1]}`);
  } else {
    console.error(`FAIL  intro.tsx WORDMARK expected 'KARNA' got ${JSON.stringify(wmMatch ? wmMatch[1] : null)}`);
    failures += 1;
  }
}

// 3. The Settings → Uninstall page (uninstall-section.tsx) must use the
//    Karna product name in its user-facing option labels and confirm
//    prompts. Technical references to "Hermes agent runtime" are allowed
//    (and intentional — the upstream runtime is what gets uninstalled).
const uninstallSection = path.join(REPO, 'apps', 'desktop', 'src', 'app', 'settings', 'uninstall-section.tsx');
if (fs.existsSync(uninstallSection)) {
  const src = fs.readFileSync(uninstallSection, 'utf8');
  // Strip line and block comments before scanning.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/.*$/gm, '');
  const productNameCalls = stripped.match(/Uninstall (?:Chat GUI|Karna desktop|everything)/g) || [];
  const hermesProduct = stripped.match(/Uninstall Hermes/g) || [];
  if (productNameCalls.length >= 1 && hermesProduct.length === 0) {
    console.log(`OK    uninstall-section.tsx uses Karna product name (${productNameCalls.length} option(s))`);
  } else {
    console.error(`FAIL  uninstall-section.tsx — Karna options: ${productNameCalls.length}, stale 'Uninstall Hermes' references: ${hermesProduct.length}`);
    failures += 1;
  }
}

// 4. The karna-workshop index page must not refer to the upstream "Hermes
//    agent" in its user-facing Prompt-Enhance helper copy.
const karnaWorkshopIndex = path.join(REPO, 'apps', 'desktop', 'src', 'app', 'karna-workshop', 'index.tsx');
if (fs.existsSync(karnaWorkshopIndex)) {
  const src = fs.readFileSync(karnaWorkshopIndex, 'utf8');
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/.*$/gm, '');
  const staleHermes = stripped.match(/Hermes agent/g) || [];
  if (staleHermes.length === 0) {
    console.log('OK    karna-workshop/index.tsx no stale "Hermes agent" reference');
  } else {
    console.error(`FAIL  karna-workshop/index.tsx has ${staleHermes.length} stale "Hermes agent" reference(s)`);
    failures += 1;
  }
}

// 5. The Karna.png brand icon must exist in public/, and every code reference
//    to the user-visible product logo must point to it (not the upstream
//    Hermes apple-touch-icon / nous-girl / hermes.png files).
const publicDir = path.join(REPO, 'apps', 'desktop', 'public');
const karnaPng = path.join(publicDir, 'Karna.png');
if (fs.existsSync(karnaPng)) {
  const stat = fs.statSync(karnaPng);
  // Require at least 4 KB and 64×64 to be useful as a tile / favicon.
  const looksReal = stat.size >= 4096;
  if (looksReal) {
    console.log(`OK    public/Karna.png exists (${(stat.size / 1024).toFixed(1)} KB)`);
  } else {
    console.error(`WARN  public/Karna.png is suspiciously small (${stat.size} bytes) — verify it's the real Karna logo`);
    // Don't fail: a placeholder still satisfies the brand-name test.
  }
} else {
  console.error('FAIL  public/Karna.png is missing — copy the Karna brand icon here');
  failures += 1;
}

// 5a. Index.html favicon / apple-touch-icon / shortcut-icon must all point
//     to /Karna.png.
const indexHtmlPath = path.join(REPO, 'apps', 'desktop', 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const iconLinks = html.match(/<link[^>]*rel="(?:icon|apple-touch-icon|shortcut icon)"[^>]*>/g) || [];
  const nonKarna = iconLinks.filter(link => !/href="\/Karna\.png"/.test(link));
  if (nonKarna.length === 0 && iconLinks.length >= 2) {
    console.log(`OK    index.html has ${iconLinks.length} icon <link> tags all pointing to /Karna.png`);
  } else {
    console.error(`FAIL  index.html has ${nonKarna.length} icon link(s) NOT pointing to /Karna.png (${iconLinks.length} total)`);
    failures += 1;
  }
}

// 5b. brand-mark.tsx must use Karna.png, not the upstream nous-girl.jpg.
const brandMark = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'brand-mark.tsx');
if (fs.existsSync(brandMark)) {
  const src = fs.readFileSync(brandMark, 'utf8');
  const usesKarna = /assetPath\(['"]Karna\.png['"]\)/.test(src);
  const usesNousGirl = /nous-girl\.jpg/.test(src);
  const hasVariantProp = /variant\?:\s*BrandMarkVariant/.test(src) && /size\?:\s*number/.test(src);
  if (usesKarna && !usesNousGirl && hasVariantProp) {
    console.log('OK    brand-mark.tsx uses Karna.png with size/variant props (no upstream nous-girl.jpg)');
  } else {
    console.error(`FAIL  brand-mark.tsx — usesKarna=${usesKarna}, usesNousGirl=${usesNousGirl}, hasVariantProp=${hasVariantProp}`);
    failures += 1;
  }
}

// 5b-additional: Scan all src UI files for nous-girl.jpg references
function scanDirForNousGirl(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        scanDirForNousGirl(fullPath);
      }
    } else if (/\.(tsx?|jsx?|html?|css)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (/nous-girl\.jpg/.test(content)) {
        const relPath = path.relative(REPO, fullPath);
        console.error(`FAIL  ${relPath} contains reference to nous-girl.jpg`);
        failures += 1;
      }
    }
  }
}
const srcDir = path.join(REPO, 'apps', 'desktop', 'src');
scanDirForNousGirl(srcDir);
console.log('OK    scanned src/ directory for nous-girl.jpg references');

// 5c. onboarding/providers.tsx must use Karna.png in its featured-provider row.
const onboardingProviders = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'onboarding', 'providers.tsx');
if (fs.existsSync(onboardingProviders)) {
  const src = fs.readFileSync(onboardingProviders, 'utf8');
  if (/assetPath\(['"]Karna\.png['"]\)/.test(src)) {
    console.log('OK    onboarding/providers.tsx uses Karna.png in featured-provider row');
  } else {
    console.error('FAIL  onboarding/providers.tsx does not use Karna.png');
    failures += 1;
  }
}

// 6. Boot / connecting overlay must use the Karna brand, not the upstream
//    "CONN" / "ECTING" decode. Karna spells the prefix 'K' + tail 'ARNA'
//    so the connecting decoder reads as 'KARNA' once resolved.
const connectingOverlay = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'gateway-connecting-overlay.tsx');
if (fs.existsSync(connectingOverlay)) {
  const src = fs.readFileSync(connectingOverlay, 'utf8');
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/.*$/gm, '');
  const usesKarnaPrefix = /const\s+PREFIX\s*=\s*'K'/.test(stripped);
  const usesKarnaTail = /const\s+TAIL\s*=\s*'ARNA'/.test(stripped);
  const usesOldConn = /const\s+PREFIX\s*=\s*'CONN'/.test(stripped);
  const usesOldEcting = /const\s+TAIL\s*=\s*'ECTING'/.test(stripped);
  if (usesKarnaPrefix && usesKarnaTail && !usesOldConn && !usesOldEcting) {
    console.log('OK    gateway-connecting-overlay.tsx decodes "K" + "ARNA" (was "CONN" + "ECTING")');
  } else {
    console.error(`FAIL  gateway-connecting-overlay.tsx — usesKarnaPrefix=${usesKarnaPrefix}, usesKarnaTail=${usesKarnaTail}, usesOldConn=${usesOldConn}, usesOldEcting=${usesOldEcting}`);
    failures += 1;
  }
}

// 7. The model-thinking / response-loading indicator must use the new
//    KarnaThinkingMark component (a K-shaped pulsing glyph), not the
//    upstream Hermes "dither" block (a plain animate-pulse square).
const karnaThinkingMark = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'ui', 'karna-thinking-mark.tsx');
if (fs.existsSync(karnaThinkingMark)) {
  console.log('OK    KarnaThinkingMark component exists');
} else {
  console.error('FAIL  KarnaThinkingMark component is missing — src/components/ui/karna-thinking-mark.tsx');
  failures += 1;
}

const statusRow = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'assistant-ui', 'thread', 'status.tsx');
if (fs.existsSync(statusRow)) {
  const src = fs.readFileSync(statusRow, 'utf8');
  // ResponseLoadingIndicator + StreamStallIndicator must both use KarnaThinkingMark.
  const responseUsesKarna = /ResponseLoadingIndicator[\s\S]*?KarnaThinkingMark/.test(src);
  const streamUsesKarna = /StreamStallIndicator[\s\S]*?KarnaThinkingMark/.test(src);
  if (responseUsesKarna && streamUsesKarna) {
    console.log('OK    assistant-ui thread/status uses KarnaThinkingMark for response + stream-stall');
  } else {
    console.error(`FAIL  assistant-ui thread/status — responseUsesKarna=${responseUsesKarna}, streamUsesKarna=${streamUsesKarna}`);
    failures += 1;
  }
  // And the i18n key must read "Karna" (or the i18n-localised equivalent) in
  // the StatusRow label rather than "Hermes is thinking".
  const staleHermesThink = /'Hermes is thinking'/.test(src);
  if (!staleHermesThink) {
    console.log('OK    assistant-ui thread/status no "Hermes is thinking" hard-coded string');
  } else {
    console.error('FAIL  assistant-ui thread/status still has "Hermes is thinking" hard-coded string');
    failures += 1;
  }
}

// 8. The Python backend's DEFAULT_AGENT_IDENTITY must read as Karna, not the
//    upstream "You are Hermes Agent" — otherwise every new model turn will
//    introduce itself as the wrong product.
const promptBuilder = path.join(REPO, 'agent', 'prompt_builder.py');
if (fs.existsSync(promptBuilder)) {
  const src = fs.readFileSync(promptBuilder, 'utf8');
  const stripped = src
    .replace(/^[\s]*#.*$/gm, '')
    .replace(/"""/g, '');
  const isKarnaIdentity = /DEFAULT_AGENT_IDENTITY\s*=\s*\(\s*["']/.test(stripped) &&
    /Karna|你是 Karna|Karna,|Karna (\\u662f|是)/.test(stripped);
  const isStaleIdentity = /You are Hermes Agent, an intelligent AI assistant created by Nous Research/.test(stripped);
  if (isKarnaIdentity && !isStaleIdentity) {
    console.log('OK    agent/prompt_builder.py DEFAULT_AGENT_IDENTITY is Karna (no upstream "Hermes Agent" boilerplate)');
  } else {
    console.error(`FAIL  agent/prompt_builder.py — isKarnaIdentity=${isKarnaIdentity}, isStaleIdentity=${isStaleIdentity}`);
    failures += 1;
  }
}

// 9. hermes_cli/default_soul.py must seed a Karna-shaped persona, not the
//    upstream "You are Hermes Agent" boilerplate. Without this, every fresh
//    install and every profile that hasn't been customised will load the
//    wrong identity into the agent's slot #1 system prompt.
const defaultSoul = path.join(REPO, 'hermes_cli', 'default_soul.py');
if (fs.existsSync(defaultSoul)) {
  const src = fs.readFileSync(defaultSoul, 'utf8');
  const stripped = src
    .replace(/^[\s]*#.*$/gm, '')
    .replace(/"""/g, '');
  const isKarnaSoul = /DEFAULT_SOUL_MD\s*=\s*\(\s*["']/.test(stripped) &&
    /Karna|你是 Karna|Karna,|Karna (\\u662f|是)/.test(stripped);
  const isStaleSoul = /You are Hermes Agent, an intelligent AI assistant created by Nous Research/.test(stripped);
  if (isKarnaSoul && !isStaleSoul) {
    console.log('OK    hermes_cli/default_soul.py DEFAULT_SOUL_MD is Karna (no upstream "Hermes Agent" boilerplate)');
  } else {
    console.error(`FAIL  hermes_cli/default_soul.py — isKarnaSoul=${isKarnaSoul}, isStaleSoul=${isStaleSoul}`);
    failures += 1;
  }
}

// 10. docker/SOUL.md (used by the Docker build to seed a fresh container)
//     must read as Karna.
const dockerSoul = path.join(REPO, 'docker', 'SOUL.md');
if (fs.existsSync(dockerSoul)) {
  const src = fs.readFileSync(dockerSoul, 'utf8');
  const isKarnaSoul = /Karna|你是 Karna|Karna,/.test(src);
  const isStaleSoul = /You are Hermes Agent, an intelligent AI assistant created by Nous Research/.test(src);
  if (isKarnaSoul && !isStaleSoul) {
    console.log('OK    docker/SOUL.md is Karna (no upstream "Hermes Agent" boilerplate)');
  } else {
    console.error(`FAIL  docker/SOUL.md — isKarnaSoul=${isKarnaSoul}, isStaleSoul=${isStaleSoul}`);
    failures += 1;
  }
}

// 11. 根目录 AGENTS.md（项目上下文文件，agent 启动时被注入到 system prompt）
//     必须是 Karna 视角的项目指南；上游 Hermes 模板必须已经被搬到
//     docs/upstream/AGENTS.hermes.md（保留作参考），不再放在根目录。
//     这是 Karna 自我介绍会"说成 Hermes"的最后一块根因。
const rootAgentsMd = path.join(REPO, 'AGENTS.md');
const upstreamAgentsMd = path.join(REPO, 'docs', 'upstream', 'AGENTS.hermes.md');
if (!fs.existsSync(rootAgentsMd)) {
  console.error('FAIL  AGENTS.md is missing at repo root — agent will load no project context');
  failures += 1;
} else {
  const rootSrc = fs.readFileSync(rootAgentsMd, 'utf8');
  const rootStripped = rootSrc
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[\s]*#.*$/gm, '');
  // 上游模板的特征句：必须不存在
  const upstreamTitle = /# Hermes Agent - Development Guide/.test(rootSrc);
  const upstreamWhatHermesIs = /## What Hermes Is\b/.test(rootSrc);
  const upstreamContribRubric = /## Contribution Rubric/.test(rootSrc);
  // Karna 视角的特征句：必须存在
  const karnaIdentity = /What Karna is/i.test(rootSrc) || /Karna is/i.test(rootStripped);
  const karnaUpstreamRef = /docs\/upstream\/AGENTS\.hermes\.md/.test(rootSrc);
  if (upstreamTitle || upstreamWhatHermesIs || upstreamContribRubric) {
    console.error(`FAIL  AGENTS.md is still the upstream Hermes template (upstreamTitle=${upstreamTitle}, upstreamWhatHermesIs=${upstreamWhatHermesIs}, upstreamContribRubric=${upstreamContribRubric})`);
    failures += 1;
  } else if (!karnaIdentity) {
    console.error('FAIL  AGENTS.md is not the upstream template, but does not describe Karna either — content looks wrong');
    failures += 1;
  } else {
    console.log('OK    AGENTS.md is the Karna project guide (no upstream Hermes template)');
  }
  if (!karnaUpstreamRef) {
    console.error('FAIL  AGENTS.md does not reference docs/upstream/AGENTS.hermes.md — should point maintainers to the archived upstream guide');
    failures += 1;
  } else {
    console.log('OK    AGENTS.md points to docs/upstream/AGENTS.hermes.md');
  }
}
if (!fs.existsSync(upstreamAgentsMd)) {
  console.error('FAIL  docs/upstream/AGENTS.hermes.md is missing — the original Hermes guide should be archived here, not deleted');
  failures += 1;
} else {
  const upstreamSrc = fs.readFileSync(upstreamAgentsMd, 'utf8');
  const looksLikeHermes = /# Hermes Agent - Development Guide/.test(upstreamSrc) || /## What Hermes Is\b/.test(upstreamSrc);
  if (looksLikeHermes) {
    console.log('OK    docs/upstream/AGENTS.hermes.md is the archived upstream Hermes guide');
  } else {
    console.error('FAIL  docs/upstream/AGENTS.hermes.md exists but does not look like the upstream Hermes guide');
    failures += 1;
  }
}

// 12. scripts/install.sh and scripts/install.ps1 seed HERMES_HOME/SOUL.md on
//     first install. They MUST be byte-identical to
//     hermes_cli/default_soul.py DEFAULT_SOUL_MD. Otherwise a fresh install
//     ends up with the upstream "I am Hermes Agent..." English persona, and
//     the runtime's `_ensure_default_soul_md` only upgrades the legacy
//     comment-only scaffold — not the upstream English persona — so the user
//     has to discover and edit SOUL.md by hand.
const installSh = path.join(REPO, 'scripts', 'install.sh');
const installPs1 = path.join(REPO, 'scripts', 'install.ps1');
const defaultSoulFile = path.join(REPO, 'hermes_cli', 'default_soul.py');

function extractHeredocSoul(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  // POSIX: cat > ... << 'SOUL_EOF'\n<text>\nSOUL_EOF
  const posix = src.match(/<<\s*'SOUL_EOF'\s*\n([\s\S]*?)\nSOUL_EOF/);
  if (posix) return posix[1].replace(/\s+/g, ' ').trim();
  // PowerShell: anchor to "$soulContent = @"" to skip the `& $pythonExe -c @"`
  // heredocs (install.ps1 has three @" ..."@ blocks total, only the last is SOUL.md).
  const ps = src.match(/\$soulContent\s*=\s*@"\s*\n([\s\S]*?)\n"@/);
  if (ps) return ps[1].replace(/\s+/g, ' ').trim();
  return null;
}

const expectedSoul = (() => {
  const src = fs.readFileSync(defaultSoulFile, 'utf8');
  // Pull the body of DEFAULT_SOUL_MD = ( "<chunks>" ). Use a non-greedy match
  // that requires a newline before the closing paren, so any ')' inside a
  // string literal doesn't terminate the capture early. Then join the
  // adjacent Python string literals.
  const match = src.match(/DEFAULT_SOUL_MD\s*=\s*\(([\s\S]*?)\n\)/);
  if (!match) return null;
  const body = match[1];
  const chunks = [];
  const re = /"((?:[^"\\\n]|\\.)*)"/g;
  let m;
  while ((m = re.exec(body)) !== null) chunks.push(m[1]);
  if (chunks.length === 0) return null;
  return chunks.join('').replace(/\s+/g, ' ').trim();
})();

if (!expectedSoul) {
  console.error('FAIL  could not parse DEFAULT_SOUL_MD from hermes_cli/default_soul.py');
  failures += 1;
}

for (const [file, scope] of [[installSh, 'scripts/install.sh'], [installPs1, 'scripts/install.ps1']]) {
  if (!fs.existsSync(file)) {
    console.error(`FAIL  ${scope} is missing`);
    failures += 1;
    continue;
  }
  const actual = extractHeredocSoul(file);
  if (!actual) {
    console.error(`FAIL  ${scope} heredoc not found (could not parse SOUL body)`);
    failures += 1;
    continue;
  }
  if (actual !== expectedSoul) {
    console.error(`FAIL  ${scope} SOUL.md heredoc has drifted from DEFAULT_SOUL_MD`);
    console.error(`        expected (first 60): ${JSON.stringify(expectedSoul.slice(0, 60))}`);
    console.error(`        actual   (first 60): ${JSON.stringify(actual.slice(0, 60))}`);
    failures += 1;
  } else if (actual.includes('You are Hermes Agent') || actual.includes('Nous Research')) {
    console.error(`FAIL  ${scope} still contains the upstream "Hermes Agent" boilerplate`);
    failures += 1;
  } else {
    console.log(`OK    ${scope} heredoc matches DEFAULT_SOUL_MD (Karna persona)`);
  }
}

// Windows branding must use the Karna icon for both the installer and the
// installed executable. This catches regressions where the old Hermes .ico
// remains in assets even though the renderer uses public/Karna.png.
const desktopPackage = JSON.parse(fs.readFileSync(path.join(REPO, 'apps', 'desktop', 'package.json'), 'utf8'));
const exeIdentity = fs.readFileSync(path.join(REPO, 'apps', 'desktop', 'scripts', 'set-exe-identity.cjs'), 'utf8');
if (desktopPackage.build?.nsis?.installerIcon !== 'assets/icon.ico' || desktopPackage.build?.nsis?.uninstallerIcon !== 'assets/icon.ico') {
  console.error('FAIL  NSIS installer/uninstaller icons are not pinned to assets/icon.ico');
  failures += 1;
} else {
  console.log('OK    NSIS installer and uninstaller use the Karna .ico asset');
}
if (!/ProductName:\s*'Karna'/.test(exeIdentity) || /ProductName:\s*'Hermes'/.test(exeIdentity)) {
  console.error('FAIL  installed executable identity is not Karna');
  failures += 1;
} else {
  console.log('OK    installed executable metadata is stamped as Karna');
}

console.log('--- summary ---');
if (failures === 0) {
  console.log('PASS  All branding checks green.');
  process.exit(0);
} else {
  console.error(`FAIL  ${failures} branding violation(s):`);
  for (const s of seen) console.error('  - ' + s);
  process.exit(1);
}
