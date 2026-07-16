import { useEffect, useState } from 'react'
import { strFromU8, unzipSync } from 'fflate'
import { AlertCircle, ExternalLink, Loader2, Network } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { createWriterPreviewBlob } from '@/lib/writer-preview'

interface MindNode {
  id: string
  title: string
  children: MindNode[]
}

function topicFromJson(topic: any): MindNode {
  const attached = Array.isArray(topic?.children?.attached) ? topic.children.attached : []
  const detached = Array.isArray(topic?.children?.detached) ? topic.children.detached : []
  return {
    id: String(topic?.id || crypto.randomUUID()),
    title: String(topic?.title || '未命名主题'),
    children: [...attached, ...detached].map(topicFromJson)
  }
}

function parseLegacyXml(xml: string): MindNode[] {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const roots = Array.from(document.querySelectorAll('sheet > topic, xmap\\:sheet > xmap\\:topic'))
  const parse = (element: Element): MindNode => {
    const directTitle = Array.from(element.children).find(child => /(^|:)title$/.test(child.tagName))
    const childTopics = Array.from(element.children)
      .flatMap(child => Array.from(child.querySelectorAll(':scope > topics > topic, :scope > xmap\\:topics > xmap\\:topic')))
    return {
      id: element.getAttribute('id') || crypto.randomUUID(),
      title: directTitle?.textContent?.trim() || '未命名主题',
      children: childTopics.map(parse)
    }
  }
  return roots.map(parse)
}

function MindTree({ node, depth = 0 }: { node: MindNode; depth?: number }) {
  return (
    <li>
      <div className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-(--ui-control-hover-background)" style={{ marginLeft: depth * 18 }}>
        <Network className="size-3.5 shrink-0 text-(--ui-color-accent)" />
        <span className="text-sm">{node.title}</span>
      </div>
      {node.children.length > 0 && (
        <ul>{node.children.map(child => <MindTree depth={depth + 1} key={child.id} node={child} />)}</ul>
      )}
    </li>
  )
}

export function XmindViewer({ filePath, onOpenExternal }: { filePath: string; onOpenExternal?: () => void }) {
  const [state, setState] = useState<{ loading: boolean; roots: MindNode[]; error?: string }>({ loading: true, roots: [] })

  useEffect(() => {
    let cancelled = false
    let release: (() => Promise<void>) | undefined
    void (async () => {
      try {
        const preview = await createWriterPreviewBlob(filePath, 'application/octet-stream')
        release = preview.release
        const archive = unzipSync(new Uint8Array(await (await fetch(preview.url)).arrayBuffer()))
        let roots: MindNode[] = []
        if (archive['content.json']) {
          const sheets = JSON.parse(strFromU8(archive['content.json']))
          roots = (Array.isArray(sheets) ? sheets : []).map((sheet: any) => topicFromJson(sheet.rootTopic)).filter(Boolean)
        } else if (archive['content.xml']) {
          roots = parseLegacyXml(strFromU8(archive['content.xml']))
        } else {
          throw new Error('压缩包中不存在 content.json 或 content.xml')
        }
        if (!cancelled) setState({ loading: false, roots })
      } catch (error) {
        if (!cancelled) setState({ loading: false, roots: [], error: error instanceof Error ? error.message : '解析失败' })
      }
    })()
    return () => {
      cancelled = true
      if (release) void release()
    }
  }, [filePath])

  if (state.loading) return <div className="flex h-full items-center justify-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />正在解析 XMind...</div>
  if (state.error) return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <AlertCircle className="size-10 text-destructive" />
      <p className="max-w-lg text-sm text-(--ui-text-secondary)">XMind 解析失败：{state.error}</p>
      <Button onClick={onOpenExternal} size="sm" variant="outline"><ExternalLink className="size-4" />外部打开</Button>
    </div>
  )
  return (
    <div className="h-full min-h-0 overflow-auto overscroll-contain p-4">
      <div className="mx-auto max-w-3xl rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-surface-primary) p-3 pb-24">
        <div className="mb-2 flex items-center justify-between border-b border-(--ui-stroke-secondary) pb-2">
          <span className="text-sm font-medium">XMind 大纲</span>
          <Button onClick={onOpenExternal} size="xs" variant="ghost"><ExternalLink className="size-3.5" />外部编辑</Button>
        </div>
        {state.roots.length ? <ul>{state.roots.map(root => <MindTree key={root.id} node={root} />)}</ul> : <p className="p-6 text-center text-sm text-(--ui-text-tertiary)">空思维导图</p>}
      </div>
    </div>
  )
}
