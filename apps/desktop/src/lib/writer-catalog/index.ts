export * from './types'
export * from './workbench-types'
export { WRITER_DOMAINS, WRITER_FAMILIES } from './domains'
export { DOCUMENT_PRESETS } from './presets'
export { WRITER_FORMS } from './forms'
export { WRITER_WORKFLOW_TEMPLATES } from './workflows'
export { CORE_MODULES, CORE_METRICS } from './core-modules'
export { CAPABILITY_PACKS, ALL_MODULES, ALL_METRICS } from './capability-packs'
export { WORKBENCH_PROFILES, findProfileForDocumentType, findProfileForForm, getProfileById, resolveProfile, resolveModulesForProfile } from './profiles'
export { ALL_EDITOR_ACTIONS, getActionsForDocumentType, getActionGroups, GROUP_LABELS, GROUP_ICONS } from './editor-actions'
export type { EditorToolbarAction } from './editor-actions'

export { WRITER_CATALOG_VERSION } from './types'

import { WRITER_DOMAINS, WRITER_FAMILIES } from './domains'
import { DOCUMENT_PRESETS } from './presets'
import { WRITER_FORMS } from './forms'
import { WRITER_WORKFLOW_TEMPLATES } from './workflows'
import { CAPABILITY_PACKS } from './capability-packs'
import { WORKBENCH_PROFILES } from './profiles'
import { ALL_MODULES, ALL_METRICS } from './capability-packs'
import { ALL_EDITOR_ACTIONS } from './editor-actions'
import { WRITER_CATALOG_VERSION } from './types'

export function getWriterCatalog() {
  return {
    version: WRITER_CATALOG_VERSION,
    domains: WRITER_DOMAINS,
    families: WRITER_FAMILIES,
    presets: DOCUMENT_PRESETS,
    forms: WRITER_FORMS,
    workflows: WRITER_WORKFLOW_TEMPLATES,
    capabilityPacks: CAPABILITY_PACKS,
    profiles: WORKBENCH_PROFILES,
    modules: ALL_MODULES,
    metrics: ALL_METRICS,
    editorActions: ALL_EDITOR_ACTIONS
  }
}
