import contract from '../../shared/writer-os-api-contract.json'

type ContractModule = (typeof contract.modules)[number]

export const WRITER_OS_API_CONTRACT = contract

const moduleByName = new Map<string, ContractModule>(
  contract.modules.flatMap(module => [[module.id, module], ...module.aliases.map(alias => [alias, module] as const)])
)

export function canonicalWriterOsModule(module: string): string {
  return moduleByName.get(module)?.id ?? module
}

export function writerOsApiPath(projectRef: string, module: string, action?: string): string {
  const path = contract.pathTemplate
    .replace('{projectRef}', encodeURIComponent(projectRef))
    .replace('{module}', canonicalWriterOsModule(module))

  return action ? `${path}/${encodeURIComponent(action)}` : path
}

export function writerOsResponseKeys(module: string): readonly string[] {
  return moduleByName.get(module)?.responseKeys ?? []
}

export function hasWriterOsResponseShape(module: string, value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }

  return writerOsResponseKeys(module).every(key => key in value)
}
