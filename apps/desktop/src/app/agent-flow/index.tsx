import { useState, useEffect, useCallback } from 'react'

import { cn } from '@/lib/utils'

import { FlowCanvas } from './flow-canvas'
import { FlowInspector } from './flow-inspector'
import { FlowRunPanel } from './flow-run-panel'
import { ResourceDrawer, type DrawerType } from './resource-drawer'
import { AgentFlowProvider, useAgentFlow } from './store'
import { AgentFlowTopBar } from './top-bar'

function AgentFlowContent() {
  const {
    runPanelVisible: storeRunPanelVisible,
    setRunPanelVisible: storeSetRunPanelVisible,
    runWorkflow,
    selectedNodeId,
    setSelectedNodeId,
    setSelectedEdgeId,
    cancelPendingEdge,
    pendingEdgeSource
  } = useAgentFlow()

  const [activeTab, setActiveTab] = useState<DrawerType>('saved')
  const [drawerVisible, setDrawerVisible] = useState(true)
  const [inspectorVisible, setInspectorVisible] = useState(() => window.innerWidth >= 960)
  const [panelsSwapped, setPanelsSwapped] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  useEffect(() => {
    if (selectedNodeId) {
      setInspectorVisible(true)
    }
  }, [selectedNodeId])

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 960) {
        setInspectorVisible(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const toggleDrawer = useCallback(() => {
    setDrawerVisible(v => !v)
  }, [])

  const toggleInspector = useCallback(() => {
    setInspectorVisible(v => !v)
  }, [])

  const togglePanelsSwapped = useCallback(() => {
    setPanelsSwapped(v => !v)
  }, [])

  const toggleRunPanel = useCallback(() => {
    storeSetRunPanelVisible(!storeRunPanelVisible)
  }, [storeRunPanelVisible, storeSetRunPanelVisible])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        void runWorkflow()
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        storeSetRunPanelVisible(false)
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault()
        toggleInspector()
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault()
        toggleRunPanel()
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleDrawer()
      }

      if (e.key === 'Escape') {
        if (pendingEdgeSource) {
          cancelPendingEdge()
        } else {
          setSelectedNodeId('')
          setSelectedEdgeId('')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    runWorkflow,
    storeSetRunPanelVisible,
    toggleInspector,
    toggleRunPanel,
    toggleDrawer,
    pendingEdgeSource,
    cancelPendingEdge,
    setSelectedNodeId,
    setSelectedEdgeId
  ])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.types.includes('application/karna-workflow-node')) {
      setIsDraggingOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDraggingOver(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback(() => {
    setIsDraggingOver(false)
  }, [])

  const { hasUnsavedChanges } = useAgentFlow()

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  const leftPanel = drawerVisible ? (
    <ResourceDrawer
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  ) : null

  const rightPanel = inspectorVisible ? (
    <div className="relative z-[15] flex h-full shrink-0 flex-col">
      <FlowInspector
        onClose={() => setInspectorVisible(false)}
      />
    </div>
  ) : null

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <AgentFlowTopBar
        drawerVisible={drawerVisible}
        inspectorVisible={inspectorVisible}
        runPanelVisible={storeRunPanelVisible}
        onToggleDrawer={toggleDrawer}
        onToggleInspector={toggleInspector}
        onToggleRunPanel={toggleRunPanel}
        onSwapPanels={togglePanelsSwapped}
        panelsSwapped={panelsSwapped}
      />

      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        {panelsSwapped ? (
          <>
            {rightPanel}
            <div
              className={cn(
                'relative min-h-0 min-w-0 flex-1 overflow-hidden transition-all duration-200',
                isDraggingOver && 'ring-2 ring-inset ring-blue-500/50 bg-blue-500/5'
              )}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <FlowCanvas />
              {isDraggingOver && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-blue-500/10 backdrop-blur-sm z-30">
                  <div className="rounded-xl border-2 border-dashed border-blue-500/50 bg-white/80 dark:bg-slate-900/80 px-8 py-4 text-blue-600 dark:text-blue-400 font-medium">
                    放置节点到画布
                  </div>
                </div>
              )}
            </div>
            {leftPanel}
          </>
        ) : (
          <>
            {leftPanel}
            <div
              className={cn(
                'relative min-h-0 min-w-0 flex-1 overflow-hidden transition-all duration-200',
                isDraggingOver && 'ring-2 ring-inset ring-blue-500/50 bg-blue-500/5'
              )}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <FlowCanvas />
              {isDraggingOver && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-blue-500/10 backdrop-blur-sm z-30">
                  <div className="rounded-xl border-2 border-dashed border-blue-500/50 bg-white/80 dark:bg-slate-900/80 px-8 py-4 text-blue-600 dark:text-blue-400 font-medium">
                    放置节点到画布
                  </div>
                </div>
              )}
            </div>
            {rightPanel}
          </>
        )}
      </div>

      {storeRunPanelVisible && (
        <div className="relative z-[15] h-[320px] shrink-0">
          <FlowRunPanel
            onClose={() => storeSetRunPanelVisible(false)}
          />
        </div>
      )}
    </div>
  )
}

export function AgentFlowWorkshopPage() {
  return (
    <div className="h-full w-full overflow-hidden">
      <AgentFlowProvider>
        <AgentFlowContent />
      </AgentFlowProvider>
    </div>
  )
}

export default AgentFlowWorkshopPage
