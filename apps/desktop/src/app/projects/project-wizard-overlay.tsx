import { type CSSProperties, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { notify, notifyError } from '@/store/notifications'

interface ResourceRow { id: string; name: string; description?: string; folder?: string; path?: string; vectorized?: boolean; enabled?: boolean }
interface ProjectWizardOverlayProps { open: boolean; onClose: () => void; onCreated: (project: WriterProject) => void }
export interface WriterProjectAgent { id: string; name: string; role: string; brief?: string; persona?: string; skills?: string[]; mcp?: string[]; enabled?: boolean; session_id?: string | null; status?: string; status_label?: string; status_detail?: string }
export interface WriterProject { id: string; title: string; slug: string; type: string; folder: string; main_session_id?: string; session_ids?: string[]; agent_session_ids?: Record<string, string>; multi_agent_enabled?: boolean; agents?: WriterProjectAgent[]; tasks?: { tasks?: Array<{ id: string; status: string }> } }

const L = {
  title: '新建作品项目',
  close: '关闭',
  desc: '创建作品级命名空间、主控会话和本地项目目录。多 Agent 编排请到「多 Agent 工坊」单独配置。',
  name: '作品名',
  type: '作品类型',
  workspace: '工作环境',
  newFolder: '新建项目文件夹',
  existingFolder: '选择已有工作环境',
  pick: '选择文件夹',
  notSelected: '未选择',
  importMd: '可选：导入已有稿件/资料目录',
  importHint: '只复制 .md/.markdown/.txt 到项目 imports，不覆盖原稿，也不会自动上传全文。',
  knowledge: '可选：绑定已有知识库',
  knowledgeHint: '默认只使用当前项目命名空间；跨项目资料必须在这里显式选择。',
  refresh: '刷新',
  cancel: '取消',
  create: '创建作品项目',
  creating: '创建中...',
  success: '作品项目已创建',
  fail: '创建作品项目失败',
  goal: '创作目标 / 项目说明',
  projectExample: '例如：长篇小说《海边的机械鸟》',
  goalPlaceholder: '写下题材、体裁、目标读者、截止日期或当前创作阶段。Karna 会保存为项目说明，不会自动生成正文。',
  statusNew: '新建文件夹会放在 Karna writer-projects 下，并初始化 bible、imports、versions、privacy 等目录。',
  statusExisting: '请选择已有工作环境文件夹；Karna 会在其中初始化项目数据。',
  noKb: '还没有已嵌入的知识库。可以先创建项目，稍后在作品工坊导入稿件。'
}

const TYPE_OPTIONS = [['web-novel', '网文'], ['novel', '小说'], ['paper', '论文'], ['screenplay', '剧本'], ['copywriting', '文案'], ['poetry', '诗歌'], ['editorial', '编辑项目']] as const

function toggleValue(list: string[], value: string) {
  return list.includes(value) ? list.filter(item => item !== value) : [...list, value]
}

export function ProjectWizardOverlay({ open, onClose, onCreated }: ProjectWizardOverlayProps) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('web-novel')
  const [workspaceMode, setWorkspaceMode] = useState<'new' | 'existing'>('new')
  const [root, setRoot] = useState('')
  const [importFolder, setImportFolder] = useState('')
  const [goal, setGoal] = useState('')
  const [knowledgeIds, setKnowledgeIds] = useState<string[]>([])
  const [resources, setResources] = useState<{ knowledge: ResourceRow[] }>({ knowledge: [] })
  const [creating, setCreating] = useState(false)

  const refreshResources = async () => {
    const result = await window.karnaDesktop.api<{ ok: boolean; knowledge: ResourceRow[] }>({ path: '/api/writer/resources' })
    setResources({ knowledge: result.knowledge || [] })
  }
  useEffect(() => { if (open) void refreshResources().catch(() => undefined) }, [open])
  if (!open) return null

  const pickFolder = async (setter: (value: string) => void) => {
    const paths = await window.karnaDesktop.selectPaths({ directories: true, multiple: false, title: L.pick })
    if (paths[0]) setter(paths[0])
  }

  const create = async () => {
    if (!title.trim()) return
    setCreating(true)
    try {
      const selectedKnowledge = resources.knowledge.filter(row => knowledgeIds.includes(row.id))
      const response = await window.karnaDesktop.api<{ ok: boolean; error?: string; project?: WriterProject }>({
        path: '/api/writer/projects',
        method: 'POST',
        body: {
          title: title.trim(),
          type,
          workspaceMode,
          root: root || undefined,
          importFolder: importFolder || undefined,
          goal: goal.trim() || undefined,
          knowledgeIds,
          knowledgeFolders: selectedKnowledge.map(row => row.folder).filter(Boolean),
          multiAgentEnabled: false,
          coordinationMode: 'manual',
          agents: []
        }
      })
      if (!response.ok || !response.project) throw new Error(response.error || L.fail)
      notify({ kind: 'success', title: L.success, message: response.project.title })
      onCreated(response.project)
      onClose()
    } catch (error) {
      notifyError(error, L.fail)
    } finally {
      setCreating(false)
    }
  }

  return <div className="fixed inset-0 z-[260] grid place-items-center bg-slate-900/20 p-4 backdrop-blur-[2px] [-webkit-app-region:no-drag] [&_*]:[-webkit-app-region:no-drag]" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties} onMouseDown={event => { if (event.target === event.currentTarget && !creating) onClose() }}>
    <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl" onMouseDown={event => event.stopPropagation()}>
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-white to-violet-50 px-5 py-4"><div><h2 className="text-base font-semibold">{L.title}</h2><p className="mt-1 text-xs text-slate-500">{L.desc}</p></div><button className="rounded-md px-2 py-1 text-sm hover:bg-slate-100" disabled={creating} onClick={onClose} type="button">{L.close}</button></header>
      <div className="grid gap-4 overflow-auto px-5 py-4">
        <div className="grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-sm"><span>{L.name}</span><input className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-violet-400" onMouseDown={event => event.currentTarget.focus()} onChange={event => setTitle(event.target.value)} placeholder={L.projectExample} value={title} /></label><label className="grid gap-1 text-sm"><span>{L.type}</span><select className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none" onChange={event => setType(event.target.value)} value={type}>{TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="mb-2 text-sm font-medium">{L.workspace}</div><div className="flex flex-wrap gap-3 text-sm"><label className="flex items-center gap-2"><input checked={workspaceMode === 'new'} onChange={() => setWorkspaceMode('new')} type="radio" />{L.newFolder}</label><label className="flex items-center gap-2"><input checked={workspaceMode === 'existing'} onChange={() => setWorkspaceMode('existing')} type="radio" />{L.existingFolder}</label></div><p className="mt-2 text-xs text-slate-500">{workspaceMode === 'new' ? L.statusNew : L.statusExisting}</p>{workspaceMode === 'existing' && <div className="mt-2 flex items-center gap-2"><Button onClick={() => void pickFolder(setRoot)} size="sm" type="button" variant="outline">{L.pick}</Button><span className="truncate text-xs text-slate-600">{root || L.notSelected}</span></div>}</section>
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="mb-2 text-sm font-medium">{L.importMd}</div><p className="mb-2 text-xs text-slate-500">{L.importHint}</p><div className="flex items-center gap-2"><Button onClick={() => void pickFolder(setImportFolder)} size="sm" type="button" variant="outline">{L.pick}</Button><span className="truncate text-xs text-slate-600">{importFolder || L.notSelected}</span></div></section>
        <label className="grid gap-1 text-sm"><span>{L.goal}</span><textarea className="min-h-24 rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-violet-400" onMouseDown={event => event.currentTarget.focus()} onChange={event => setGoal(event.target.value)} placeholder={L.goalPlaceholder} value={goal} /></label>
        <section className="rounded-xl border border-slate-200 bg-white p-3"><div className="mb-2 flex items-center justify-between"><div><strong className="text-sm">{L.knowledge}</strong><p className="text-xs text-slate-500">{L.knowledgeHint}</p></div><Button onClick={() => void refreshResources()} size="sm" variant="outline">{L.refresh}</Button></div><div className="grid gap-2">{resources.knowledge.length ? resources.knowledge.map(row => <label className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" key={row.id}><span className="min-w-0"><span className="block truncate">{row.name}</span><span className="block truncate text-xs text-slate-500">{row.folder}</span></span><input checked={knowledgeIds.includes(row.id)} onChange={() => setKnowledgeIds(current => toggleValue(current, row.id))} type="checkbox" /></label>) : <div className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">{L.noKb}</div>}</div></section>
      </div><footer className="flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4"><Button disabled={creating} onClick={onClose} variant="ghost">{L.cancel}</Button><Button disabled={creating || !title.trim() || (workspaceMode === 'existing' && !root)} onClick={() => void create()}>{creating ? L.creating : L.create}</Button></footer>
    </div>
  </div>
}
