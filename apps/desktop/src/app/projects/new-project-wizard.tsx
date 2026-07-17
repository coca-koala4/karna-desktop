import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { ideRoute } from '@/app/routes'
import { selectDesktopPaths } from '@/lib/desktop-fs'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import { createProject, PROJECT_CHANGED_EVENT } from '@/store/projects'
import type {
  DocumentObjectType,
  DocumentPreset,
  ProjectCatalog,
  WritingDomain,
  WritingForm,
  WritingFormFamily
} from '@/types/writer-project-catalog'

import { buildSelectedDocuments, validateRelativePath, type SelectedDocument } from './new-wizard-types'

interface NewProjectWizardProps {
  open: boolean
  onClose: () => void
  onCreated: (project: any) => void
}

type WizardStep = 'domain' | 'form' | 'doctype' | 'documents' | 'confirm'

const STEPS: WizardStep[] = ['domain', 'form', 'doctype', 'documents', 'confirm']

const L = {
  title: '新建创作项目',
  close: '关闭',
  back: '上一步',
  next: '下一步',
  create: '创建项目',
  creating: '创建中...',
  cancel: '取消',
  success: '项目已创建',
  fail: '创建项目失败',
  stepDomain: '选择领域',
  stepForm: '选择文体',
  stepDoctype: '底层类型',
  stepDocuments: '初始文档',
  stepConfirm: '确认详情',
  searchPlaceholder: '搜索文体...',
  customForm: '自定义文体',
  customFormLabel: '文体名称',
  customFormLabelPlaceholder: '输入自定义文体名称',
  customFormDocType: '选择底层文档类型',
  selectDocType: '请选择文档类型',
  projectName: '项目名称',
  projectNamePlaceholder: '输入项目名称',
  projectDescription: '项目说明（可选）',
  projectDescriptionPlaceholder: '简单描述这个项目的目标、内容或用途',
  location: '工作空间位置',
  locationKarna: 'Karna 工作空间（推荐）',
  locationKarnaDesc: '保存在 文档\\Karna\\Projects',
  locationDocuments: '我的文档',
  locationDocumentsDesc: '保存在 我的文档 文件夹',
  locationCustom: '自定义位置',
  locationCustomDesc: '选择任意文件夹作为项目根目录',
  pickFolder: '选择文件夹',
  useThisFolder: '使用此文件夹作为项目工作空间',
  notSelected: '未选择',
  required: '必填',
  allDocuments: '全部文档',
  selectedCount: '已选择',
  fileName: '文件名',
  filePath: '相对路径',
  docType: '文档类型',
  categorySummary: '分类摘要',
  selectedDocsPreview: '已选文档预览',
  noDocsSelected: '未选择任何文档',
  domain: '领域',
  form: '文体',
  documentType: '底层类型',
  loadingCatalog: '加载目录数据中...'
}

const DOCUMENT_TYPE_LABELS: Record<DocumentObjectType, string> = {
  narrative_prose: '叙事散文',
  script_dialogue: '剧本对白',
  interactive_narrative: '互动叙事',
  marketing_copy: '营销文案',
  informational_article: '资讯文章',
  argumentative_document: '论证文档',
  structured_business_doc: '结构化商务文档',
  regulated_document: '受监管文档',
  technical_document: '技术文档',
  knowledge_asset: '知识资产',
  outline: '大纲规划',
  research_material: '研究资料',
  review_feedback: '审阅反馈',
  revision_artifact: '修订产物'
}

async function getUserHomeDir(): Promise<string> {
  try {
    const result = await (window as any).hermesDesktop?.settings?.getDefaultProjectDir()

    if (result?.resolvedCwd) {
      const cwd = result.resolvedCwd
      const docsIndex = cwd.toLowerCase().indexOf('\\documents')

      if (docsIndex > 0) {
        return cwd.slice(0, docsIndex)
      }

      const parts = cwd.split(/[/\\]/)

      if (parts.length >= 3) {
        return parts.slice(0, 3).join('\\')
      }

      return cwd
    }
  } catch {
    // fall through
  }

  return ''
}

export function NewProjectWizard({ open, onClose, onCreated }: NewProjectWizardProps) {
  const navigate = useNavigate()
  const [step, setStep] = useState<WizardStep>('domain')
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null)
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null)
  const [isCustomForm, setIsCustomForm] = useState(false)
  const [customFormLabel, setCustomFormLabel] = useState('')
  const [customFormDocType, setCustomFormDocType] = useState<DocumentObjectType | null>(null)
  const [selectedDocuments, setSelectedDocuments] = useState<SelectedDocument[]>([])
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [locationMode, setLocationMode] = useState<'karna' | 'documents' | 'custom'>('karna')
  const [customPath, setCustomPath] = useState('')
  const [creating, setCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [catalog, setCatalog] = useState<ProjectCatalog | null>(null)
  const [homeDir, setHomeDir] = useState('')

  const fetchCatalog = useCallback(async () => {
    try {
      const response = await (window as any).karnaDesktop.api({
        path: '/api/writer/project-catalog',
        method: 'GET'
      })
      if (response?.ok && response.catalog) {
        setCatalog(response.catalog)
      }
    } catch (err) {
      console.warn('Failed to fetch project catalog:', err)
    }
  }, [])

  useEffect(() => {
    if (open) {
      void fetchCatalog()
      void getUserHomeDir().then(dir => setHomeDir(dir))
    }
  }, [open, fetchCatalog])

  useEffect(() => {
    if (open) {
      setStep('domain')
      setSelectedDomainId(null)
      setSelectedFormId(null)
      setIsCustomForm(false)
      setCustomFormLabel('')
      setCustomFormDocType(null)
      setSelectedDocuments([])
      setProjectName('')
      setProjectDescription('')
      setLocationMode('karna')
      setCustomPath('')
      setCreating(false)
      setSearchQuery('')
    }
  }, [open])

  const selectedDomain = useMemo(() => {
    if (!catalog || !selectedDomainId) return null
    return catalog.domains.find(d => d.id === selectedDomainId) || null
  }, [catalog, selectedDomainId])

  const selectedForm = useMemo(() => {
    if (!catalog || !selectedFormId || isCustomForm) return null
    return catalog.forms.find(f => f.id === selectedFormId) || null
  }, [catalog, selectedFormId, isCustomForm])

  const filteredFamilies = useMemo(() => {
    if (!catalog || !selectedDomainId) return []
    return catalog.families.filter(f => f.domainId === selectedDomainId)
  }, [catalog, selectedDomainId])

  const filteredForms = useMemo(() => {
    if (!catalog || !selectedDomainId) return []
    let forms = catalog.forms.filter(f => f.domainId === selectedDomainId)

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      forms = forms.filter(f =>
        f.label.toLowerCase().includes(query) ||
        f.aliases.some(a => a.toLowerCase().includes(query)) ||
        f.tags.some(t => t.toLowerCase().includes(query)) ||
        f.searchableText.toLowerCase().includes(query)
      )
    }

    return forms
  }, [catalog, selectedDomainId, searchQuery])

  const karnaProjectsRoot = useMemo(() => {
    return homeDir ? `${homeDir}\\Documents\\Karna\\Projects` : ''
  }, [homeDir])

  const documentsRoot = useMemo(() => {
    return homeDir ? `${homeDir}\\Documents` : ''
  }, [homeDir])

  const projectPath = useMemo(() => {
    if (!projectName.trim()) { return '' }

    if (locationMode === 'custom' && customPath) {
      return customPath
    }

    if (locationMode === 'documents' && documentsRoot) {
      return `${documentsRoot}\\${projectName.trim()}`
    }

    if (karnaProjectsRoot) {
      return `${karnaProjectsRoot}\\${projectName.trim()}`
    }

    return projectName.trim()
  }, [projectName, locationMode, customPath, karnaProjectsRoot, documentsRoot])

  const primaryDocumentType = useMemo(() => {
    if (isCustomForm) return customFormDocType
    if (selectedForm) return selectedForm.primaryDocumentType
    return null
  }, [isCustomForm, customFormDocType, selectedForm])

  const rebuildDocuments = useCallback(() => {
    if (!catalog) return

    if (isCustomForm) {
      setSelectedDocuments([])
    } else if (selectedForm) {
      const docs = buildSelectedDocuments(selectedForm, catalog.presets)
      setSelectedDocuments(docs)
    }
  }, [catalog, isCustomForm, selectedForm])

  useEffect(() => {
    if (catalog && step === 'documents') {
      rebuildDocuments()
    }
  }, [catalog, step, rebuildDocuments])

  const handleDomainSelect = (domainId: string) => {
    setSelectedDomainId(domainId)
    setSelectedFormId(null)
    setIsCustomForm(false)
    setSelectedDocuments([])
  }

  const handleFormSelect = (formId: string) => {
    setSelectedFormId(formId)
    setIsCustomForm(false)
    setSelectedDocuments([])
  }

  const handleCustomFormToggle = () => {
    setIsCustomForm(!isCustomForm)
    setSelectedFormId(null)
    setSelectedDocuments([])
  }

  const toggleDocument = (index: number) => {
    setSelectedDocuments(prev =>
      prev.map((doc, i) =>
        i === index ? { ...doc, selected: !doc.selected } : doc
      )
    )
  }

  const updateDocumentTitle = (index: number, title: string) => {
    setSelectedDocuments(prev =>
      prev.map((doc, i) =>
        i === index ? { ...doc, title } : doc
      )
    )
  }

  const updateDocumentPath = (index: number, relativePath: string) => {
    setSelectedDocuments(prev =>
      prev.map((doc, i) =>
        i === index ? { ...doc, relativePath } : doc
      )
    )
  }

  const pickCustomFolder = async () => {
    const paths = await selectDesktopPaths({ directories: true, multiple: false, title: L.pickFolder } as any)

    if (paths[0]) { setCustomPath(paths[0]) }
  }

  const canProceed = (): boolean => {
    if (step === 'domain') {
      return selectedDomainId !== null
    }
    if (step === 'form') {
      if (isCustomForm) {
        return customFormLabel.trim().length > 0 && customFormDocType !== null
      }
      return selectedFormId !== null
    }
    if (step === 'doctype') {
      if (isCustomForm) {
        return customFormDocType !== null
      }
      return selectedForm !== null
    }
    if (step === 'documents') {
      return true
    }
    if (step === 'confirm') {
      const hasName = projectName.trim().length > 0
      const hasLocation = locationMode !== 'custom' || customPath.trim().length > 0
      const hasValidType = primaryDocumentType !== null
      return hasName && hasLocation && hasValidType
    }
    return false
  }

  const handleNext = () => {
    const currentIndex = STEPS.indexOf(step)
    if (currentIndex < STEPS.length - 1) {
      setStep(STEPS[currentIndex + 1])
    }
  }

  const handleBack = () => {
    const currentIndex = STEPS.indexOf(step)
    if (currentIndex > 0) {
      setStep(STEPS[currentIndex - 1])
    }
  }

  const validateDocuments = (): boolean => {
    const selected = selectedDocuments.filter(d => d.selected)
    for (const doc of selected) {
      const validation = validateRelativePath(doc.relativePath)
      if (!validation.valid) {
        notifyError(new Error(`文档 "${doc.title}" 的路径无效：${validation.error}`), L.fail)
        return false
      }
      if (!doc.title.trim()) {
        notifyError(new Error('文档名称不能为空'), L.fail)
        return false
      }
    }
    return true
  }

  const handleCreate = async () => {
    if (!canProceed()) return
    if (!validateDocuments()) return

    setCreating(true)
    let createdProject: any = null

    try {
      const folderPath = projectPath

      createdProject = await createProject({
        name: projectName.trim(),
        primaryPath: folderPath,
        folders: folderPath ? [folderPath] : [],
        description: projectDescription.trim() || undefined,
        use: true,
        idea: projectDescription.trim() || undefined,
        color: 'violet',
        icon: 'edit'
      })

      if (!createdProject) {
        throw new Error('创建工作空间项目失败')
      }

      const selectedDocs = selectedDocuments.filter(d => d.selected).map(d => ({
        presetId: d.presetId,
        title: d.title,
        relativePath: d.relativePath,
        documentType: d.documentType,
        templateId: d.templateId,
        kind: d.kind
      }))

      const taxonomy: any = {
        schemaVersion: 2,
        catalogVersion: catalog?.version || '',
        domainId: selectedDomainId || '',
        familyId: selectedForm?.familyId || '',
        formId: isCustomForm ? 'custom' : (selectedFormId || ''),
        primaryDocumentType: primaryDocumentType!,
        capabilityProfileId: selectedForm?.capabilityProfileId || 'default'
      }

      if (isCustomForm) {
        taxonomy.customFormLabel = customFormLabel.trim()
      }

      const writerProjectResponse = await (window as any).karnaDesktop.api({
        path: '/api/writer/projects',
        method: 'POST',
        body: {
          title: projectName.trim(),
          description: projectDescription.trim() || undefined,
          folder: folderPath || undefined,
          workspace_id: createdProject.id,
          taxonomy,
          selected_documents: selectedDocs
        }
      })

      if (!writerProjectResponse?.ok || !writerProjectResponse?.project) {
        const message = writerProjectResponse?.message || writerProjectResponse?.error || 'Writer OS 项目登记失败'
        throw new Error(message)
      }

      window.dispatchEvent(new CustomEvent(PROJECT_CHANGED_EVENT))
      notify({ kind: 'success', title: L.success, message: projectName.trim() })
      onCreated(createdProject)
      onClose()
      navigate(ideRoute(createdProject.id))
    } catch (error) {
      notifyError(error, L.fail)

      if (createdProject) {
        try {
          const projectsStore = await import('@/store/projects')
          if ((projectsStore as any).deleteProject) {
            await (projectsStore as any).deleteProject(createdProject.id)
          }
        } catch (rollbackErr) {
          console.warn('Failed to rollback project creation:', rollbackErr)
        }
      }
    } finally {
      setCreating(false)
    }
  }

  if (!open) { return null }

  const stepIndex = STEPS.indexOf(step)

  return (
    <div
      className="fixed inset-0 z-[260] grid place-items-center bg-slate-900/20 p-4 backdrop-blur-[2px] [-webkit-app-region:no-drag] [&_*]:[-webkit-app-region:no-drag] dark:bg-slate-950/40"
      onMouseDown={event => { if (event.target === event.currentTarget && !creating) { onClose() } }}
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-white to-violet-50 px-6 py-5 dark:border-slate-800 dark:from-slate-900 dark:to-violet-950/30">
          <div>
            <h2 className="text-lg font-semibold">{L.title}</h2>
            <div className="mt-2 flex items-center gap-2">
              {STEPS.map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <StepIndicator active={step === s} done={stepIndex > i} label={`${i + 1}`} />
                  {i < STEPS.length - 1 && (
                    <div className={cn('h-px w-8', stepIndex > i ? 'bg-violet-400' : 'bg-slate-200 dark:bg-slate-700')} />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className={cn(step === 'domain' && 'font-medium text-violet-600 dark:text-violet-400')}>{L.stepDomain}</span>
              <span className={cn(step === 'form' && 'font-medium text-violet-600 dark:text-violet-400')}>{L.stepForm}</span>
              <span className={cn(step === 'doctype' && 'font-medium text-violet-600 dark:text-violet-400')}>{L.stepDoctype}</span>
              <span className={cn(step === 'documents' && 'font-medium text-violet-600 dark:text-violet-400')}>{L.stepDocuments}</span>
              <span className={cn(step === 'confirm' && 'font-medium text-violet-600 dark:text-violet-400')}>{L.stepConfirm}</span>
            </div>
          </div>
          <button
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            disabled={creating}
            onClick={onClose}
            type="button"
          >
            <Codicon name="close" size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-6 py-5">
          {!catalog && step !== 'confirm' && (
            <div className="flex h-40 items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Codicon name="loading" size={16} spinning />
                <span>{L.loadingCatalog}</span>
              </div>
            </div>
          )}

          {catalog && step === 'domain' && (
            <DomainStep
              domains={catalog.domains}
              selectedDomainId={selectedDomainId}
              onSelect={handleDomainSelect}
            />
          )}

          {catalog && step === 'form' && (
            <FormStep
              forms={filteredForms}
              families={filteredFamilies}
              selectedFormId={selectedFormId}
              isCustomForm={isCustomForm}
              customFormLabel={customFormLabel}
              customFormDocType={customFormDocType}
              searchQuery={searchQuery}
              onFormSelect={handleFormSelect}
              onCustomToggle={handleCustomFormToggle}
              onCustomLabelChange={setCustomFormLabel}
              onCustomDocTypeChange={setCustomFormDocType}
              onSearchChange={setSearchQuery}
              presets={catalog.presets}
            />
          )}

          {catalog && step === 'doctype' && (
            <DoctypeStep
              selectedForm={selectedForm}
              isCustomForm={isCustomForm}
              customFormLabel={customFormLabel}
              customFormDocType={customFormDocType}
              onCustomDocTypeChange={setCustomFormDocType}
            />
          )}

          {catalog && step === 'documents' && (
            <DocumentsStep
              documents={selectedDocuments}
              onToggle={toggleDocument}
              onTitleChange={updateDocumentTitle}
              onPathChange={updateDocumentPath}
            />
          )}

          {step === 'confirm' && (
            <ConfirmStep
              projectName={projectName}
              projectDescription={projectDescription}
              locationMode={locationMode}
              customPath={customPath}
              karnaProjectsRoot={karnaProjectsRoot}
              documentsRoot={documentsRoot}
              projectPath={projectPath}
              selectedDomain={selectedDomain}
              selectedForm={selectedForm}
              isCustomForm={isCustomForm}
              customFormLabel={customFormLabel}
              primaryDocumentType={primaryDocumentType}
              selectedDocuments={selectedDocuments.filter(d => d.selected)}
              onNameChange={setProjectName}
              onDescriptionChange={setProjectDescription}
              onLocationModeChange={setLocationMode}
              onPickFolder={pickCustomFolder}
            />
          )}
        </div>

        <footer className="flex justify-between gap-2 border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div>
            {step !== 'domain' && (
              <Button disabled={creating} onClick={handleBack} variant="ghost">
                <Codicon name="arrow-left" size={14} />
                <span className="ml-1.5">{L.back}</span>
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button disabled={creating} onClick={onClose} variant="ghost">{L.cancel}</Button>
            {step !== 'confirm' ? (
              <Button disabled={!canProceed() || creating} onClick={handleNext}>
                {L.next}
                <Codicon name="arrow-right" size={14} />
              </Button>
            ) : (
              <Button disabled={!canProceed() || creating} onClick={() => void handleCreate()}>
                {creating ? (
                  <>
                    <Codicon name="loading" size={14} spinning />
                    <span className="ml-1.5">{L.creating}</span>
                  </>
                ) : (
                  <>
                    <Codicon name="check" size={14} />
                    <span className="ml-1.5">{L.create}</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

function StepIndicator({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={cn(
      'grid size-6 place-items-center rounded-full text-xs font-medium transition-colors',
      active ? 'bg-violet-500 text-white' : done ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
    )}>
      {done ? <Codicon name="check" size={12} /> : label}
    </div>
  )
}

function DomainStep({ domains, selectedDomainId, onSelect }: {
  domains: WritingDomain[]
  selectedDomainId: string | null
  onSelect: (id: string) => void
}) {
  const sortedDomains = [...domains].sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{L.stepDomain}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {sortedDomains.map(domain => (
          <DomainCard
            key={domain.id}
            domain={domain}
            active={selectedDomainId === domain.id}
            onClick={() => onSelect(domain.id)}
          />
        ))}
      </div>
    </div>
  )
}

function DomainCard({ domain, active, onClick }: {
  domain: WritingDomain
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'group flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all',
        active
          ? 'border-violet-400 bg-violet-50 shadow-md dark:border-violet-500 dark:bg-violet-950/30'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/50'
      )}
      onClick={onClick}
      type="button"
    >
      <div className={cn(
        'grid size-12 place-items-center rounded-xl text-xl transition-colors',
        active
          ? 'bg-violet-500 text-white'
          : 'bg-violet-100 text-violet-600 group-hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:group-hover:bg-violet-900/50'
      )}>
        <Codicon name={domain.icon || 'book'} size={24} />
      </div>
      <div className={cn(
        'text-sm font-semibold',
        active ? 'text-violet-700 dark:text-violet-300' : 'text-slate-900 dark:text-slate-100'
      )}>
        {domain.label}
      </div>
      <div className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{domain.description}</div>
      {active && (
        <div className="mt-1">
          <Codicon className="text-violet-500 dark:text-violet-400" name="check" size={18} />
        </div>
      )}
    </button>
  )
}

function FormStep({
  forms,
  families,
  selectedFormId,
  isCustomForm,
  customFormLabel,
  customFormDocType,
  searchQuery,
  onFormSelect,
  onCustomToggle,
  onCustomLabelChange,
  onCustomDocTypeChange,
  onSearchChange,
  presets
}: {
  forms: WritingForm[]
  families: WritingFormFamily[]
  selectedFormId: string | null
  isCustomForm: boolean
  customFormLabel: string
  customFormDocType: DocumentObjectType | null
  searchQuery: string
  onFormSelect: (id: string) => void
  onCustomToggle: () => void
  onCustomLabelChange: (v: string) => void
  onCustomDocTypeChange: (v: DocumentObjectType | null) => void
  onSearchChange: (v: string) => void
  presets: DocumentPreset[]
}) {
  const formsByFamily = useMemo(() => {
    const map: Record<string, WritingForm[]> = {}
    for (const form of forms) {
      if (!map[form.familyId]) {
        map[form.familyId] = []
      }
      map[form.familyId].push(form)
    }
    return map
  }, [forms])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{L.stepForm}</h3>
        <div className="relative">
          <Codicon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" name="search" size={14} />
          <input
            className="w-56 rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm outline-none transition-colors focus:border-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-violet-500"
            onChange={e => onSearchChange(e.target.value)}
            placeholder={L.searchPlaceholder}
            value={searchQuery}
          />
        </div>
      </div>

      <div className="space-y-5">
        {families.map(family => (
          formsByFamily[family.id]?.length ? (
            <div key={family.id} className="space-y-2">
              <div className="text-xs font-medium text-slate-400 dark:text-slate-500">{family.label}</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {formsByFamily[family.id].map(form => (
                  <FormCard
                    key={form.id}
                    form={form}
                    active={selectedFormId === form.id && !isCustomForm}
                    onClick={() => onFormSelect(form.id)}
                    presets={presets}
                  />
                ))}
              </div>
            </div>
          ) : null
        ))}

        {forms.length === 0 && !searchQuery && (
          <div className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            该领域暂无文体
          </div>
        )}

        {forms.length === 0 && searchQuery && (
          <div className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            未找到匹配的文体
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <button
          className={cn(
            'w-full rounded-xl border-2 p-4 text-left transition-all',
            isCustomForm
              ? 'border-violet-400 bg-violet-50 dark:border-violet-500 dark:bg-violet-950/30'
              : 'border-dashed border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 dark:hover:bg-slate-800'
          )}
          onClick={onCustomToggle}
          type="button"
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              'grid size-10 shrink-0 place-items-center rounded-lg',
              isCustomForm
                ? 'bg-violet-500 text-white'
                : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
            )}>
              <Codicon name="plus" size={20} />
            </div>
            <div className="font-medium">{L.customForm}</div>
            {isCustomForm && (
              <Codicon className="ml-auto text-violet-500 dark:text-violet-400" name="check" size={18} />
            )}
          </div>
        </button>

        {isCustomForm && (
          <div className="mt-3 space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-800 dark:bg-violet-950/20">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{L.customFormLabel} <span className="text-rose-500">*</span></span>
              <input
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition-colors focus:border-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-violet-500"
                onChange={e => onCustomLabelChange(e.target.value)}
                placeholder={L.customFormLabelPlaceholder}
                value={customFormLabel}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{L.customFormDocType} <span className="text-rose-500">*</span></span>
              <select
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition-colors focus:border-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-violet-500"
                value={customFormDocType || ''}
                onChange={e => onCustomDocTypeChange(e.target.value as DocumentObjectType || null)}
              >
                <option value="">{L.selectDocType}</option>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
    </div>
  )
}

function FormCard({ form, active, onClick, presets }: {
  form: WritingForm
  active: boolean
  onClick: () => void
  presets: DocumentPreset[]
}) {
  const presetCount = form.documentPresetIds.filter(id => presets.some(p => p.id === id)).length

  return (
    <button
      className={cn(
        'flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
        active
          ? 'border-violet-400 bg-violet-50 shadow-sm dark:border-violet-500 dark:bg-violet-950/30'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
      )}
      onClick={onClick}
      type="button"
    >
      <div className={cn(
        'grid size-9 shrink-0 place-items-center rounded-lg',
        active
          ? 'bg-violet-500 text-white'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
      )}>
        <Codicon name="file-text" size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn(
          'text-sm font-semibold truncate',
          active ? 'text-violet-700 dark:text-violet-300' : 'text-slate-900 dark:text-slate-100'
        )}>
          {form.label}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{DOCUMENT_TYPE_LABELS[form.primaryDocumentType]}</span>
          <span>·</span>
          <span>{presetCount} 个模板</span>
        </div>
      </div>
      {active && (
        <Codicon className="text-violet-500 dark:text-violet-400" name="check" size={16} />
      )}
    </button>
  )
}

function DoctypeStep({
  selectedForm,
  isCustomForm,
  customFormLabel,
  customFormDocType,
  onCustomDocTypeChange
}: {
  selectedForm: WritingForm | null
  isCustomForm: boolean
  customFormLabel: string
  customFormDocType: DocumentObjectType | null
  onCustomDocTypeChange: (v: DocumentObjectType | null) => void
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{L.stepDoctype}</h3>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-800/50">
        <div className="space-y-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{L.form}</div>
            <div className="mt-1 text-base font-medium text-slate-900 dark:text-slate-100">
              {isCustomForm ? customFormLabel || L.notSelected : selectedForm?.label || L.notSelected}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
            <div className="text-xs text-slate-500 dark:text-slate-400">{L.documentType}</div>
            {isCustomForm ? (
              <div className="mt-2">
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none transition-colors focus:border-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-violet-500"
                  value={customFormDocType || ''}
                  onChange={e => onCustomDocTypeChange(e.target.value as DocumentObjectType || null)}
                >
                  <option value="">{L.selectDocType}</option>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                    <button
                      key={value}
                      className={cn(
                        'rounded-lg border p-2.5 text-left text-sm transition-all',
                        customFormDocType === value
                          ? 'border-violet-400 bg-violet-50 dark:border-violet-500 dark:bg-violet-950/30'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                      )}
                      onClick={() => onCustomDocTypeChange(value as DocumentObjectType)}
                      type="button"
                    >
                      <div className={cn(
                        'font-medium',
                        customFormDocType === value
                          ? 'text-violet-700 dark:text-violet-300'
                          : 'text-slate-900 dark:text-slate-100'
                      )}>
                        {label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <div className="grid size-9 place-items-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                  <Codicon name="file-code" size={16} />
                </div>
                <div>
                  <div className="text-base font-medium text-violet-700 dark:text-violet-300">
                    {selectedForm ? DOCUMENT_TYPE_LABELS[selectedForm.primaryDocumentType] : L.notSelected}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">内置文体，底层类型固定</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DocumentsStep({
  documents,
  onToggle,
  onTitleChange,
  onPathChange
}: {
  documents: SelectedDocument[]
  onToggle: (index: number) => void
  onTitleChange: (index: number, title: string) => void
  onPathChange: (index: number, path: string) => void
}) {
  const selectedCount = documents.filter(d => d.selected).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{L.stepDocuments}</h3>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {L.selectedCount}: <span className="font-medium text-violet-600 dark:text-violet-400">{selectedCount}</span> / {documents.length}
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
          {L.noDocsSelected}
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc, index) => {
            const pathValidation = validateRelativePath(doc.relativePath)
            return (
              <div
                key={doc.presetId || index}
                className={cn(
                  'rounded-xl border p-3 transition-all',
                  doc.selected
                    ? 'border-violet-300 bg-violet-50/50 dark:border-violet-700 dark:bg-violet-950/20'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="pt-1">
                    <label className="relative flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={doc.selected}
                        onChange={() => onToggle(index)}
                      />
                      <div className={cn(
                        'grid size-5 place-items-center rounded-md border-2 transition-all',
                        doc.selected
                          ? 'border-violet-500 bg-violet-500 text-white'
                          : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                      )}>
                        {doc.selected && <Codicon name="check" size={12} />}
                      </div>
                    </label>
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-md',
                        doc.kind === 'directory'
                          ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400'
                      )}>
                        <Codicon name={doc.kind === 'directory' ? 'file-directory' : 'file'} size={14} />
                      </div>
                      <input
                        className={cn(
                          'flex-1 rounded-md border bg-transparent px-2 py-1 text-sm outline-none transition-colors',
                          doc.selected
                            ? 'border-violet-300 focus:border-violet-400 dark:border-violet-700 dark:focus:border-violet-500'
                            : 'border-transparent focus:border-slate-300 dark:focus:border-slate-600'
                        )}
                        value={doc.title}
                        onChange={e => onTitleChange(index, e.target.value)}
                        placeholder={L.fileName}
                      />
                    </div>
                    <div className="flex items-center gap-2 pl-9">
                      <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{L.filePath}:</span>
                      <input
                        className={cn(
                          'flex-1 rounded-md border bg-white px-2 py-1 font-mono text-xs outline-none transition-colors dark:bg-slate-800',
                          pathValidation.valid
                            ? 'border-slate-200 focus:border-violet-400 dark:border-slate-700 dark:focus:border-violet-500'
                            : 'border-rose-300 focus:border-rose-400 dark:border-rose-700 dark:focus:border-rose-500'
                        )}
                        value={doc.relativePath}
                        onChange={e => onPathChange(index, e.target.value)}
                      />
                    </div>
                    {!pathValidation.valid && (
                      <div className="pl-9 text-xs text-rose-500 dark:text-rose-400">
                        {pathValidation.error}
                      </div>
                    )}
                    <div className="pl-9 text-xs text-slate-400 dark:text-slate-500">
                      {L.docType}: <span className="text-slate-600 dark:text-slate-300">{DOCUMENT_TYPE_LABELS[doc.documentType]}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ConfirmStep({
  projectName,
  projectDescription,
  locationMode,
  customPath,
  karnaProjectsRoot,
  documentsRoot,
  projectPath,
  selectedDomain,
  selectedForm,
  isCustomForm,
  customFormLabel,
  primaryDocumentType,
  selectedDocuments,
  onNameChange,
  onDescriptionChange,
  onLocationModeChange,
  onPickFolder
}: {
  projectName: string
  projectDescription: string
  locationMode: 'karna' | 'documents' | 'custom'
  customPath: string
  karnaProjectsRoot: string
  documentsRoot: string
  projectPath: string
  selectedDomain: WritingDomain | null
  selectedForm: WritingForm | null
  isCustomForm: boolean
  customFormLabel: string
  primaryDocumentType: DocumentObjectType | null
  selectedDocuments: SelectedDocument[]
  onNameChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onLocationModeChange: (v: 'karna' | 'documents' | 'custom') => void
  onPickFolder: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{L.projectName} <span className="text-rose-500">*</span></span>
          <input
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none transition-colors focus:border-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-violet-500"
            onChange={e => onNameChange(e.target.value)}
            placeholder={L.projectNamePlaceholder}
            value={projectName}
          />
        </label>
        <div className="grid gap-1.5 text-sm">
          <span className="font-medium">{L.categorySummary}</span>
          <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 dark:border-violet-800 dark:bg-violet-950/20">
            <span className="grid size-7 place-items-center rounded-md bg-violet-500 text-white">
              <Codicon name="tag" size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-violet-700 dark:text-violet-300">
                {selectedDomain?.label || L.notSelected}
                {selectedDomain && (isCustomForm ? customFormLabel : selectedForm?.label) && (
                  <span className="mx-1 text-violet-400">/</span>
                )}
                {isCustomForm ? customFormLabel : selectedForm?.label}
              </div>
              <div className="truncate text-xs text-violet-500 dark:text-violet-400">
                {primaryDocumentType ? DOCUMENT_TYPE_LABELS[primaryDocumentType] : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <span className="text-sm font-medium">{L.location}</span>
        <div className="grid gap-2">
          <LocationOption
            active={locationMode === 'karna'}
            description={L.locationKarnaDesc}
            icon="home"
            label={L.locationKarna}
            onClick={() => onLocationModeChange('karna')}
            path={karnaProjectsRoot}
          />
          <LocationOption
            active={locationMode === 'documents'}
            description={L.locationDocumentsDesc}
            icon="library"
            label={L.locationDocuments}
            onClick={() => onLocationModeChange('documents')}
            path={documentsRoot}
          />
          <LocationOption
            active={locationMode === 'custom'}
            description={L.locationCustomDesc}
            icon="folder-opened"
            label={L.locationCustom}
            onClick={() => onLocationModeChange('custom')}
            path={customPath}
          >
            {locationMode === 'custom' && (
              <div className="mt-2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <Button onClick={() => void onPickFolder()} size="sm" type="button" variant="outline">
                  <Codicon name="folder" size={14} />
                  <span className="ml-1.5">{L.pickFolder}</span>
                </Button>
                {customPath && (
                  <span className="truncate text-xs text-slate-500 dark:text-slate-400">{L.useThisFolder}</span>
                )}
              </div>
            )}
          </LocationOption>
        </div>
      </div>

      {projectPath && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Codicon name="file-directory" size={14} />
            <span>项目将创建在：</span>
          </div>
          <div className="mt-1 font-mono text-sm text-slate-700 dark:text-slate-300">{projectPath}</div>
        </div>
      )}

      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">{L.projectDescription}</span>
        <textarea
          className="min-h-20 rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none transition-colors focus:border-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-violet-500"
          onChange={e => onDescriptionChange(e.target.value)}
          placeholder={L.projectDescriptionPlaceholder}
          value={projectDescription}
        />
      </label>

      <div className="space-y-2">
        <span className="text-sm font-medium">{L.selectedDocsPreview}</span>
        {selectedDocuments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
            {L.noDocsSelected}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="space-y-1 font-mono text-xs">
              {selectedDocuments.map((doc, i) => (
                <div key={doc.presetId || i} className="flex items-center gap-1.5 py-0.5">
                  {doc.kind === 'directory' ? (
                    <Codicon className="text-amber-500" name="file-directory" size={12} />
                  ) : (
                    <Codicon className="text-sky-500" name="file" size={12} />
                  )}
                  <span className="text-slate-700 dark:text-slate-300">{doc.relativePath}</span>
                  <span className="text-slate-400">—</span>
                  <span className="text-slate-500 dark:text-slate-400">{doc.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LocationOption({ active, children, description, icon, label, onClick, path }: {
  active: boolean
  children?: React.ReactNode
  description: string
  icon: string
  label: string
  onClick: () => void
  path?: string
}) {
  return (
    <button
      className={cn(
        'rounded-xl border p-4 text-left transition-all w-full',
        active
          ? 'border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-900/20'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/50'
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg',
          active ? 'bg-violet-100 text-violet-600 dark:bg-violet-800/50 dark:text-violet-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        )}>
          <Codicon name={icon} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn('text-sm font-medium', active ? 'text-violet-700 dark:text-violet-300' : 'text-slate-900 dark:text-slate-100')}>
            {label}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</div>
          {path && !children && (
            <div className="mt-1.5 truncate font-mono text-[0.7rem] text-slate-400 dark:text-slate-500">{path}</div>
          )}
        </div>
        {active && (
          <Codicon className="text-violet-500 dark:text-violet-400" name="check" size={18} />
        )}
      </div>
      {children}
    </button>
  )
}
