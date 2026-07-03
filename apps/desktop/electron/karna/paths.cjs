'use strict';

/**
 * Karna Desktop — paths.cjs
 *
 * Phase 1 Task 1.2 (数据目录策略) 的实现：所有用户/产品数据目录的单一来源。
 *
 * 规则：
 *   1. dev (打包前) 默认数据根 = <repo>/karna-data（与现状一致）
 *   2. packaged (打包后) 数据根 = app.getPath('userData') 即 %APPDATA%/Karna
 *   3. 可通过环境变量 KARNA_DATA_DIR 显式覆盖（测试与高级用户使用）
 *   4. 任何业务模块（karna-adapter.cjs 及其未来拆分的 services）均不得再硬编码
 *      'karna-data' 字符串字面量 — 全部派生自本文件
 *
 * 设计目标：
 *   - paths.cjs 是 CommonJS 模块，可被 Electron main 进程、Node 测试、
 *     以及未来 Phase 2 拆分的 services 共同 require。
 *   - 不依赖 Electron（app 是通过依赖注入传入），因此可在 plain Node 测试
 *     环境下完整运行。
 *   - 调用约定：每个 helper 是一个 0-arg 函数，便于未来注入用户偏好。
 *
 * 兼容：
 *   - 旧路径 D:\Agent\projects\karna-hermes\karna-data 在打包前继续生效，
 *     不会破坏现有 karna-data/writer-projects/.../ 测试/ 样例项目。
 */

const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

/**
 * 决定 Karna 数据根目录。
 *
 * @param {object} [opts]
 * @param {NodeJS.ProcessEnv} [opts.env]  - 进程环境（默认 process.env）
 * @param {Electron.App | null} [opts.app] - Electron app 实例（packaged 时提供）
 * @returns {string} 绝对路径，无尾随分隔符
 */
function dataRoot(opts = {}) {
  const env = opts.env || process.env;
  const app = opts.app || null;
  if (env && env.KARNA_DATA_DIR && env.KARNA_DATA_DIR.trim().length > 0) {
    return path.resolve(env.KARNA_DATA_DIR);
  }
  if (env && env.HERMES_DESKTOP_USER_DATA_DIR && env.HERMES_DESKTOP_USER_DATA_DIR.trim().length > 0) {
    // Electron main 进程用 HERMES_DESKTOP_USER_DATA_DIR 覆盖 userData
    // (test:desktop:fresh 也会用这个)。在 packaged 场景下应把它当 userData
    // 使用，确保数据落到打包可写位置，而不是 repo checkout。
    return path.join(path.resolve(env.HERMES_DESKTOP_USER_DATA_DIR), 'karna-data');
  }
  if (app && typeof app.getPath === 'function') {
    try {
      return path.join(app.getPath('userData'), 'karna-data');
    } catch (_) {
      // app 尚未 ready — 退到 dev 默认
    }
  }
  // dev fallback: <repo>/karna-data
  return path.join(REPO_ROOT, 'karna-data');
}

function writerProjectsDir(opts) { return path.join(dataRoot(opts), 'writer-projects'); }
function soulWorkshopDir(opts)  { return path.join(dataRoot(opts), 'soul-workshop'); }
function workflowsDir(opts)      { return path.join(dataRoot(opts), 'global-workflows'); }
function globalWorkflowsDir(opts){ return path.join(dataRoot(opts), 'global-workflows'); }
function logsDir(opts)           { return path.join(dataRoot(opts), 'logs'); }

function knowledgeBaseFile(opts)   { return path.join(dataRoot(opts), 'knowledge_base.json'); }
function mcpServersFile(opts)      { return path.join(dataRoot(opts), 'mcp_servers.json'); }
function pluginsFile(opts)         { return path.join(dataRoot(opts), 'plugins.json'); }
function skillsStateFile(opts)     { return path.join(dataRoot(opts), 'skills_state.json'); }
function soulWorkshopIndexFile(opts) { return path.join(dataRoot(opts), 'soul_workshop.json'); }
function writerProjectsIndexFile(opts) { return path.join(dataRoot(opts), 'writer_projects.json'); }

// 测试 hook：允许测试在改 env 后重置内部缓存（当前未做缓存，保留为占位）
function __reset() { /* no-op for now */ }

module.exports = {
  REPO_ROOT,
  dataRoot,
  writerProjectsDir,
  soulWorkshopDir,
  workflowsDir,
  globalWorkflowsDir,
  knowledgeBaseFile,
  mcpServersFile,
  pluginsFile,
  skillsStateFile,
  soulWorkshopIndexFile,
  writerProjectsIndexFile,
  logsDir,
  __reset,
};
