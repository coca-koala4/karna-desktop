import { useCallback, useEffect, useRef } from 'react'

import {
  buildAttachmentContextBlock,
  buildAttachmentIngestBlock,
  createIngestJob,
  getIngestResult as fetchIngestResult,
  isParseableFile,
  pollIngestJob,
  type IngestResult
} from '@/lib/ingest-api'
import { setComposerAttachmentParseState } from '@/store/composer'
import { $ingestResults, setIngestResult } from '@/store/ingest-results'
import { notify } from '@/store/notifications'
import type { ModelCapabilities } from '@/types/hermes'

export function useAttachmentIngest() {
  const pollersRef = useRef<Map<string, () => void>>(new Map())

  const parseAttachment = useCallback(async (attachment: { id: string; path?: string; label: string }) => {
    const filePath = attachment.path
    if (!filePath || !isParseableFile(filePath)) {
      return
    }

    if (pollersRef.current.has(attachment.id)) {
      return
    }

    setComposerAttachmentParseState(attachment.id, {
      parseState: 'pending',
      parseMessage: 'Queued...'
    })

    try {
      const originalName = filePath.split(/[/\\]/).pop() || attachment.label
      const { job_id } = await createIngestJob({
        source: {
          kind: 'local_file',
          path: filePath,
          original_name: originalName
        },
        intent: 'chat_context',
        options: { engine: 'auto', ocr: 'auto' }
      })

      setComposerAttachmentParseState(attachment.id, {
        parseState: 'parsing',
        parseJobId: job_id,
        parseMessage: 'Starting...'
      })

      const stopPolling = pollIngestJob(job_id, job => {
        if (job.status === 'running') {
          setComposerAttachmentParseState(attachment.id, {
            parseState: 'parsing',
            parseMessage: job.message || job.stage || 'Parsing...',
            parseProgress: job.progress
          })
        } else if (job.status === 'parsed' || job.status === 'partial') {
          stopPolling()
          pollersRef.current.delete(attachment.id)
          fetchIngestResult(job_id).then(result => {
            setIngestResult(attachment.id, result)
            const engine = typeof result.metadata?.engine === 'string' ? result.metadata.engine : ''
            const pages = typeof result.metadata?.pages === 'number' ? result.metadata.pages : 0
            const chunks = result.chunks?.length || 0
            const detail = pages > 0 ? `${pages} page${pages > 1 ? 's' : ''}, ${engine}` : chunks > 0 ? `${chunks} chunks, ${engine}` : engine
            setComposerAttachmentParseState(attachment.id, {
              parseState: job.status === 'partial' ? 'partial' : 'parsed',
              parseMessage: 'Parsed',
              parseProgress: 1,
              parseEngine: engine,
              parseDetail: detail,
              parseWarnings: result.warnings
            })
            if (result.warnings?.length) {
              notify({ kind: 'warning', title: `${originalName} parsed with warnings`, message: result.warnings.join('; ') })
            }
          }).catch(() => {
            setComposerAttachmentParseState(attachment.id, {
              parseState: 'failed',
              parseMessage: '获取结果失败'
            })
          })
        } else if (job.status === 'failed') {
          stopPolling()
          pollersRef.current.delete(attachment.id)
          setComposerAttachmentParseState(attachment.id, {
            parseState: 'failed',
            parseMessage: job.error || '解析失败',
            parseProgress: 0
          })
        } else if (job.status === 'unsupported') {
          stopPolling()
          pollersRef.current.delete(attachment.id)
          setComposerAttachmentParseState(attachment.id, {
            parseState: 'failed',
            parseMessage: '不支持该文件类型',
            parseProgress: 0
          })
        }
      }, 1200)

      pollersRef.current.set(attachment.id, stopPolling)
    } catch (err) {
      setComposerAttachmentParseState(attachment.id, {
        parseState: 'failed',
        parseMessage: err instanceof Error ? err.message : '解析失败',
        parseProgress: 0
      })
    }
  }, [])

  const stopPolling = useCallback((attachmentId: string) => {
    const stop = pollersRef.current.get(attachmentId)
    if (stop) {
      stop()
      pollersRef.current.delete(attachmentId)
    }
  }, [])

  useEffect(() => {
    return () => {
      for (const stop of pollersRef.current.values()) {
        stop()
      }
      pollersRef.current.clear()
    }
  }, [])

  return { parseAttachment, stopPolling }
}

export function getIngestContextBlocks(attachments: Array<{ id: string }>, maxChars = 8000): string {
  const blocks: string[] = []
  let totalChars = 0
  const results = $ingestResults.get()

  for (const att of attachments) {
    const result = results[att.id] as IngestResult | undefined
    if (!result || (result.status !== 'parsed' && result.status !== 'partial')) continue

    const block = buildAttachmentContextBlock(result, { previewChars: 2000 })
    if (totalChars + block.length > maxChars * 2) break
    blocks.push(block)
    totalChars += block.length
  }

  return blocks.join('\n\n')
}

export type ImageSendMode = 'native' | 'auxiliary' | 'blocked'

export function shouldSendImageNatively(
  modelCapabilities: Pick<ModelCapabilities, 'vision'>,
  auxiliaryModels?: { tasks: Array<{ task: string; model: string }> }
): ImageSendMode {
  if (modelCapabilities.vision === true) {
    return 'native'
  }

  const hasVisionAuxiliary = auxiliaryModels?.tasks.some(
    task => task.task === 'vision' && task.model && task.model.trim() !== ''
  )

  if (hasVisionAuxiliary) {
    return 'auxiliary'
  }

  return 'blocked'
}
