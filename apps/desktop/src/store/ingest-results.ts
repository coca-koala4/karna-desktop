import { map } from 'nanostores'

import type { IngestResult } from '@/lib/ingest-api'

export const $ingestResults = map<Record<string, IngestResult>>({})

export function setIngestResult(attachmentId: string, result: IngestResult) {
  $ingestResults.setKey(attachmentId, result)
}

export function getIngestResult(attachmentId: string): IngestResult | undefined {
  return $ingestResults.get()[attachmentId]
}

export function clearIngestResult(attachmentId: string) {
  const current = $ingestResults.get()
  if (current[attachmentId]) {
    const next = { ...current }
    delete next[attachmentId]
    $ingestResults.set(next)
  }
}

export function clearAllIngestResults() {
  $ingestResults.set({})
}
