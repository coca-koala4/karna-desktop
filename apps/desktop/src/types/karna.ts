/* ------------------------------------------------------------------ */
/*  Karna Shared Contract Types - Phase A                              */
/* ------------------------------------------------------------------ */

// ── A1. Conversation Scope ─────────────────────────────────────────────

export type ConversationScope =
  | {
      type: 'standalone'
      workspaceId: null
      writerProjectId: null
      cwd: string
    }
  | {
      type: 'project'
      workspaceId: string
      writerProjectId: string
      projectName: string
      cwd: string
    }

export type PermissionMode = 'restricted' | 'computer' | 'dangerous'

// ── A2. Workflow Binding ──────────────────────────────────────────────

export interface NormalizedWorkflow {
  id: string
  name: string
  description?: string
  version: number
  nodes: unknown[]
  edges: unknown[]
  [key: string]: unknown
}

export interface NormalizedWorkflowAgent {
  id: string
  name: string
  role: string
  model?: string
  [key: string]: unknown
}

export interface WorkflowExecutionStep {
  nodeId: string
  agentId?: string
  dependencies: string[]
  [key: string]: unknown
}

export interface WorkflowExecutionPlan {
  workflowId: string
  steps: WorkflowExecutionStep[]
  entryNodeId?: string
  [key: string]: unknown
}

export interface WorkflowBinding {
  workflowId: string
  source: 'global' | 'project'
  workspaceId: string | null
  version: number
  contentHash: string
}

export interface ResolvedWorkflowContext {
  binding: WorkflowBinding
  workflow: NormalizedWorkflow
  agents: NormalizedWorkflowAgent[]
  executionPlan: WorkflowExecutionPlan
}

// ── A3. Skill Import Contracts ────────────────────────────────────────

export type SkillImportSource =
  | { type: 'markdown'; path: string }
  | { type: 'archive'; path: string }
  | { type: 'github'; url: string; ref?: string; subdirectory?: string }

export interface DetectedSkill {
  id: string
  name: string
  path: string
  category?: string
  description?: string
  [key: string]: unknown
}

export interface ImportWarning {
  code: string
  message: string
  skillId?: string
  severity: 'info' | 'warning'
}

export interface SkillConflict {
  skillId: string
  existingPath: string
  newPath: string
  reason: string
}

export interface ImportedSkill {
  id: string
  name: string
  installedPath: string
  source: SkillImportSource
}

export interface SkillImportPreflight {
  source: SkillImportSource
  detectedSkills: DetectedSkill[]
  warnings: ImportWarning[]
  conflicts: SkillConflict[]
  blockedReasons: string[]
}

export interface SkillImportReceipt {
  imported: ImportedSkill[]
  sourceMetadata: {
    url?: string
    commitSha?: string
    importedAt: string
  }
}

// ── A4. Brand Resource Registry ───────────────────────────────────────

export interface BrandResourceEntry {
  id: string
  type: 'codicon' | 'local-svg' | 'local-image'
  value: string
  fallback: string
  source: string
  license?: string
  version: string
  fileHash?: string
}

// ── A5. Unified API Error ─────────────────────────────────────────────

export interface KarnaApiError {
  code: string
  message: string
  recoverable: boolean
  details?: Record<string, unknown>
}
