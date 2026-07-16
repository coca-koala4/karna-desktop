import {
  WRITER_OS_API_CONTRACT,
  canonicalWriterOsModule,
  writerOsApiPath,
  hasWriterOsResponseShape
} from './writer-os-contract'

export interface WriterOsModuleInfo {
  id: string
  aliases: string[]
  responseKeys: readonly string[]
}

export const WRITER_OS_MODULES: WriterOsModuleInfo[] = WRITER_OS_API_CONTRACT.modules.map(m => ({
  id: m.id,
  aliases: m.aliases,
  responseKeys: m.responseKeys
}))

export async function writerOsApi<T = unknown>(
  projectRef: string,
  module: string,
  options: { body?: unknown; method?: string; action?: string } = {}
): Promise<T> {
  const path = writerOsApiPath(projectRef, module, options.action)
  return window.karnaDesktop.api<T>({
    body: options.body,
    method: options.method || 'GET',
    path
  })
}

export async function getWriterOsModuleData(
  projectRef: string,
  module: string,
  options: { action?: string; body?: unknown } = {}
): Promise<unknown> {
  const result = await writerOsApi(projectRef, module, {
    method: options.body || options.action ? 'POST' : 'GET',
    action: options.action,
    body: options.body
  })

  return result
}

export function getModuleInfo(moduleId: string): WriterOsModuleInfo | undefined {
  const canonical = canonicalWriterOsModule(moduleId)
  return WRITER_OS_MODULES.find(m => m.id === canonical)
}

export function validateModuleResponse(module: string, value: unknown): boolean {
  return hasWriterOsResponseShape(module, value)
}
