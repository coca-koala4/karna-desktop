/* eslint-disable no-unused-vars, no-empty, no-control-regex, no-useless-escape, no-undef */
'use strict';

/**
 * Karna Desktop — 项目领域图标契约测试
 *
 * 验证 writer-project-catalog-data.ts 中所有项目领域的图标都是有效的 Codicon。
 *
 * Run: node apps/desktop/electron/karna/project-domain-icons.test.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const CATALOG_DATA_FILE = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'writer-project-catalog-data.ts');
const CODICON_COMPONENT_FILE = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'ui', 'codicon.tsx');

let failures = 0;

const VALID_CODICONS = new Set([
  'add', 'alert', 'archive', 'arrow-both', 'arrow-down', 'arrow-left', 'arrow-right', 'arrow-up',
  'beaker', 'bell', 'bold', 'book', 'briefcase', 'browser', 'bug', 'calendar', 'call-incoming',
  'call-outgoing', 'case-sensitive', 'check', 'checklist', 'chevron-down', 'chevron-left',
  'chevron-right', 'chevron-up', 'chrome-close', 'circle', 'circle-filled', 'circle-outline',
  'clear-all', 'clock', 'clone', 'close', 'close-all', 'cloud', 'cloud-upload', 'code',
  'collapse-all', 'color-mode', 'comment', 'console', 'copy', 'credit-card', 'dashboard',
  'database', 'debug', 'default', 'diff', 'diff-added', 'diff-ignored', 'diff-modified',
  'diff-removed', 'diff-renamed', 'discard', 'edit', 'editor-layout', 'ellipsis', 'empty-window',
  'error', 'expand-all', 'export', 'extensions', 'eye', 'eye-closed', 'file', 'file-binary',
  'file-code', 'file-media', 'file-pdf', 'file-text', 'files', 'filter', 'flame', 'fold',
  'fold-down', 'fold-up', 'folder', 'folder-active', 'folder-opened', 'gear', 'gift',
  'gist-secret', 'git-branch', 'git-commit', 'git-compare', 'git-merge', 'git-pull-request',
  'github', 'github-action', 'globe', 'go-to-file', 'grabber', 'graph', 'gripper', 'heart',
  'heart-filled', 'history', 'home', 'horizontal-rule', 'hubot', 'inbox', 'info', 'issue-reopened',
  'issues', 'italic', 'jersey', 'json', 'kebab-vertical', 'key', 'law', 'library', 'lightbulb',
  'link', 'list-ordered', 'list-unordered', 'live-share', 'loading', 'location', 'lock',
  'log-in', 'log-out', 'logo-github', 'mail', 'mail-read', 'markdown', 'megaphone', 'mention',
  'menu', 'merge', 'message', 'microscope', 'mirror', 'more', 'multiple-windows', 'mute',
  'new-file', 'new-folder', 'no-newline', 'note', 'notebook', 'octoface', 'open-preview',
  'organization', 'output', 'package', 'paintcan', 'pass', 'person', 'pin', 'play', 'plug',
  'preset', 'preview', 'primitive-dot', 'primitive-square', 'project', 'pulse', 'question',
  'quote', 'radio-tower', 'reactions', 'record', 'redo', 'references', 'refresh', 'regex',
  'remote', 'remove', 'replace', 'reply', 'repo', 'repo-clone', 'repo-force-push', 'repo-forked',
  'repo-pull', 'report', 'request-changes', 'rocket', 'root-folder', 'root-folder-opened', 'rss',
  'save', 'screen-full', 'search', 'search-stop', 'selection', 'server', 'settings', 'shield',
  'sign-in', 'sign-out', 'sort-precedence', 'source-control', 'split-horizontal', 'split-vertical',
  'squirrel', 'star', 'star-empty', 'star-filled', 'stop', 'symbol-array', 'symbol-boolean',
  'symbol-class', 'symbol-color', 'symbol-constant', 'symbol-enum', 'symbol-enum-member',
  'symbol-event', 'symbol-field', 'symbol-file', 'symbol-interface', 'symbol-key', 'symbol-keyword',
  'symbol-method', 'symbol-misc', 'symbol-namespace', 'symbol-null', 'symbol-number',
  'symbol-numeric', 'symbol-object', 'symbol-operator', 'symbol-parameter', 'symbol-property',
  'symbol-ruler', 'symbol-snippet', 'symbol-string', 'symbol-structure', 'symbol-variable', 'sync',
  'tab', 'tag', 'tasklist', 'telescope', 'terminal', 'text-size', 'three-bars', 'thumbsdown',
  'thumbsup', 'tools', 'trash', 'trashcan', 'triangle-down', 'triangle-left', 'triangle-right',
  'triangle-up', 'trophy', 'twitter', 'unfold', 'unlock', 'unmute', 'unverified', 'variable',
  'verified', 'versions', 'vm', 'vm-active', 'vm-outline', 'vm-running', 'warning', 'watch',
  'whitespace', 'window', 'wrench', 'x', 'zoom-in', 'zoom-out'
]);

const EXPECTED_DOMAINS = [
  'literature',
  'film-theater',
  'games-interactive',
  'marketing-brand',
  'news-publishing',
  'academic-research',
  'business-enterprise',
  'legal-government',
  'technical-docs',
  'knowledge-assets'
];

console.log('--- Test 1: writer-project-catalog-data.ts 存在性检查 ---');
if (!fs.existsSync(CATALOG_DATA_FILE)) {
  console.error('FAIL  writer-project-catalog-data.ts 不存在:', CATALOG_DATA_FILE);
  failures += 1;
} else {
  console.log('OK    writer-project-catalog-data.ts 存在');
}

console.log('--- Test 2: codicon.tsx 存在性检查 ---');
if (!fs.existsSync(CODICON_COMPONENT_FILE)) {
  console.error('FAIL  codicon.tsx 不存在:', CODICON_COMPONENT_FILE);
  failures += 1;
} else {
  console.log('OK    codicon.tsx 存在');
}

console.log('--- Test 3: 验证 WRITING_DOMAINS 数组完整性 ---');
if (fs.existsSync(CATALOG_DATA_FILE)) {
  const content = fs.readFileSync(CATALOG_DATA_FILE, 'utf8');

  const domainsMatch = content.match(/export const WRITING_DOMAINS[^=]*=\s*\[([\s\S]*?)\]/);
  if (!domainsMatch) {
    console.error('FAIL  无法找到 WRITING_DOMAINS 数组定义');
    failures += 1;
  } else {
    const domainsBlock = domainsMatch[1];
    const domainObjects = [];
    const regex = /\{\s*id:\s*['"]([^'"]+)['"][^}]*icon:\s*['"]([^'"]+)['"][^}]*\}/g;
    let match;
    while ((match = regex.exec(domainsBlock)) !== null) {
      domainObjects.push({ id: match[1], icon: match[2] });
    }

    console.log(`找到 ${domainObjects.length} 个领域定义`);

    if (domainObjects.length !== 10) {
      console.error(`FAIL  期望找到 10 个领域，实际找到 ${domainObjects.length} 个`);
      failures += 1;
    } else {
      console.log('OK    领域数量正确（10个）');
    }

    for (const expectedId of EXPECTED_DOMAINS) {
      const found = domainObjects.find(d => d.id === expectedId);
      if (!found) {
        console.error(`FAIL  缺少领域定义: ${expectedId}`);
        failures += 1;
      } else {
        console.log(`OK    找到领域: ${expectedId}`);
      }
    }

    console.log('--- Test 4: 验证所有领域图标都是有效的 Codicon ---');
    for (const domain of domainObjects) {
      if (!VALID_CODICONS.has(domain.icon)) {
        console.error(`FAIL  领域 "${domain.id}" 使用了无效图标: "${domain.icon}"`);
        failures += 1;
      } else {
        console.log(`OK    领域 "${domain.id}" 使用有效图标: "${domain.icon}"`);
      }
    }
  }
}

console.log('--- Test 5: 验证 codicon.tsx 包含 fallback 机制 ---');
if (fs.existsSync(CODICON_COMPONENT_FILE)) {
  const content = fs.readFileSync(CODICON_COMPONENT_FILE, 'utf8');

  if (!content.includes('VALID_CODICONS')) {
    console.error('FAIL  codicon.tsx 中未找到 VALID_CODICONS 集合定义');
    failures += 1;
  } else {
    console.log('OK    codicon.tsx 包含 VALID_CODICONS 集合');
  }

  if (!content.includes('FALLBACK_ICON')) {
    console.error('FAIL  codicon.tsx 中未找到 FALLBACK_ICON 定义');
    failures += 1;
  } else {
    console.log('OK    codicon.tsx 包含 FALLBACK_ICON 定义');
  }

  if (!content.includes('resolveIconName')) {
    console.error('FAIL  codicon.tsx 中未找到 resolveIconName 函数');
    failures += 1;
  } else {
    console.log('OK    codicon.tsx 包含 resolveIconName 验证函数');
  }

  if (!content.includes('console.warn')) {
    console.error('FAIL  codicon.tsx 中未找到开发环境警告输出');
    failures += 1;
  } else {
    console.log('OK    codicon.tsx 包含开发环境警告输出');
  }
}

console.log('--- Test 6: 验证之前有问题的图标已被修复 ---');
if (fs.existsSync(CATALOG_DATA_FILE)) {
  const content = fs.readFileSync(CATALOG_DATA_FILE, 'utf8');

  const invalidIcons = ['gamepad', 'newspaper', 'device-camera-video'];
  for (const invalidIcon of invalidIcons) {
    if (content.includes(`icon: '${invalidIcon}'`) || content.includes(`icon: "${invalidIcon}"`)) {
      console.error(`FAIL  文件中仍然包含无效图标: "${invalidIcon}"`);
      failures += 1;
    } else {
      console.log(`OK    无效图标 "${invalidIcon}" 已被移除`);
    }
  }
}

console.log('--- summary ---');
if (failures === 0) {
  console.log('PASS  所有项目领域图标检查通过！');
  process.exit(0);
} else {
  console.error(`FAIL  ${failures} 个图标契约违规。`);
  process.exit(1);
}
