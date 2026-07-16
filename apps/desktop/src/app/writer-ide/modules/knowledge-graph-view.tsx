import { useMemo, useState } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

interface GraphNode {
  id: string
  type?: string
  label?: string
  name?: string
  properties?: Record<string, unknown>
}

interface GraphEdge {
  id: string
  source: string
  target: string
  type?: string
  label?: string
  properties?: Record<string, unknown>
}

interface KnowledgeGraphData {
  nodes?: GraphNode[]
  edges?: GraphEdge[]
}

type GraphTab = 'nodes' | 'edges' | 'raw'

const NODE_TYPE_ICONS: Record<string, string> = {
  character: 'person',
  person: 'person',
  location: 'location',
  place: 'location',
  event: 'history',
  item: 'tag',
  object: 'tag',
  organization: 'organization',
  theme: 'symbol-namespace',
  foreshadow: 'lightbulb',
  chapter: 'book'
}

export function KnowledgeGraphView({ data }: { data: unknown }) {
  const graph = (data as { nodes?: GraphNode[]; edges?: GraphEdge[] }) || (data as KnowledgeGraphData)
  const nodes = graph.nodes || []
  const edges = graph.edges || []
  const [activeTab, setActiveTab] = useState<GraphTab>('nodes')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  const nodeTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    nodes.forEach(n => {
      const type = n.type || 'unknown'
      counts[type] = (counts[type] || 0) + 1
    })
    return counts
  }, [nodes])

  const selectedNodeData = nodes.find(n => n.id === selectedNode)
  const relatedEdges = edges.filter(e => e.source === selectedNode || e.target === selectedNode)

  const tabs: Array<{ id: GraphTab; label: string; icon: string; count?: number }> = [
    { id: 'nodes', label: '节点', icon: 'circle-filled', count: nodes.length },
    { id: 'edges', label: '关系', icon: 'arrow-both', count: edges.length },
    { id: 'raw', label: '原始', icon: 'json' }
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Codicon name="organization" size="1rem" />
        <h3 className="text-sm font-medium">知识图谱</h3>
        <div className="ml-auto flex items-center gap-2 text-xs text-(--ui-text-quaternary)">
          <span>{nodes.length} 节点</span>
          <span>{edges.length} 关系</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-(--ui-stroke-secondary) pb-2">
        {tabs.map(tab => (
          <button
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
              activeTab === tab.id
                ? 'bg-(--ui-control-active-background) text-foreground'
                : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
            )}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            <Codicon name={tab.icon} size="0.75rem" />
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className="rounded bg-(--ui-surface-tertiary) px-1 text-[10px] text-(--ui-text-quaternary)">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="max-h-[350px] overflow-auto">
        {activeTab === 'nodes' && (
          <NodesList
            nodes={nodes}
            selectedNode={selectedNode}
            setSelectedNode={setSelectedNode}
            selectedNodeData={selectedNodeData}
            relatedEdges={relatedEdges}
          />
        )}
        {activeTab === 'edges' && <EdgesList edges={edges} nodes={nodes} />}
        {activeTab === 'raw' && <RawJsonView data={data} />}
      </div>

      <div className="pt-2">
        <div className="mb-1 text-[10px] font-medium text-(--ui-text-secondary)">节点类型</div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(nodeTypeCounts).map(([type, count]) => (
            <span
              className="flex items-center gap-1 rounded bg-(--ui-surface-tertiary) px-1.5 py-0.5 text-[10px] text-(--ui-text-secondary)"
              key={type}
            >
              <Codicon name={NODE_TYPE_ICONS[type] || 'circle-small'} size="0.625rem" />
              {type}
              <span className="text-(--ui-text-quaternary)">{count}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function NodesList({
  nodes,
  selectedNode,
  setSelectedNode,
  selectedNodeData,
  relatedEdges
}: {
  nodes: GraphNode[]
  selectedNode: string | null
  setSelectedNode: (id: string | null) => void
  selectedNodeData: GraphNode | undefined
  relatedEdges: GraphEdge[]
}) {
  if (nodes.length === 0) {
    return <EmptyState text="暂无节点" />
  }

  return (
    <div className="flex gap-2">
      <div className="w-1/2 space-y-1">
        {nodes.slice(0, 50).map(node => (
          <button
            className={cn(
              'flex w-full items-center gap-2 rounded p-2 text-left transition-colors',
              selectedNode === node.id
                ? 'bg-(--ui-control-active-background)'
                : 'hover:bg-(--ui-control-hover-background)'
            )}
            key={node.id}
            onClick={() => setSelectedNode(node.id)}
            type="button"
          >
            <Codicon
              className="text-(--ui-text-quaternary)"
              name={NODE_TYPE_ICONS[node.type || ''] || 'circle-small'}
              size="0.75rem"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-(--ui-text-primary)">
                {node.label || node.name || node.id}
              </div>
              {node.type && (
                <div className="truncate text-[10px] text-(--ui-text-quaternary)">
                  {node.type}
                </div>
              )}
            </div>
          </button>
        ))}
        {nodes.length > 50 && (
          <div className="text-center text-[10px] text-(--ui-text-quaternary)">
            还有 {nodes.length - 50} 个节点...
          </div>
        )}
      </div>

      <div className="w-1/2">
        {selectedNodeData ? (
          <div className="space-y-2">
            <div>
              <div className="text-xs font-medium text-(--ui-text-primary)">
                {selectedNodeData.label || selectedNodeData.name || selectedNodeData.id}
              </div>
              {selectedNodeData.type && (
                <div className="text-[10px] text-(--ui-text-quaternary">
                  {selectedNodeData.type}
                </div>
              )}
            </div>

            {relatedEdges.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-medium text-(--ui-text-secondary)">
                  相关关系 ({relatedEdges.length})
                </div>
                <div className="space-y-1">
                  {relatedEdges.slice(0, 5).map(edge => (
                    <div key={edge.id} className="rounded bg-(--ui-surface-tertiary) p-1.5 text-[10px]">
                      <span className="text-(--ui-text-secondary)">
                        {edge.type || edge.label || '关联'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedNodeData.properties && Object.keys(selectedNodeData.properties).length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-medium text-(--ui-text-secondary)">属性</div>
                <pre className="rounded bg-(--ui-surface-secondary) p-2 text-[10px] text-(--ui-text-secondary)">
                  {JSON.stringify(selectedNodeData.properties, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-(--ui-text-quaternary)">
            选择一个节点查看详情
          </div>
        )}
      </div>
    </div>
  )
}

function EdgesList({ edges, nodes }: { edges: GraphEdge[]; nodes: GraphNode[] }) {
  if (edges.length === 0) {
    return <EmptyState text="暂无关系" />
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  const getNodeLabel = (id: string) => {
    const node = nodeMap.get(id)
    return node?.label || node?.name || id
  }

  return (
    <div className="space-y-1">
      {edges.slice(0, 50).map(edge => (
        <div
          className="flex items-center gap-2 rounded bg-(--ui-surface-tertiary) p-2"
          key={edge.id}
        >
          <span className="truncate text-xs text-(--ui-text-primary)">
            {getNodeLabel(edge.source)}
          </span>
          <span className="shrink-0 rounded bg-(--ui-surface-secondary) px-1.5 py-0.5 text-[10px] text-(--ui-text-secondary)">
            {edge.type || edge.label || '→'}
          </span>
          <span className="truncate text-xs text-(--ui-text-primary)">
            {getNodeLabel(edge.target)}
          </span>
        </div>
      ))}
      {edges.length > 50 && (
        <div className="text-center text-[10px] text-(--ui-text-quaternary)">
          还有 {edges.length - 50} 条关系...
        </div>
      )}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-xs text-(--ui-text-quaternary)">
      {text}
    </div>
  )
}

function RawJsonView({ data }: { data: unknown }) {
  return (
    <pre className="rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary) p-3 font-mono text-xs leading-relaxed">
      <code className="text-(--ui-text-secondary)">
        {JSON.stringify(data, null, 2)}
      </code>
    </pre>
  )
}
