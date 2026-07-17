import { ComposerPrimitive } from '@assistant-ui/react'
import { useStore } from '@nanostores/react'
import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import { composerFill, composerSurfaceGlass } from '@/components/chat/composer-dock'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useI18n } from '@/i18n'
import { chatMessageText } from '@/lib/chat-messages'
import { DATA_IMAGE_URL_RE } from '@/lib/embedded-images'
import { triggerHaptic } from '@/lib/haptics'
import { ChevronDown, Cpu, Palette, Search, Users, Wrench, X } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { $composerAttachments } from '@/store/composer'
import { browseBackward, browseForward, deriveUserHistory, isBrowsingHistory } from '@/store/composer-input-history'
import { POPOUT_WIDTH_REM } from '@/store/composer-popout'
import { removeQueuedPrompt } from '@/store/composer-queue'
import { $karnaPermissionLevel, setKarnaPermissionLevelStore } from '@/store/karna-permission'
import { $draftConversationScope, $draftPermissionMode, $scopeLocked, setDraftConversationScope, setDraftPermissionMode } from '@/store/conversation-scope'
import { notifyError } from '@/store/notifications'
import { $activeSessionAwaitingInput } from '@/store/prompts'
import { $projects } from '@/store/projects'
import { toggleReview } from '@/store/review'
import { $gatewayState, $messages } from '@/store/session'
import { $threadScrolledUp } from '@/store/thread-scroll'
import { useTheme } from '@/themes'
import type { ResolvedWorkflowContext } from '@/types/karna'
import { BUILT_IN_MCPS } from '@/app/karna-workshop/built-in-mcps'

import { AttachmentList } from './attachments'
import {
  COMPOSER_FADE_BACKGROUND,
  type QueueEditState,
  slashArgStage
} from './composer-utils'
import { ContextMenu } from './context-menu'
import { ComposerControls } from './controls'
import { COMPOSER_DROP_ACTIVE_CLASS, COMPOSER_DROP_FADE_CLASS } from './drop-affordance'
import { markActiveComposer } from './focus'
import { HelpHint } from './help-hint'
import { useAtCompletions } from './hooks/use-at-completions'
import { useAttachmentIngest } from '@/hooks/use-attachment-ingest'
import { isAutoParseType } from '@/lib/ingest-api'
import { useComposerBranch } from './hooks/use-composer-branch'
import { useComposerDraft } from './hooks/use-composer-draft'
import { useComposerDrop } from './hooks/use-composer-drop'
import { useComposerEscCancel } from './hooks/use-composer-esc-cancel'
import { useComposerMetrics } from './hooks/use-composer-metrics'
import { useComposerPlaceholder } from './hooks/use-composer-placeholder'
import { useComposerPopout } from './hooks/use-composer-popout'
import { useComposerQueue } from './hooks/use-composer-queue'
import { useComposerSubmit } from './hooks/use-composer-submit'
import { useComposerTrigger } from './hooks/use-composer-trigger'
import { useComposerUrlDialog } from './hooks/use-composer-url-dialog'
import { useComposerVoice } from './hooks/use-composer-voice'
import { useSlashCompletions } from './hooks/use-slash-completions'
import { useSessionStatusPresence } from './hooks/use-status-presence'
import { QueuePanel } from './queue-panel'
import {
  composerPlainText,
  deleteChipBeforeCaret,
  deleteSelectionInEditor,
  insertPlainTextAtCaret,
  normalizeComposerEditorDom,
  RICH_INPUT_SLOT
} from './rich-editor'
import { ComposerStatusStack } from './status-stack'
import { CodingStatusRow } from './status-stack/coding-row'
import { extractClipboardImageBlobs } from './text-utils'
import { ComposerTriggerPopover } from './trigger-popover'
import type { ChatBarProps } from './types'
import { UrlDialog } from './url-dialog'
import { VoiceActivity, VoicePlaybackActivity } from './voice-activity'

interface KarnaComposerResourceRow {
  id: string
  name: string
  enabled?: boolean
  tools?: string[]
  icon?: string
  iconImage?: string
  bgColor?: string
  textColor?: string
  connected?: boolean
  isConnector?: boolean
  isBuiltIn?: boolean
  isInstance?: boolean
}

interface KarnaComposerWorkflowRow {
  id: string
  name: string
}

export function ChatBar({
  busy,
  cwd,
  disabled,
  focusKey,
  gateway,
  maxRecordingSeconds = 120,
  queueSessionKey,
  sessionId,
  state,
  onCancel,
  onAddUrl,
  onAttachDroppedItems,
  onAttachImageBlob,
  onPasteClipboardImage,
  onPickFiles,
  onPickFolders,
  onPickImages,
  onRemoveAttachment,
  onSteer,
  onSubmit,
  onTranscribeAudio
}: ChatBarProps) {
  const attachments = useStore($composerAttachments)
  const scrolledUp = useStore($threadScrolledUp)
  const awaitingInput = useStore($activeSessionAwaitingInput)
  const activeQueueSessionKey = queueSessionKey || sessionId || null

  const statusSessionId = sessionId ?? null

  const statusPresent = useSessionStatusPresence(statusSessionId)

  const composerRef = useRef<HTMLFormElement | null>(null)
  const composerSurfaceRef = useRef<HTMLDivElement | null>(null)

  const {
    dockProximity,
    dragging,
    handleComposerToggle,
    onComposerGesturePointerDown,
    popoutAllowed,
    popoutPosition,
    poppedOut
  } = useComposerPopout({ composerRef })

  const queueEditRef = useRef<QueueEditState | null>(null)
  const composingRef = useRef(false)

  const { availableThemes, themeName } = useTheme()
  const at = useAtCompletions({ gateway: gateway ?? null, sessionId: sessionId ?? null, cwd: cwd ?? null })
  const slash = useSlashCompletions({ activeSkin: themeName, gateway: gateway ?? null, skinThemes: availableThemes })

  const { t } = useI18n()
  const { parseAttachment } = useAttachmentIngest()
  const autoParseStartedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    for (const att of attachments) {
      if (
        att.path &&
        isAutoParseType(att.path) &&
        !att.parseState &&
        !autoParseStartedRef.current.has(att.id)
      ) {
        autoParseStartedRef.current.add(att.id)
        void parseAttachment(att)
      }
    }
  }, [attachments, parseAttachment])

  const [karnaMode, setKarnaMode] = useState<'direct' | 'plan' | 'goal' | 'living_work'>('direct')
  const [karnaResourcesLoading, setKarnaResourcesLoading] = useState(false)
  const [karnaEnhancing, setKarnaEnhancing] = useState(false)
  const [karnaEnhanced, setKarnaEnhanced] = useState(false)
  const [karnaOriginalText, setKarnaOriginalText] = useState('')
  const [karnaEnhancedText, setKarnaEnhancedText] = useState('')
  const [karnaSouls, setKarnaSouls] = useState<string[]>([])
  const storePermissionLevel = useStore($karnaPermissionLevel)
  const draftPermissionMode = useStore($draftPermissionMode)
  const [karnaPermissionLevel, setKarnaPermissionLevelState] = useState<'restricted' | 'computer' | 'dangerous'>(draftPermissionMode)
  const draftConversationScope = useStore($draftConversationScope)
  const scopeLocked = useStore($scopeLocked)
  const projects = useStore($projects)

  const setKarnaPermissionLevel = (level: 'restricted' | 'computer' | 'dangerous') => {
    setKarnaPermissionLevelState(level)
    setKarnaPermissionLevelStore(level)
    setDraftPermissionMode(level)
  }

  useEffect(() => {
    if (storePermissionLevel !== karnaPermissionLevel) {
      setKarnaPermissionLevelState(storePermissionLevel)
      setDraftPermissionMode(storePermissionLevel)
    }
  }, [storePermissionLevel, karnaPermissionLevel])

  useEffect(() => {
    if (draftPermissionMode !== karnaPermissionLevel) {
      setKarnaPermissionLevelState(draftPermissionMode)
      setKarnaPermissionLevelStore(draftPermissionMode)
    }
  }, [draftPermissionMode])
  const [skillPopoverSearch, setSkillPopoverSearch] = useState('')
  const [mcpPopoverSearch, setMcpPopoverSearch] = useState('')
  const [soulPopoverSearch, setSoulPopoverSearch] = useState('')
  const [composerHeight, setComposerHeight] = useState<number | null>(130)
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const [karnaResources, setKarnaResources] = useState<{
    knowledge: KarnaComposerResourceRow[]
    mcp: KarnaComposerResourceRow[]
    skills: KarnaComposerResourceRow[]
    souls: { id: string; name: string; slug: string }[]
    workflows: KarnaComposerWorkflowRow[]
  }>({ knowledge: [], mcp: [], skills: [], souls: [], workflows: [] })

  const [selectedKarnaResources, setSelectedKarnaResources] = useState<{
    knowledge: string[]
    mcp: string[]
    skills: string[]
  }>({ knowledge: [], mcp: [], skills: [] })

  const [selectedKarnaWorkflowId, setSelectedKarnaWorkflowId] = useState('')
  const [resolvedWorkflow, setResolvedWorkflow] = useState<ResolvedWorkflowContext | null>(null)
  const [workflowResolveError, setWorkflowResolveError] = useState<string | null>(null)
  const [workflowResolving, setWorkflowResolving] = useState(false)
  const gatewayState = useStore($gatewayState)
  const reconnecting = gatewayState === 'closed' || gatewayState === 'error'
  const inputDisabled = disabled && !reconnecting

  const {
    activeQueueSessionKeyRef,
    clearDraft,
    draftRef,
    editorRef,
    focusInput,
    hasText,
    insertInlineRefs,
    insertText,
    isHelpHint,
    isSteerableText,
    loadIntoComposer,
    requestMainFocus,
    sessionIdRef,
    setComposerText,
    stashAt
  } = useComposerDraft({ activeQueueSessionKey, focusKey, inputDisabled, queueEditRef, sessionId })

  const { openUrlDialog, setUrlOpen, setUrlValue, submitUrl, urlInputRef, urlOpen, urlValue } = useComposerUrlDialog({
    insertText,
    onAddUrl
  })

  const {
    beginQueuedEdit,
    drainNextQueued,
    editingQueuedPrompt,
    exitQueuedEdit,
    queueCurrentDraft,
    queueEdit,
    queuedPrompts,
    sendQueuedNow,
    stepQueuedEdit
  } = useComposerQueue({
    activeQueueSessionKey,
    attachments,
    busy,
    clearDraft,
    draftRef,
    focusInput,
    loadIntoComposer,
    onCancel,
    onSubmit,
    queueEditRef,
    queueSessionKey,
    sessionId
  })

  const statusStackVisible = queuedPrompts.length > 0 || statusPresent

  const { stacked } = useComposerMetrics({ composerRef, composerSurfaceRef, editorRef, poppedOut })
  const hasComposerPayload = hasText || attachments.length > 0
  const modelConfigured = Boolean(state.model?.provider && state.model?.model)
  const canSubmit = busy || (hasComposerPayload && modelConfigured)
  const busyAction = busy && hasComposerPayload ? 'queue' : 'stop'

  const canSteer = busy && !!onSteer && attachments.length === 0 && isSteerableText

  const showHelpHint = isHelpHint

  const toggleKarnaSoul = (name: string) => {
    setKarnaSouls(current =>
      current.includes(name) ? current.filter(s => s !== name) : [...current, name]
    )
  }

  const selectKarnaWorkflow = async (id: string) => {
    setSelectedKarnaWorkflowId(id)
    setResolvedWorkflow(null)
    setWorkflowResolveError(null)

    if (id) {
      setKarnaSouls([])
      setWorkflowResolving(true)
      try {
        const result = await window.karnaDesktop.api<{
          ok?: boolean
          binding?: ResolvedWorkflowContext['binding']
          workflow?: ResolvedWorkflowContext['workflow']
          agents?: ResolvedWorkflowContext['agents']
          executionPlan?: ResolvedWorkflowContext['executionPlan']
          error?: string
          code?: string
        }>({
          body: {
            workflow_id: id,
            workspace_id: null,
            session_id: sessionId || null
          },
          method: 'POST',
          path: '/api/writer/workflows/resolve'
        })

        if (result.error) {
          setWorkflowResolveError(result.error)
          setSelectedKarnaWorkflowId('')
          notifyError('工作流加载失败', result.error)
        } else if (result.ok && result.workflow && result.binding) {
          setResolvedWorkflow({
            binding: result.binding,
            workflow: result.workflow,
            agents: result.agents || [],
            executionPlan: result.executionPlan || { workflowId: id, steps: [] }
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setWorkflowResolveError(message)
        setSelectedKarnaWorkflowId('')
        notifyError('工作流加载失败', message)
      } finally {
        setWorkflowResolving(false)
      }
    }
  }

  const loadKarnaResources = async () => {
    setKarnaResourcesLoading(true)

    try {
      const [resources, workflows, souls, connectorsResult, skillsResult] = await Promise.all([
        window.karnaDesktop
          .api<{
            knowledge?: KarnaComposerResourceRow[]
            mcp?: KarnaComposerResourceRow[]
            skills?: KarnaComposerResourceRow[]
          }>({ path: '/api/writer/resources' })
          .catch(
            () =>
              ({}) as {
                knowledge?: KarnaComposerResourceRow[]
                mcp?: KarnaComposerResourceRow[]
                skills?: KarnaComposerResourceRow[]
              }
          ),
        window.karnaDesktop
          .api<{ workflows?: KarnaComposerWorkflowRow[] }>({ path: '/api/writer/workflows' })
          .catch(() => ({ workflows: [] })),
        window.karnaDesktop
          .api<{ authors?: { id: string; name: string; slug: string }[]; ok?: boolean }>({ path: '/api/soul/authors' })
          .catch(() => ({ authors: [] })),
        window.karnaDesktop
          .api<{ items?: Array<{ id: string; name: string; displayName: string; description: string; icon?: string; toolsPreview?: Array<{ name: string }> }> }>({ path: '/api/connectors/definitions' })
          .catch(() => ({ items: [] })),
        window.karnaDesktop
          .api<Array<{ id?: string; name: string; category: string; description: string; enabled: boolean; displayName?: string; displayDescription?: string; displayCategory?: string; isKarnaOfficial?: boolean; source?: string }>>({ path: '/api/skills' })
          .catch(() => [])
      ])

      const connectorInstances = await window.karnaDesktop
        .api<{ items?: Array<{ id: string; connectorId: string; displayName: string; connectionStatus: string; discoveredTools?: Array<{ name: string; enabled?: boolean }>; definition?: { id: string; displayName: string; name: string; icon?: string; toolsPreview?: Array<{ name: string }>; customDefinition?: boolean } }> }>({ path: '/api/connectors/instances' })
        .catch(() => ({ items: [] }))

      const instanceList: KarnaComposerResourceRow[] = (connectorInstances.items || [])
        .filter(inst => inst.id)
        .map(inst => {
          const def = inst.definition
          const tools = (inst.discoveredTools || []).filter(t => t.enabled !== false).map(t => t.name)
          const isConnected = inst.connectionStatus === 'connected'
          return {
            id: inst.id,
            name: inst.displayName || def?.displayName || def?.name || inst.connectorId,
            icon: def?.icon,
            connected: isConnected,
            isConnector: true,
            enabled: isConnected,
            tools: tools.length > 0 ? tools : (def?.toolsPreview || []).map(t => t.name),
            isInstance: true
          }
        })

      const connectedConnectorIds = new Set((connectorInstances.items || []).filter(i => i.connectionStatus === 'connected').map(i => i.connectorId))
      const seenConnectorIds = new Set((connectorInstances.items || []).map(i => i.connectorId))

      const connectorDefList: KarnaComposerResourceRow[] = (connectorsResult.items || [])
        .filter(def => def.id && !seenConnectorIds.has(def.id))
        .map(def => ({
          id: def.id,
          name: def.displayName || def.name,
          icon: def.icon,
          connected: connectedConnectorIds.has(def.id),
          isConnector: true,
          enabled: connectedConnectorIds.has(def.id),
          tools: (def.toolsPreview || []).map(t => t.name)
        }))

      const seenIds = new Set([...instanceList.map(c => c.id), ...connectorDefList.map(c => c.id)])
      const builtInMcpList = BUILT_IN_MCPS
        .filter(mcp => !seenIds.has(`builtin_${mcp.id}`))
        .map(mcp => ({
          id: `builtin_${mcp.id}`,
          name: mcp.displayName,
          icon: mcp.icon,
          iconImage: mcp.iconImage,
          bgColor: mcp.bgColor,
          textColor: mcp.textColor,
          connected: false,
          isConnector: true,
          isBuiltIn: true,
          enabled: false,
          tools: mcp.toolsPreview.map(t => t.name)
        }))

      const mcpServers = (resources.mcp || []).map(s => ({ ...s, connected: s.enabled !== false, isConnector: false }))
      const allMcp = [...instanceList, ...builtInMcpList, ...connectorDefList, ...mcpServers]

      const skillsFromApi: KarnaComposerResourceRow[] = (skillsResult || [])
        .filter(s => s.name)
        .map(s => ({
          id: s.id || s.name,
          name: s.name,
          enabled: s.enabled,
          icon: s.category || 'skill',
        }))

      const seenSkillNames = new Set(skillsFromApi.map(s => s.name))
      const extraSkills = (resources.skills || []).filter(s => !seenSkillNames.has(s.name))
      const allSkills = [...skillsFromApi, ...extraSkills]

      setKarnaResources({
        knowledge: resources.knowledge || [],
        mcp: allMcp,
        skills: allSkills,
        souls: (souls.authors || []).slice(0, 50),
        workflows: workflows.workflows || []
      })
    } catch (error) {
      notifyError('Karna 资源加载失败', error instanceof Error ? error.message : String(error))
    } finally {
      setKarnaResourcesLoading(false)
    }
  }

  useEffect(() => {
    void loadKarnaResources()
  }, [])

  const toggleKarnaResource = (kind: 'knowledge' | 'mcp' | 'skills', name: string) => {
    setSelectedKarnaResources(current => {
      const values = current[kind]

      return {
        ...current,
        [kind]: values.includes(name) ? values.filter(item => item !== name) : [...values, name]
      }
    })
  }

  const formatKarnaModePrompt = (text: string) => {
    const trimmed = text.trim()

    const hasExtras =
      selectedKarnaWorkflowId ||
      karnaSouls.length ||
      selectedKarnaResources.skills.length ||
      selectedKarnaResources.mcp.length

    if (!trimmed && !hasExtras) {return text}
    const parts: string[] = []

    if (selectedKarnaResources.skills.length || selectedKarnaResources.mcp.length) {
      parts.push(`可用资源：技能=${selectedKarnaResources.skills.join('、') || '无'}；MCP/工具=${selectedKarnaResources.mcp.join('、') || '无'}`)
    }

    if (resolvedWorkflow) {
      const { workflow, agents, executionPlan } = resolvedWorkflow
      const agentDescriptions = agents.map(a => `- ${a.name}（${a.role}）：${a.duties || a.tagline || ''}`).join('\n')
      const steps = executionPlan.steps?.map((s, i) => `${i + 1}. 节点 ${s.nodeId}${s.agentId ? `（Agent: ${agents.find(a => a.id === s.agentId)?.name || s.agentId}）` : ''}`).join('\n') || ''
      parts.push(
        `绑定工作流：${workflow.name}（版本：${workflow.version}，来源：${resolvedWorkflow.binding.source === 'global' ? '全局' : '项目'}）\n` +
        `工作流描述：${workflow.description || '无'}\n` +
        `工作流包含的Agent：\n${agentDescriptions || '无'}\n` +
        `执行计划步骤：\n${steps || '无'}\n` +
        `请严格按照此工作流的节点定义、Agent职责分工和执行顺序来推进任务，不要随意改变流程。`
      )
    } else if (selectedKarnaWorkflowId) {
      const workflow = karnaResources.workflows.find(w => w.id === selectedKarnaWorkflowId)
      parts.push(`工作流模板：${workflow?.name || selectedKarnaWorkflowId}（正在加载工作流详情...）`)
    }

    if (karnaSouls.length && !selectedKarnaWorkflowId) {parts.push(`Soul / 人格设定：${karnaSouls.join('、')}`)}

    const extrasBlock = parts.filter(Boolean).map(p => `- ${p}`).join('\n')
    const extras = extrasBlock ? `\n${extrasBlock}\n` : ''

    if (!trimmed) {return extras.trim()}

    return extras ? `${text}\n\n执行要求：\n${extras}` : text
  }

  const enhanceKarnaPrompt = async () => {
    if (karnaEnhanced && karnaOriginalText) {
      draftRef.current = karnaOriginalText
      setComposerText(karnaOriginalText)

      if (editorRef.current) {editorRef.current.textContent = karnaOriginalText}
      setKarnaEnhanced(false)
      setKarnaOriginalText('')
      setKarnaEnhancedText('')
      focusInput()

      return
    }

    const text = draftRef.current.trim()

    if (!text) {return}
    setKarnaEnhancing(true)

    try {
      const result = await window.karnaDesktop.api<{ ok?: boolean; text?: string; error?: string }>({
        body: {
          cwd: cwd || null,
          mcp: selectedKarnaResources.mcp,
          model: state.model?.model || '',
          mode: karnaMode === 'direct' ? 'chat' : karnaMode,
          permission: karnaPermissionLevel,
          provider: state.model?.provider || '',
          skills: selectedKarnaResources.skills,
          soul: karnaSouls.join('、'),
          text,
          workflow: selectedKarnaWorkflowId
        },
        method: 'POST',
        path: '/api/prompt/enhance'
      })

      if (result.error) {throw new Error(result.error)}

      if (result.text && result.text !== text) {
        setKarnaOriginalText(text)
        setKarnaEnhancedText(result.text)
        setKarnaEnhanced(true)
        draftRef.current = result.text
        setComposerText(result.text)

        if (editorRef.current) {editorRef.current.textContent = result.text}
        focusInput()
      }
    } catch (error) {
      notifyError('提示词增强失败', error instanceof Error ? error.message : String(error))
    } finally {
      setKarnaEnhancing(false)
    }
  }

  const handleResizePointerDown = (e: ReactPointerEvent) => {
    e.preventDefault()
    const editorEl = editorRef.current

    if (!editorEl) {return}
    resizeRef.current = {
      startY: e.clientY,
      startHeight: editorEl.offsetHeight
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handleResizePointerMove = (e: ReactPointerEvent) => {
    if (!resizeRef.current) {return}
    const delta = resizeRef.current.startY - e.clientY
    const newHeight = Math.max(80, Math.min(600, resizeRef.current.startHeight + delta))
    setComposerHeight(newHeight)
  }

  const handleResizePointerUp = () => {
    resizeRef.current = null
  }

  const filteredSkillsList = useMemo(() => {
    if (!skillPopoverSearch) {return karnaResources.skills}
    const q = skillPopoverSearch.toLowerCase()

    return karnaResources.skills.filter(s => s.name.toLowerCase().includes(q))
  }, [karnaResources.skills, skillPopoverSearch])

  const filteredMcpList = useMemo(() => {
    if (!mcpPopoverSearch) {return karnaResources.mcp}
    const q = mcpPopoverSearch.toLowerCase()

    return karnaResources.mcp.filter(m => m.name.toLowerCase().includes(q))
  }, [karnaResources.mcp, mcpPopoverSearch])

  const filteredSoulsList = useMemo(() => {
    if (!soulPopoverSearch) {return karnaResources.souls}
    const q = soulPopoverSearch.toLowerCase()

    return karnaResources.souls.filter(s => s.name.toLowerCase().includes(q))
  }, [karnaResources.souls, soulPopoverSearch])

  const selectedWorkflow = karnaResources.workflows.find(w => w.id === selectedKarnaWorkflowId)

  const TOOLBAR_BTN = 'flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors data-[state=open]:bg-accent/60 data-[state=open]:text-foreground disabled:opacity-50 disabled:pointer-events-none'

  const { steerDraft, submitDraft } = useComposerSubmit({
    activeQueueSessionKey,
    activeQueueSessionKeyRef,
    attachments,
    busy,
    canSteer,
    clearDraft,
    disabled: disabled || workflowResolving || !!workflowResolveError || (!!selectedKarnaWorkflowId && !resolvedWorkflow),
    draftRef,
    drainNextQueued,
    editorRef,
    exitQueuedEdit,
    focusInput,
    inputDisabled: inputDisabled || workflowResolving || !!workflowResolveError || (!!selectedKarnaWorkflowId && !resolvedWorkflow),
    loadIntoComposer,
    onCancel,
    onSteer,
    onSubmit: (value, options) => {
      if (!modelConfigured) {
        notifyError('尚未配置模型', '请先在设置中选择模型服务、完成授权并通过连接测试。Karna 不会自动使用电脑上的 API Key 或 Copilot 登录。')
        return false
      }
      if (workflowResolveError) {
        notifyError('工作流错误', workflowResolveError)
        return false
      }
      if (workflowResolving) {
        notifyError('请稍候', '工作流正在加载中，请稍候再发送')
        return false
      }
      if (selectedKarnaWorkflowId && !resolvedWorkflow) {
        notifyError('请稍候', '工作流尚未加载完成，请稍候再发送')
        return false
      }
      return onSubmit(formatKarnaModePrompt(value), options)
    },
    queueCurrentDraft,
    queueEdit,
    queuedPrompts,
    sessionId,
    setComposerText,
    stashAt
  })

  const placeholder = useComposerPlaceholder({ disabled, reconnecting, sessionId })

  const {
    argStageEmpty,
    closeTrigger,
    commitTypedSlashDirective,
    refreshTrigger,
    replaceTriggerWithChip,
    setTriggerActive,
    trigger,
    triggerActive,
    triggerItems,
    triggerKeyConsumedRef,
    triggerLoading
  } = useComposerTrigger({ at, draftRef, editorRef, requestMainFocus, setComposerText, slash })

  const flushRafRef = useRef<number | undefined>(undefined)

  const flushEditorToDraft = (editor: HTMLDivElement) => {
    if (flushRafRef.current !== undefined) {
      window.cancelAnimationFrame(flushRafRef.current)
      flushRafRef.current = undefined
    }

    normalizeComposerEditorDom(editor)

    const nextDraft = composerPlainText(editor)

    if (nextDraft !== draftRef.current) {
      draftRef.current = nextDraft
      setComposerText(nextDraft)
    }

    window.setTimeout(refreshTrigger, 0)
  }

  const scheduleFlushEditorToDraft = (editor: HTMLDivElement) => {
    if (flushRafRef.current !== undefined) {
      return
    }

    flushRafRef.current = window.requestAnimationFrame(() => {
      flushRafRef.current = undefined
      flushEditorToDraft(editor)
    })
  }

  useEffect(
    () => () => {
      if (flushRafRef.current !== undefined) {
        window.cancelAnimationFrame(flushRafRef.current)
      }
    },
    []
  )

  const handleEditorInput = (event: FormEvent<HTMLDivElement>) => {
    if (composingRef.current) {
      return
    }

    if (karnaEnhanced && karnaEnhancedText) {
      const text = event.currentTarget.textContent || ''

      if (text !== karnaEnhancedText) {
        setKarnaEnhanced(false)
        setKarnaOriginalText('')
        setKarnaEnhancedText('')
      }
    }

    scheduleFlushEditorToDraft(event.currentTarget)
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const imageBlobs = extractClipboardImageBlobs(event.clipboardData)

    if (imageBlobs.length > 0) {
      event.preventDefault()

      if (onAttachImageBlob) {
        triggerHaptic('selection')

        for (const blob of imageBlobs) {
          void onAttachImageBlob(blob)
        }
      }

      return
    }

    const pastedText = event.clipboardData.getData('text').trim()

    if (!pastedText) {
      event.preventDefault()

      if (onPasteClipboardImage) {
        triggerHaptic('selection')
        void onPasteClipboardImage({ silent: true })
      }

      return
    }

    if (DATA_IMAGE_URL_RE.test(pastedText)) {
      event.preventDefault()

      return
    }

    event.preventDefault()
    insertPlainTextAtCaret(event.currentTarget, pastedText)
    scheduleFlushEditorToDraft(event.currentTarget)
  }

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (composingRef.current || event.nativeEvent.isComposing) {
      return
    }

    if (
      event.key === 'Backspace' &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      deleteChipBeforeCaret(event.currentTarget)
    ) {
      event.preventDefault()
      flushEditorToDraft(event.currentTarget)

      return
    }

    if ((event.key === 'Backspace' || event.key === 'Delete') && deleteSelectionInEditor(event.currentTarget)) {
      event.preventDefault()
      flushEditorToDraft(event.currentTarget)

      return
    }

    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.shiftKey && event.key.toLowerCase() === 'k') {
      event.preventDefault()

      if (!busy) {
        void drainNextQueued()
      }

      return
    }

    if (trigger && triggerItems.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        triggerKeyConsumedRef.current = true
        setTriggerActive(idx => (idx + 1) % triggerItems.length)

        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        triggerKeyConsumedRef.current = true
        setTriggerActive(idx => (idx - 1 + triggerItems.length) % triggerItems.length)

        return
      }

      const acceptOnSpace = event.key === ' ' && trigger.kind === '/' && Boolean(trigger.query.trim())
      const accept = event.key === 'Enter' || event.key === 'Tab' || acceptOnSpace

      if (accept) {
        event.preventDefault()
        triggerKeyConsumedRef.current = true
        const item = triggerItems[triggerActive]

        if (item) {
          replaceTriggerWithChip(item)
        }

        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        triggerKeyConsumedRef.current = true
        closeTrigger()

        return
      }
    }

    if (
      trigger?.kind === '/' &&
      !triggerItems.length &&
      (event.key === ' ' || event.key === 'Tab') &&
      slashArgStage(trigger.query) &&
      trigger.query.trim()
    ) {
      event.preventDefault()
      triggerKeyConsumedRef.current = true
      commitTypedSlashDirective()

      return
    }

    if (event.key === 'ArrowUp') {
      const currentDraft = draftRef.current

      if (queueEdit && stepQueuedEdit(-1)) {
        event.preventDefault()
        triggerKeyConsumedRef.current = true

        return
      }

      if (!currentDraft.trim() && !queueEdit && queuedPrompts.length > 0) {
        event.preventDefault()
        triggerKeyConsumedRef.current = true
        beginQueuedEdit(queuedPrompts[queuedPrompts.length - 1]!)

        return
      }

      if (currentDraft.trim() && !isBrowsingHistory(sessionId)) {
        return
      }

      event.preventDefault()
      triggerKeyConsumedRef.current = true

      const history = deriveUserHistory($messages.get(), chatMessageText)
      const entry = browseBackward(sessionId, currentDraft, history)

      if (entry !== null) {
        loadIntoComposer(entry, $composerAttachments.get())
      }

      return
    }

    if (event.key === 'ArrowDown') {
      if (queueEdit) {
        event.preventDefault()
        triggerKeyConsumedRef.current = true
        stepQueuedEdit(1)

        return
      }

      if (isBrowsingHistory(sessionId)) {
        event.preventDefault()
        triggerKeyConsumedRef.current = true

        const history = deriveUserHistory($messages.get(), chatMessageText)
        const result = browseForward(sessionId, history)

        if (result !== null) {
          loadIntoComposer(result.text, $composerAttachments.get())
        }
      }

      return
    }

    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
      event.preventDefault()

      if (canSteer) {
        steerDraft()
      }

      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()

      const editorText = editorRef.current ? composerPlainText(editorRef.current) : draftRef.current
      const hasLivePayload = editorText.trim().length > 0 || attachments.length > 0

      if (disabled) {
        return
      }

      if (!busy && !hasLivePayload && queuedPrompts.length > 0) {
        void drainNextQueued()

        return
      }

      if (busy && !hasLivePayload) {
        return
      }

      submitDraft()

      return
    }

    if (event.key === 'Escape') {
      if (queueEdit) {
        event.preventDefault()
        exitQueuedEdit('cancel')

        return
      }

      if (busy && !awaitingInput) {
        event.preventDefault()
        triggerHaptic('cancel')
        void Promise.resolve(onCancel())
      }
    }
  }

  const handleEditorKeyUp = () => {
    if (triggerKeyConsumedRef.current) {
      triggerKeyConsumedRef.current = false

      return
    }

    window.setTimeout(refreshTrigger, 0)
  }

  const {
    dragActive,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleInputDragOver,
    handleInputDrop
  } = useComposerDrop({ cwd, insertInlineRefs, onAttachDroppedItems, requestMainFocus })

  const { handleBranchOff, handleConvertBranch, handleListBranches, handleSwitchBranch, openInWorktree } =
    useComposerBranch({ clearDraft, cwd, draftRef })

  useComposerEscCancel({ awaitingInput, busy, onCancel })

  const {
    conversation,
    dictate,
    endConversation,
    startConversation,
    voiceActivityState,
    voiceConversationActive,
    voiceStatus
  } = useComposerVoice({
    busy,
    clearDraft,
    disabled,
    focusInput,
    insertText,
    maxRecordingSeconds,
    onSubmit,
    onTranscribeAudio,
    sessionId
  })

  const contextMenu = (
    <ContextMenu
      karnaMode={karnaMode}
      onInsertText={insertText}
      onOpenUrlDialog={openUrlDialog}
      onPasteClipboardImage={onPasteClipboardImage}
      onPickFiles={onPickFiles}
      onPickFolders={onPickFolders}
      onPickImages={onPickImages}
      onSetMode={setKarnaMode}
      state={state}
    />
  )

  const controls = (
    <ComposerControls
      busy={busy}
      busyAction={busyAction}
      canSteer={canSteer}
      canSubmit={canSubmit}
      compactModelPill={poppedOut}
      conversation={{
        active: voiceConversationActive,
        level: conversation.level,
        muted: conversation.muted,
        onEnd: endConversation,
        onStart: startConversation,
        onStopTurn: conversation.stopTurn,
        onToggleMute: conversation.toggleMute,
        status: conversation.status
      }}
      disabled={disabled}
      enhanced={karnaEnhanced}
      enhancing={karnaEnhancing}
      hasComposerPayload={hasComposerPayload}
      onDictate={dictate}
      onEnhance={() => void enhanceKarnaPrompt()}
      onSteer={steerDraft}
      state={state}
      voiceStatus={voiceStatus}
    />
  )

  const input = (
    <div className="relative w-full">
      <div
        aria-disabled={inputDisabled ? true : undefined}
        aria-label={t.composer.message}
        autoCapitalize="off"
        autoCorrect="off"
        className={cn(
          'min-h-(--composer-input-min-height) max-h-(--composer-input-max-height) cursor-text overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] bg-transparent pb-1 pl-1 pr-1 pt-1 leading-normal text-foreground outline-none disabled:cursor-not-allowed',
          'empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/60',
          '**:data-ref-text:cursor-default',
          stacked && 'pl-3'
        )}
        contentEditable={!inputDisabled}
        data-placeholder={placeholder}
        data-slot={RICH_INPUT_SLOT}
        onBlur={() => window.setTimeout(closeTrigger, 80)}
        onCompositionEnd={event => {
          composingRef.current = false
          flushEditorToDraft(event.currentTarget)
        }}
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onDragOver={handleInputDragOver}
        onDrop={handleInputDrop}
        onFocus={() => markActiveComposer('main')}
        onInput={handleEditorInput}
        onKeyDown={handleEditorKeyDown}
        onKeyUp={handleEditorKeyUp}
        onMouseUp={refreshTrigger}
        onPaste={handlePaste}
        ref={editorRef}
        role="textbox"
        spellCheck={false}
        style={composerHeight ? { minHeight: `${composerHeight}px`, maxHeight: `${composerHeight}px` } : undefined}
        suppressContentEditableWarning
      />
      <ComposerPrimitive.Input asChild submitMode="ctrlEnter" tabIndex={-1} unstable_focusOnScrollToBottom={false}>
        <textarea
          aria-hidden
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="sr-only"
          spellCheck={false}
          tabIndex={-1}
        />
      </ComposerPrimitive.Input>
    </div>
  )

  return (
    <>
      {dragging && poppedOut && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-32"
          style={{
            background:
              'radial-gradient(64% 130% at 50% 100%, color-mix(in srgb, var(--color-primary) 26%, transparent) 0%, transparent 70%)',
            opacity: `calc(${0.1 + dockProximity * 0.57} * var(--dock-glow-scale, 1))`
          }}
        />
      )}
      <ComposerPrimitive.Unstable_TriggerPopoverRoot>
        <ComposerPrimitive.Root
          className={cn(
            'group/composer z-30 overflow-visible rounded-2xl',
            poppedOut
              ? 'fixed w-[var(--composer-popout-width)] max-w-[calc(100vw-1.5rem)] bg-transparent p-[5px]'
              : 'absolute bottom-0 left-1/2 w-[min(var(--composer-width),calc(100%-2rem))] max-w-full -translate-x-1/2 pt-2 pb-[var(--composer-shell-pad-block-end)]',
            dragging && 'cursor-grabbing select-none touch-none'
          )}
          data-drag-active={dragActive ? '' : undefined}
          data-popped-out={poppedOut ? '' : undefined}
          data-slot="composer-root"
          data-status-stack={statusStackVisible ? '' : undefined}
          data-thread-scrolled-up={scrolledUp ? '' : undefined}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onPointerDown={popoutAllowed ? onComposerGesturePointerDown : undefined}
          onSubmit={e => {
            e.preventDefault()

            if (composingRef.current) {
              return
            }

            submitDraft()
          }}
          ref={composerRef}
          style={
            poppedOut
              ? {
                  bottom: `${popoutPosition.bottom}px`,
                  right: `${popoutPosition.right}px`,
                  ['--composer-popout-width' as string]: `${POPOUT_WIDTH_REM}rem`
                }
              : undefined
          }
        >
          {showHelpHint && <HelpHint />}
          {trigger && !argStageEmpty && (
            <ComposerTriggerPopover
              activeIndex={triggerActive}
              items={triggerItems}
              kind={trigger.kind}
              loading={triggerLoading}
              onHover={setTriggerActive}
              onPick={replaceTriggerWithChip}
            />
          )}
          <ComposerStatusStack
            queue={
              activeQueueSessionKey && queuedPrompts.length > 0 ? (
                <QueuePanel
                  busy={busy}
                  editingId={queueEdit?.entryId ?? null}
                  entries={queuedPrompts}
                  onDelete={id => {
                    if (removeQueuedPrompt(activeQueueSessionKey, id) && queueEdit?.entryId === id) {
                      exitQueuedEdit('cancel')
                    }
                  }}
                  onEdit={beginQueuedEdit}
                  onSendNow={id => void sendQueuedNow(id)}
                />
              ) : null
            }
            sessionId={statusSessionId}
          />
          {!poppedOut && (
            <div
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{ background: COMPOSER_FADE_BACKGROUND }}
            />
          )}
          {popoutAllowed && (
            <div
              aria-hidden
              className={cn('pointer-events-auto absolute inset-0', dragging ? 'cursor-grabbing' : 'cursor-grab')}
              data-dragging={dragging ? '' : undefined}
              data-slot="composer-drag-region"
              onDoubleClick={handleComposerToggle}
            />
          )}
          <div className="relative w-full rounded-[inherit]">
            <div
              className={cn(
                'group/composer-surface relative z-4 isolate grid grid-rows-[auto_1fr] overflow-hidden rounded-[inherit] border border-[color-mix(in_srgb,var(--dt-composer-ring)_calc(18%*var(--composer-ring-strength)),var(--dt-input))]',
                COMPOSER_DROP_FADE_CLASS,
                dragActive && COMPOSER_DROP_ACTIVE_CLASS
              )}
              data-slot="composer-surface"
              ref={composerSurfaceRef}
            >
              <div
                className="absolute left-0 right-0 top-0 z-20 flex h-3 cursor-ns-resize items-center justify-center opacity-0 transition-opacity hover:opacity-100"
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerUp}
              >
                <div className="h-1 w-12 rounded-full bg-border/60 transition-colors hover:bg-primary/60" />
              </div>
              <div
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-0 -z-10 rounded-[inherit]',
                  composerFill,
                  composerSurfaceGlass
                )}
              />
              <CodingStatusRow
                onBranchOff={handleBranchOff}
                onConvertBranch={handleConvertBranch}
                onListBranches={handleListBranches}
                onOpen={toggleReview}
                onOpenWorktree={openInWorktree}
                onSwitchBranch={handleSwitchBranch}
              />
              <div
                className={cn(
                  'relative z-1 flex min-h-0 w-full flex-col gap-(--composer-row-gap) overflow-hidden rounded-[inherit] px-(--composer-surface-pad-x) py-(--composer-surface-pad-y) transition-opacity duration-200 ease-out',
                  scrolledUp
                    ? 'opacity-30 group-hover/composer:opacity-100 group-focus-within/composer-surface:opacity-100'
                    : 'opacity-100'
                )}
                data-slot="composer-fade"
              >
                <VoiceActivity state={voiceActivityState} />
                <VoicePlaybackActivity />
                <div className="flex flex-wrap items-center gap-1">
                  {contextMenu}
                  <Popover onOpenChange={open => { if (!open) {setSkillPopoverSearch('')} }}>
                    <PopoverTrigger asChild>
                      <button className={TOOLBAR_BTN} type="button">
                        <Wrench className="size-3.5" />
                        技能
                        <ChevronDown className="size-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 p-0">
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                          <input
                            className="w-full rounded-md border border-border/60 bg-transparent py-1.5 pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-primary/40"
                            onChange={e => setSkillPopoverSearch(e.target.value)}
                            placeholder="搜索技能…"
                            value={skillPopoverSearch}
                          />
                        </div>
                      </div>
                      <div className="max-h-80 overflow-y-auto p-1">
                        {filteredSkillsList.length === 0 && (
                          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                            {karnaResourcesLoading ? '加载中…' : '暂无技能'}
                          </div>
                        )}
                        {filteredSkillsList.map(row => {
                          const selected = selectedKarnaResources.skills.includes(row.name)
                          const disabled = row.enabled === false

                          return (
                            <button
                              className={cn(
                                'flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                                selected
                                  ? 'border border-primary/30 bg-primary/10 text-primary'
                                  : 'hover:bg-accent/40',
                                disabled && !selected && 'opacity-50'
                              )}
                              key={row.id}
                              onClick={() => toggleKarnaResource('skills', row.name)}
                              title={row.tools?.join(', ')}
                              type="button"
                            >
                              <span className="font-mono font-medium">{row.name}</span>
                              {row.tools && row.tools.length > 0 && (
                                <span className="text-[0.65rem] text-muted-foreground">
                                  {row.tools.slice(0, 3).join(', ')}{row.tools.length > 3 ? '…' : ''}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Popover onOpenChange={open => { if (!open) {setMcpPopoverSearch('')} }}>
                    <PopoverTrigger asChild>
                      <button className={TOOLBAR_BTN} type="button">
                        <Cpu className="size-3.5" />
                        MCP
                        <ChevronDown className="size-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 p-0">
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                          <input
                            className="w-full rounded-md border border-border/60 bg-transparent py-1.5 pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-primary/40"
                            onChange={e => setMcpPopoverSearch(e.target.value)}
                            placeholder="搜索MCP…"
                            value={mcpPopoverSearch}
                          />
                        </div>
                      </div>
                      <div className="max-h-80 overflow-y-auto p-1">
                        {filteredMcpList.length === 0 && (
                          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                            {karnaResourcesLoading ? '加载中…' : '暂无MCP'}
                          </div>
                        )}
                        {filteredMcpList.map(row => {
                          const selected = selectedKarnaResources.mcp.includes(row.name)
                          const canUse = row.connected || row.enabled !== false

                          return (
                            <div
                              className={cn(
                                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                                selected
                                  ? 'border border-primary/30 bg-primary/10 text-primary'
                                  : 'hover:bg-accent/40',
                                !canUse && !selected && 'opacity-70'
                              )}
                              key={row.id}
                            >
                              <div
                                className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[2px] text-[10px] ring-1 ring-black/10 dark:ring-white/10"
                                style={!row.iconImage ? { backgroundColor: row.bgColor || 'var(--muted)', color: row.textColor || 'var(--muted-foreground)' } : undefined}
                              >
                                {row.iconImage ? (
                                  <img alt="" className="h-full w-full object-cover" src={row.iconImage} />
                                ) : (
                                  <span className="select-none text-[11px]">{row.icon || '🔧'}</span>
                                )}
                              </div>
                              <button
                                className="flex min-w-0 flex-1 flex-col items-start justify-start gap-0.5 text-left"
                                disabled={!canUse && !selected}
                                onClick={() => canUse && toggleKarnaResource('mcp', row.name)}
                                title={row.tools?.join(', ')}
                                type="button"
                              >
                                <span className="font-medium w-full text-left text-ellipsis overflow-hidden whitespace-nowrap">{row.name}</span>
                                {row.tools && row.tools.length > 0 && (
                                  <span className="text-[0.65rem] text-muted-foreground text-left">
                                    {row.tools.length} 个工具
                                  </span>
                                )}
                              </button>
                              {row.isConnector && !row.connected && (
                                <button
                                  className="shrink-0 rounded-md border border-primary/40 px-2 py-0.5 text-[0.65rem] text-primary hover:bg-primary/10 transition-colors"
                                  onClick={e => {
                                    e.stopPropagation()
                                    window.location.href = '/#/karna/mcp'
                                  }}
                                  type="button"
                                >
                                  连接
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Popover onOpenChange={open => { if (!open) {setSoulPopoverSearch('')} }}>
                    <PopoverTrigger asChild>
                      <button className={TOOLBAR_BTN} disabled={!!selectedKarnaWorkflowId} type="button">
                        <Palette className="size-3.5" />
                        Soul
                        <ChevronDown className="size-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 p-0">
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                          <input
                            className="w-full rounded-md border border-border/60 bg-transparent py-1.5 pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-primary/40"
                            onChange={e => setSoulPopoverSearch(e.target.value)}
                              placeholder="搜索 Soul…"
                            value={soulPopoverSearch}
                          />
                        </div>
                      </div>
                      <div className="max-h-80 overflow-y-auto p-1">
                        {filteredSoulsList.length === 0 && (
                          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                              {karnaResourcesLoading ? '加载中…' : '暂无 Soul'}
                          </div>
                        )}
                        {filteredSoulsList.map(soul => {
                          const selected = karnaSouls.includes(soul.name)

                          return (
                            <button
                              className={cn(
                                'flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                                selected
                                  ? 'border border-primary/30 bg-primary/10 text-primary'
                                  : 'hover:bg-accent/40'
                              )}
                              key={soul.id}
                              onClick={() => toggleKarnaSoul(soul.name)}
                              type="button"
                            >
                              <span className="font-medium">{soul.name}</span>
                            </button>
                          )
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={TOOLBAR_BTN} type="button">
                        <Users className="size-3.5" />
                        多Agent
                        <ChevronDown className="size-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 p-0">
                      <div className="max-h-80 overflow-y-auto p-1">
                        {workflowResolveError && (
                          <div className="mx-1 mb-1 rounded border border-red-400/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
                            {workflowResolveError}
                            <button
                              className="ml-2 underline"
                              onClick={() => {
                                setSelectedKarnaWorkflowId('')
                                setResolvedWorkflow(null)
                                setWorkflowResolveError(null)
                              }}
                              type="button"
                            >
                              清除
                            </button>
                          </div>
                        )}
                        <button
                          className={cn(
                            'flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                            !selectedKarnaWorkflowId
                              ? 'border border-primary/30 bg-primary/10 text-primary'
                              : 'hover:bg-accent/40'
                          )}
                          onClick={() => selectKarnaWorkflow('')}
                          type="button"
                        >
                          不使用
                        </button>
                        {karnaResourcesLoading || workflowResolving ? (
                          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                            {workflowResolving ? '工作流解析中…' : '加载中…'}
                          </div>
                        ) : karnaResources.workflows.length === 0 ? (
                          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                            暂无工作流
                          </div>
                        ) : (
                          karnaResources.workflows.map(workflow => {
                            const selected = selectedKarnaWorkflowId === workflow.id

                            return (
                              <button
                                className={cn(
                                  'flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                                  selected
                                    ? 'border border-primary/30 bg-primary/10 text-primary'
                                    : 'hover:bg-accent/40'
                                )}
                                disabled={workflowResolving}
                                key={workflow.id}
                                onClick={() => selectKarnaWorkflow(workflow.id)}
                                type="button"
                              >
                                <span className="font-medium">{workflow.name}</span>
                                {selected && resolvedWorkflow && (
                                  <span className="text-[0.65rem] text-muted-foreground">
                                    v{resolvedWorkflow.workflow.version} · {resolvedWorkflow.binding.source === 'global' ? '全局' : '项目'} · {resolvedWorkflow.agents.length} 个Agent
                                  </span>
                                )}
                              </button>
                            )
                          })
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                {(karnaMode !== 'direct' || selectedKarnaWorkflowId || karnaPermissionLevel !== 'restricted') && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {karnaMode !== 'direct' && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-medium text-primary">
                        {karnaMode === 'plan' ? '计划模式' : karnaMode === 'goal' ? '目标模式' : '作品演化'}
                      </span>
                    )}
                    {selectedKarnaWorkflowId && selectedWorkflow && (
                      <span className="rounded-full bg-accent/60 px-2 py-0.5 text-[0.65rem] font-medium text-foreground/70">
                        多Agent: {selectedWorkflow.name}
                      </span>
                    )}
                    {karnaPermissionLevel !== 'restricted' && (
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[0.65rem] font-medium',
                        karnaPermissionLevel === 'dangerous' ? 'bg-violet-500/12 text-violet-500' : 'bg-amber-500/12 text-amber-600'
                      )}>
                        {karnaPermissionLevel === 'computer' ? '电脑授权' : '高危操作'}
                      </span>
                    )}
                  </div>
                )}
                {(selectedKarnaResources.skills.length > 0 || selectedKarnaResources.mcp.length > 0 || karnaSouls.length > 0 || selectedKarnaWorkflowId) && (
                  <div className="flex flex-wrap items-center gap-1">
                    {selectedKarnaResources.skills.map(name => (
                      <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" key={`skill-${name}`}>
                        {name}
                        <button onClick={() => toggleKarnaResource('skills', name)} type="button">
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                    {selectedKarnaResources.mcp.map(name => (
                      <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" key={`mcp-${name}`}>
                        {name}
                        <button onClick={() => toggleKarnaResource('mcp', name)} type="button">
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                    {karnaSouls.map(name => (
                      <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" key={`soul-${name}`}>
                        {name}
                        <button onClick={() => toggleKarnaSoul(name)} type="button">
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                    {selectedKarnaWorkflowId && selectedWorkflow && (
                      <span className="bg-accent/60 text-foreground/70 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
                        多Agent: {selectedWorkflow.name}
                        <button onClick={() => selectKarnaWorkflow('')} type="button">
                          <X className="size-3" />
                        </button>
                      </span>
                    )}
                  </div>
                )}
                {queueEdit && editingQueuedPrompt && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-[color-mix(in_srgb,var(--dt-composer-ring)_32%,transparent)] bg-accent/18 px-2 py-1">
                    <div className="min-w-0 text-[0.7rem] text-muted-foreground/88">
                      {t.composer.editingQueuedInComposer}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        className="h-6 rounded-md px-2 text-[0.68rem]"
                        onClick={() => exitQueuedEdit('cancel')}
                        type="button"
                        variant="ghost"
                      >
                        {t.common.cancel}
                      </Button>
                      <Button
                        className="h-6 rounded-md px-2 text-[0.68rem]"
                        onClick={() => exitQueuedEdit('save')}
                        type="button"
                      >
                        {t.common.save}
                      </Button>
                    </div>
                  </div>
                )}
                {attachments.length > 0 && <AttachmentList attachments={attachments} onRemove={onRemoveAttachment} onParse={parseAttachment} />}
                <div className="w-full">
                  {input}
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <div className="flex items-center gap-1.5">
                    {scopeLocked && draftConversationScope.type === 'project' ? (
                      <span
                        className="flex items-center gap-1 rounded-md border border-blue-400/40 bg-blue-500/5 px-2 py-0.5 text-[0.68rem] text-blue-600/80"
                        title={`当前绑定到项目：${draftConversationScope.projectName}\n路径：${draftConversationScope.cwd}`}
                      >
                        <Codicon name="folder" size="0.65rem" />
                        <span className="max-w-[10rem] truncate">项目：{draftConversationScope.projectName}</span>
                      </span>
                    ) : (
                      <select
                        className={cn(
                          'h-6 max-w-[11rem] truncate rounded-md border bg-transparent px-2 text-[0.68rem] outline-none transition-colors',
                          scopeLocked ? 'opacity-60 cursor-not-allowed' : '',
                          draftConversationScope.type === 'project'
                            ? 'border-blue-400/40 text-blue-600/80 focus:border-blue-500/60'
                            : 'border-transparent text-muted-foreground/60 hover:border-border/50 hover:text-muted-foreground focus:border-primary/40'
                        )}
                        disabled={scopeLocked}
                        onChange={e => {
                          if (scopeLocked) return
                          const val = e.target.value
                          if (val === 'standalone') {
                            setDraftConversationScope({ type: 'standalone' })
                          } else {
                            const proj = projects.find(p => p.id === val)
                            if (proj) {
                              setDraftConversationScope({
                                type: 'project',
                                workspaceId: proj.id,
                                writerProjectId: proj.id,
                                projectName: proj.name,
                                cwd: proj.primary_path || ''
                              })
                            }
                          }
                        }}
                        title={
                          scopeLocked
                            ? '对话归属已锁定，请在目标项目中新建对话'
                            : draftConversationScope.type === 'project'
                              ? `当前绑定到项目：${draftConversationScope.projectName}\n路径：${draftConversationScope.cwd}`
                              : '独立对话不绑定到任何项目'
                        }
                        value={draftConversationScope.type === 'project' ? draftConversationScope.writerProjectId : 'standalone'}
                      >
                        <option value="standalone">独立对话</option>
                        {projects.length > 0 && (
                          <optgroup label="绑定到项目">
                            {projects.map(proj => (
                              <option key={proj.id} value={proj.id} title={proj.primary_path || ''}>
                                项目：{proj.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    )}
                    <select
                      className={cn(
                        'h-6 rounded-md border bg-transparent px-2 text-[0.68rem] outline-none transition-colors',
                        karnaPermissionLevel === 'dangerous'
                          ? 'border-violet-400/40 text-violet-500/80 focus:border-violet-500/60'
                          : karnaPermissionLevel === 'computer'
                            ? 'border-amber-400/40 text-amber-600/80 focus:border-amber-500/60'
                            : 'border-transparent text-muted-foreground/60 hover:border-border/50 hover:text-muted-foreground focus:border-primary/40'
                      )}
                      onChange={e => setKarnaPermissionLevel(e.target.value as 'restricted' | 'computer' | 'dangerous')}
                      title={
                        karnaPermissionLevel === 'restricted'
                          ? 'AI只能在当前对话范围内操作，不能执行终端命令或联网'
                          : karnaPermissionLevel === 'computer'
                            ? 'AI可以访问整个电脑、执行命令和联网，但危险操作会请求确认'
                            : 'AI可以自由执行所有操作，无需确认，请谨慎使用'
                      }
                      value={karnaPermissionLevel}
                    >
                      <option title="AI只能在当前对话范围内操作，不能执行终端命令或联网" value="restricted">项目内受限</option>
                      <option title="AI可以访问整个电脑、执行命令和联网，但危险操作会请求确认" value="computer">电脑授权</option>
                      <option title="AI可以自由执行所有操作，无需确认，请谨慎使用" value="dangerous">高危操作</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-end">{controls}</div>
                </div>
              </div>
            </div>
          </div>
        </ComposerPrimitive.Root>
      </ComposerPrimitive.Unstable_TriggerPopoverRoot>

      <UrlDialog
        inputRef={urlInputRef}
        onChange={setUrlValue}
        onOpenChange={setUrlOpen}
        onSubmit={submitUrl}
        open={urlOpen}
        value={urlValue}
      />
    </>
  )
}

export function ChatBarFallback() {
  return (
    <div
      className={cn(
        'group/composer absolute bottom-0 left-1/2 z-30 w-[min(var(--composer-width),calc(100%-2rem))] max-w-full -translate-x-1/2 rounded-2xl pt-2 pb-[var(--composer-shell-pad-block-end)]',
        'bg-linear-to-b from-transparent to-background/55'
      )}
      data-slot="composer-root"
    >
      <div className="composer-fallback-surface relative isolate h-(--composer-fallback-height) w-full rounded-[inherit] border border-[color-mix(in_srgb,var(--dt-composer-ring)_calc(18%*var(--composer-ring-strength)),var(--dt-input))]">
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 -z-10 rounded-[inherit]',
            composerFill,
            composerSurfaceGlass
          )}
        />
      </div>
    </div>
  )
}
