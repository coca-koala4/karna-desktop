import { type CSSProperties, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { selectDesktopPaths, writeDesktopFileText } from '@/lib/desktop-fs'
import {
  COLOR_CLASSES,
  getCategoryTemplates,
  processTemplateContent,
  type ProjectCategory,
  type ProjectTemplate
} from '@/lib/project-templates'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import { createProject, PROJECT_CHANGED_EVENT } from '@/store/projects'

interface WriterProjectAgent { id: string; name: string; role: string; brief?: string; persona?: string; skills?: string[]; mcp?: string[]; enabled?: boolean; session_id?: string | null; status?: string; status_label?: string; status_detail?: string }
export interface WriterProject { id: string; title: string; slug: string; type: string; folder: string; main_session_id?: string; session_ids?: string[]; agent_session_ids?: Record<string, string>; multi_agent_enabled?: boolean; agents?: WriterProjectAgent[]; tasks?: { tasks?: Array<{ id: string; status: string }> } }

interface ResourceRow { id: string; name: string; description?: string; folder?: string; path?: string; vectorized?: boolean; enabled?: boolean }
interface ProjectWizardOverlayProps { open: boolean; onClose: () => void; onCreated: (project: WriterProject) => void }

const L = {
  title: '新建项目',
  stepCategory: '选择项目类型',
  stepTemplate: '选择具体类型',
  stepDetails: '项目详情',
  close: '关闭',
  categoryGeneral: '普通项目',
  categoryGeneralDesc: '通用、研究、开发、笔记',
  categoryCreative: '创作项目',
  categoryCreativeDesc: '小说、剧本、诗歌、游戏等',
  name: '项目名称',
  namePlaceholder: '输入项目名称',
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
  goal: '项目说明（可选）',
  goalPlaceholder: '简单描述这个项目的目标、内容或用途',
  filesPreview: '将自动创建以下文件结构',
  cancel: '取消',
  back: '上一步',
  next: '下一步',
  create: '创建项目',
  creating: '创建中...',
  success: '项目已创建',
  fail: '创建项目失败',
  creatingFiles: '正在初始化文件...',
  required: '必填'
}

async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    const markerPath = `${dirPath.replace(/[/\\]+$/, '')}/.karna-project`
    await writeDesktopFileText(markerPath, '')
  } catch {
    // Best effort directory creation via marker file
  }
}

async function initializeTemplateFiles(projectPath: string, template: ProjectTemplate, projectName: string): Promise<void> {
  for (const file of template.files) {
    try {
      const fullPath = `${projectPath.replace(/[/\\]+$/, '')}/${file.path.replace(/^\//, '')}`

      if (file.path.endsWith('/')) {
        await ensureDirectory(fullPath)
      } else {
        const parentDir = fullPath.split(/[/\\]/).slice(0, -1).join('/')

        if (parentDir) {
          await ensureDirectory(parentDir)
        }

        const content = processTemplateContent(file.content, projectName)
        await writeDesktopFileText(fullPath, content)
      }
    } catch (err) {
      console.warn(`Failed to create ${file.path}:`, err)
    }
  }
}

async function getUserHomeDir(): Promise<string> {
  try {
    const result = await window.hermesDesktop?.settings?.getDefaultProjectDir()

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

export function ProjectWizardOverlay({ open, onClose, onCreated }: ProjectWizardOverlayProps) {
  const [step, setStep] = useState<'category' | 'template' | 'details'>('category')
  const [category, setCategory] = useState<ProjectCategory | null>(null)
  const [template, setTemplate] = useState<ProjectTemplate | null>(null)
  const [name, setName] = useState('')
  const [location, setLocation] = useState<'karna' | 'documents' | 'custom'>('karna')
  const [customPath, setCustomPath] = useState('')
  const [goal, setGoal] = useState('')
  const [creating, setCreating] = useState(false)
  const [homeDir, setHomeDir] = useState('')

  const categoryTemplates = useMemo(() => category ? getCategoryTemplates(category) : [], [category])

  const karnaProjectsRoot = useMemo(() => {
    return homeDir ? `${homeDir}\\Documents\\Karna\\Projects` : ''
  }, [homeDir])

  const documentsRoot = useMemo(() => {
    return homeDir ? `${homeDir}\\Documents` : ''
  }, [homeDir])

  const projectPath = useMemo(() => {
    if (!name.trim()) {return ''}

    if (location === 'custom' && customPath) {
      return customPath
    }

    if (location === 'documents' && documentsRoot) {
      return `${documentsRoot}\\${name.trim()}`
    }

    if (karnaProjectsRoot) {
      return `${karnaProjectsRoot}\\${name.trim()}`
    }

    return name.trim()
  }, [name, location, customPath, karnaProjectsRoot, documentsRoot])

  useEffect(() => {
    if (open) {
      setStep('category')
      setCategory(null)
      setTemplate(null)
      setName('')
      setLocation('karna')
      setCustomPath('')
      setGoal('')
      void getUserHomeDir().then(dir => setHomeDir(dir))
    }
  }, [open])

  if (!open) {return null}

  const pickCustomFolder = async () => {
    const paths = await selectDesktopPaths({ directories: true, multiple: false, title: L.pickFolder })

    if (paths[0]) {setCustomPath(paths[0])}
  }

  const canProceed = () => {
    if (step === 'category') {return category !== null}

    if (step === 'template') {return template !== null}

    if (step === 'details') {return name.trim().length > 0 && (location !== 'custom' || customPath.trim().length > 0)}

    return false
  }

  const handleNext = () => {
    if (step === 'category' && category) {setStep('template')}
    else if (step === 'template' && template) {setStep('details')}
  }

  const handleBack = () => {
    if (step === 'details') {setStep('template')}
    else if (step === 'template') {setStep('category')}
  }

  const create = async () => {
    if (!name.trim() || !template) {return}
    setCreating(true)

    try {
      const folderPath = projectPath

      const project = await createProject({
        name: name.trim(),
        primaryPath: folderPath,
        folders: folderPath ? [folderPath] : [],
        description: goal.trim() || undefined,
        use: true,
        idea: goal.trim() || undefined,
        color: COLOR_CLASSES[template.color] ? template.color : undefined,
        icon: template.icon
      })

      if (project && folderPath) {
        notify({ kind: 'info', title: L.creatingFiles, message: folderPath })
        await initializeTemplateFiles(folderPath, template, name.trim())
      }

      if (project && category === 'creative') {
        try {
          await window.karnaDesktop.api({
            path: '/api/writer/projects',
            method: 'POST',
            body: {
              title: name.trim(),
              genre: template.label,
              type: template.type,
              description: goal.trim() || undefined,
              folder: folderPath || undefined,
              workspace_id: project.id
            }
          })
          // Notify again after Karna writer project is created
          window.dispatchEvent(new CustomEvent(PROJECT_CHANGED_EVENT))
        } catch (e) {
          console.warn('Failed to sync creative project to Karna writer:', e)
        }
      }

      if (project) {
        notify({ kind: 'success', title: L.success, message: name.trim() })
        onCreated(project as unknown as WriterProject)
        onClose()
      }
    } catch (error) {
      notifyError(error, L.fail)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[260] grid place-items-center bg-slate-900/20 p-4 backdrop-blur-[2px] [-webkit-app-region:no-drag] [&_*]:[-webkit-app-region:no-drag] dark:bg-slate-950/40"
      onMouseDown={event => { if (event.target === event.currentTarget && !creating) {onClose()} }}
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-white to-violet-50 px-6 py-5 dark:border-slate-800 dark:from-slate-900 dark:to-violet-950/30">
          <div>
            <h2 className="text-lg font-semibold">{L.title}</h2>
            <div className="mt-2 flex items-center gap-2">
              <StepIndicator active={step === 'category'} done={step !== 'category'} label="1" />
              <div className={cn('h-px w-8', step !== 'category' ? 'bg-violet-400' : 'bg-slate-200 dark:bg-slate-700')} />
              <StepIndicator active={step === 'template'} done={step === 'details'} label="2" />
              <div className={cn('h-px w-8', step === 'details' ? 'bg-violet-400' : 'bg-slate-200 dark:bg-slate-700')} />
              <StepIndicator active={step === 'details'} done={false} label="3" />
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
          {step === 'category' && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{L.stepCategory}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <CategoryCard
                  active={category === 'general'}
                  color="sky"
                  description={L.categoryGeneralDesc}
                  icon="folder"
                  label={L.categoryGeneral}
                  onClick={() => setCategory('general')}
                />
                <CategoryCard
                  active={category === 'creative'}
                  color="violet"
                  description={L.categoryCreativeDesc}
                  icon="edit"
                  label={L.categoryCreative}
                  onClick={() => setCategory('creative')}
                />
              </div>
            </div>
          )}

          {step === 'template' && template === null && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{L.stepTemplate}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {categoryTemplates.map(t => (
                  <TemplateCard
                    key={t.type}
                    onClick={() => setTemplate(t)}
                    selected={false}
                    template={t}
                  />
                ))}
              </div>
            </div>
          )}

          {step === 'details' && template && (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">{L.name} <span className="text-rose-500">*</span></span>
                  <input
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none transition-colors focus:border-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-violet-500"
                    onChange={event => setName(event.target.value)}
                    placeholder={L.namePlaceholder}
                    value={name}
                  />
                </label>
                <div className="grid gap-1.5 text-sm">
                  <span className="font-medium">项目类型</span>
                  <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2.5', COLOR_CLASSES[template.color].border, COLOR_CLASSES[template.color].bg)}>
                    <span className={cn('grid size-7 place-items-center rounded-md', COLOR_CLASSES[template.color].iconBg)}>
                      <Codicon name={template.icon} size={16} />
                    </span>
                    <span className={cn('font-medium', COLOR_CLASSES[template.color].text)}>{template.label}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-sm font-medium">{L.location}</span>
                <div className="grid gap-2">
                  <LocationOption
                    active={location === 'karna'}
                    description={L.locationKarnaDesc}
                    icon="home"
                    label={L.locationKarna}
                    onClick={() => setLocation('karna')}
                    path={karnaProjectsRoot}
                  />
                  <LocationOption
                    active={location === 'documents'}
                    description={L.locationDocumentsDesc}
                    icon="library"
                    label={L.locationDocuments}
                    onClick={() => setLocation('documents')}
                    path={documentsRoot}
                  />
                  <LocationOption
                    active={location === 'custom'}
                    description={L.locationCustomDesc}
                    icon="folder-opened"
                    label={L.locationCustom}
                    onClick={() => setLocation('custom')}
                    path={customPath}
                  >
                    {location === 'custom' && (
                      <div className="mt-2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <Button onClick={() => void pickCustomFolder()} size="sm" type="button" variant="outline">
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
                <span className="font-medium">{L.goal}</span>
                <textarea
                  className="min-h-20 rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none transition-colors focus:border-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:focus:border-violet-500"
                  onChange={event => setGoal(event.target.value)}
                  placeholder={L.goalPlaceholder}
                  value={goal}
                />
              </label>

              <div className="space-y-2">
                <span className="text-sm font-medium">{L.filesPreview}</span>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                  <FileTree files={template.files} />
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="flex justify-between gap-2 border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div>
            {step !== 'category' && (
              <Button disabled={creating} onClick={handleBack} variant="ghost">
                <Codicon name="arrow-left" size={14} />
                <span className="ml-1.5">{L.back}</span>
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button disabled={creating} onClick={onClose} variant="ghost">{L.cancel}</Button>
            {step !== 'details' ? (
              <Button disabled={!canProceed() || creating} onClick={handleNext}>
                {L.next}
                <Codicon name="arrow-right" size={14} />
              </Button>
            ) : (
              <Button disabled={!canProceed() || creating} onClick={() => void create()}>
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

interface CategoryCardProps {
  active: boolean
  color: 'sky' | 'violet'
  description: string
  icon: string
  label: string
  onClick: () => void
}

function CategoryCard({ active, color, description, icon, label, onClick }: CategoryCardProps) {
  const colors = COLOR_CLASSES[color]

  return (
    <button
      className={cn(
        'group flex items-start gap-4 rounded-xl border-2 p-5 text-left transition-all',
        active
          ? `${colors.selectedBorder} ${colors.selectedBg} shadow-md`
          : `border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/50`
      )}
      onClick={onClick}
      type="button"
    >
      <div className={cn('grid size-12 shrink-0 place-items-center rounded-xl text-xl', colors.iconBg)}>
        <Codicon name={icon} size={24} />
      </div>
      <div>
        <div className={cn('text-base font-semibold', active ? colors.text : 'text-slate-900 dark:text-slate-100')}>{label}</div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</div>
      </div>
      {active && (
        <div className="ml-auto">
          <Codicon className={colors.text} name="check" size={20} />
        </div>
      )}
    </button>
  )
}

function TemplateCard({ onClick, selected, template }: { onClick: () => void; selected: boolean; template: ProjectTemplate }) {
  const colors = COLOR_CLASSES[template.color]

  return (
    <button
      className={cn(
        'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
        selected
          ? `${colors.selectedBorder} ${colors.selectedBg} shadow-md`
          : `border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700`
      )}
      onClick={onClick}
      type="button"
    >
      <div className={cn('grid size-10 shrink-0 place-items-center rounded-lg', colors.iconBg)}>
        <Codicon name={template.icon} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn('text-sm font-semibold', selected ? colors.text : 'text-slate-900 dark:text-slate-100')}>{template.label}</div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{template.description}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {template.files.filter(f => f.required).slice(0, 4).map(f => (
            <span className="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[0.6rem] text-slate-500 dark:bg-slate-800 dark:text-slate-400" key={f.path}>
              {f.path.endsWith('/') ? <Codicon className="text-amber-500" name="file-directory" size={10} /> : <Codicon className="text-sky-500" name="file" size={10} />}
              {f.path.split('/').filter(Boolean).pop()}
            </span>
          ))}
          {template.files.filter(f => f.required).length > 4 && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.6rem] text-slate-500 dark:bg-slate-800 dark:text-slate-400">...</span>
          )}
        </div>
      </div>
    </button>
  )
}

interface LocationOptionProps {
  active: boolean
  children?: React.ReactNode
  description: string
  icon: string
  label: string
  onClick: () => void
  path?: string
}

function LocationOption({ active, children, description, icon, label, onClick, path }: LocationOptionProps) {
  return (
    <button
      className={cn(
        'rounded-xl border p-4 text-left transition-all',
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

function FileTree({ files }: { files: ProjectTemplate['files'] }) {
  const structure = useMemo(() => {
    const root: { [key: string]: { type: 'file' | 'dir'; children?: { [key: string]: any }; required?: boolean } } = {}

    for (const file of files) {
      const parts = file.path.split('/').filter(Boolean)
      let current = root

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        const isFile = i === parts.length - 1 && !file.path.endsWith('/')
        const isDir = i < parts.length - 1 || file.path.endsWith('/')

        if (!current[part]) {
          current[part] = { type: isDir ? 'dir' : 'file', children: isDir ? {} : undefined, required: file.required }
        }

        if (isDir && current[part].children) {
          current = current[part].children
        }
      }
    }

    return root
  }, [files])

  return (
    <div className="font-mono text-xs">
      <TreeLevel level={0} structure={structure} />
    </div>
  )
}

function TreeLevel({ level, structure }: { level: number; structure: { [key: string]: any } }) {
  return (
    <>
      {Object.entries(structure).map(([name, node]) => (
        <div key={name} style={{ paddingLeft: `${level * 16}px` }}>
          <div className="flex items-center gap-1.5 py-0.5">
            {node.type === 'dir' ? (
              <Codicon className="text-amber-500" name="file-directory" size={12} />
            ) : (
              <Codicon className="text-sky-500" name="file" size={12} />
            )}
            <span className={cn(node.type === 'dir' ? 'text-slate-700 dark:text-slate-300' : 'text-slate-600 dark:text-slate-400')}>
              {name}
            </span>
            {node.required && (
              <span className="ml-1 rounded bg-violet-100 px-1 text-[0.55rem] text-violet-600 dark:bg-violet-900/40 dark:text-violet-400">
                模板
              </span>
            )}
          </div>
          {node.children && Object.keys(node.children).length > 0 && (
            <TreeLevel level={level + 1} structure={node.children} />
          )}
        </div>
      ))}
    </>
  )
}
