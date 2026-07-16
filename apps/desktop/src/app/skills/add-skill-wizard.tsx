import type * as React from 'react'
import { useCallback, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  commitSkillImport,
  createSkillDirect,
  preflightSkillImport,
  type SkillImportDetectedSkill,
  type SkillImportPreflightResult
} from '@/hermes'
import { notify, notifyError } from '@/store/notifications'

type AddSkillStep = 'source' | 'input' | 'preflight' | 'result'
type ImportSource = 'scratch' | 'markdown' | 'archive' | 'github'

interface AddSkillWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSkillsChanged: () => void
}

const SOURCE_OPTIONS: Array<{
  id: ImportSource
  title: string
  description: string
  icon: string
}> = [
  { id: 'scratch', title: '从零创建', description: '填写名称和指令，创建全新技能', icon: 'add' },
  { id: 'markdown', title: 'Markdown 文件', description: '导入已有的 SKILL.md 或技能 Markdown', icon: 'file' },
  { id: 'archive', title: '压缩包', description: '从 ZIP 压缩包导入一个或多个技能', icon: 'file-zip' },
  { id: 'github', title: 'GitHub 链接', description: '从 GitHub 仓库导入技能', icon: 'github' }
]

export function AddSkillWizard({ open, onOpenChange, onSkillsChanged }: AddSkillWizardProps) {
  const [step, setStep] = useState<AddSkillStep>('source')
  const [source, setSource] = useState<ImportSource | null>(null)
  const [preflightResult, setPreflightResult] = useState<SkillImportPreflightResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [importResult, setImportResult] = useState<{ importedCount: number } | null>(null)

  const [scratchName, setScratchName] = useState('')
  const [scratchDesc, setScratchDesc] = useState('')
  const [scratchWhenToUse, setScratchWhenToUse] = useState('')
  const [scratchInstructions, setScratchInstructions] = useState('')
  const [scratchCategory, setScratchCategory] = useState('general')

  const [markdownPath, setMarkdownPath] = useState('')
  const [archivePath, setArchivePath] = useState('')
  const [githubUrl, setGithubUrl] = useState('')

  const reset = useCallback(() => {
    setStep('source')
    setSource(null)
    setPreflightResult(null)
    setImportResult(null)
    setIsProcessing(false)
    setScratchName('')
    setScratchDesc('')
    setScratchWhenToUse('')
    setScratchInstructions('')
    setScratchCategory('general')
    setMarkdownPath('')
    setArchivePath('')
    setGithubUrl('')
  }, [])

  const handleClose = useCallback(() => {
    onOpenChange(false)
    setTimeout(reset, 300)
  }, [onOpenChange, reset])

  const handleFileSelect = useCallback((type: 'markdown' | 'archive', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const filePath = (file as File & { path?: string }).path
      if (filePath) {
        if (type === 'markdown') {
          setMarkdownPath(filePath)
        } else {
          setArchivePath(filePath)
        }
      } else {
        notify({
          kind: 'warning',
          title: '无法获取文件路径',
          message: '请尝试手动输入文件完整路径'
        })
      }
    }
  }, [])

  const runPreflight = useCallback(async () => {
    if (!source) return

    setIsProcessing(true)
    try {
      let input: Parameters<typeof preflightSkillImport>[0]

      switch (source) {
        case 'scratch':
          if (!scratchName.trim()) {
            notifyError(new Error('请填写技能名称'), '缺少信息')
            setIsProcessing(false)
            return
          }
          input = {
            type: 'scratch',
            content: {
              name: scratchName.trim(),
              description: scratchDesc.trim() || undefined,
              instructions: scratchInstructions.trim() || undefined,
              whenToUse: scratchWhenToUse.trim() || undefined,
              category: scratchCategory.trim() || 'general'
            }
          }
          break
        case 'markdown':
          if (!markdownPath.trim()) {
            notifyError(new Error('请选择或输入 Markdown 文件路径'), '缺少信息')
            setIsProcessing(false)
            return
          }
          input = { type: 'markdown', filePath: markdownPath.trim() }
          break
        case 'archive':
          if (!archivePath.trim()) {
            notifyError(new Error('请选择或输入压缩包路径'), '缺少信息')
            setIsProcessing(false)
            return
          }
          input = { type: 'archive', filePath: archivePath.trim() }
          break
        case 'github':
          if (!githubUrl.trim()) {
            notifyError(new Error('请输入 GitHub URL'), '缺少信息')
            setIsProcessing(false)
            return
          }
          input = { type: 'github', url: githubUrl.trim() }
          break
      }

      const result = await preflightSkillImport(input)
      setPreflightResult(result)

      if (result.blockedReasons.length > 0) {
        notifyError(new Error(result.blockedReasons.join('; ')), '预检失败')
      } else {
        setStep('preflight')
      }
    } catch (err) {
      notifyError(err, '预检失败')
    } finally {
      setIsProcessing(false)
    }
  }, [source, scratchName, scratchDesc, scratchInstructions, scratchWhenToUse, scratchCategory, markdownPath, archivePath, githubUrl])

  const handleCommit = useCallback(async () => {
    if (!preflightResult?.jobId) {
      if (source === 'scratch' && scratchName.trim()) {
        setIsProcessing(true)
        try {
          const result = await createSkillDirect({
            name: scratchName.trim(),
            description: scratchDesc.trim() || undefined,
            instructions: scratchInstructions.trim() || undefined,
            whenToUse: scratchWhenToUse.trim() || undefined,
            category: scratchCategory.trim() || 'general'
          })
          if (result.ok) {
            setImportResult({ importedCount: 1 })
            setStep('result')
            onSkillsChanged()
          } else {
            notifyError(new Error(result.error || '创建失败'), '创建失败')
          }
        } catch (err) {
          notifyError(err, '创建失败')
        } finally {
          setIsProcessing(false)
        }
        return
      }
      return
    }

    setIsProcessing(true)
    try {
      const result = await commitSkillImport(preflightResult.jobId)
      if (result.ok && result.receipt) {
        setImportResult({ importedCount: result.receipt.importedSkills.length })
        setStep('result')
        onSkillsChanged()
        notify({
          kind: 'success',
          title: '导入成功',
          message: `成功导入 ${result.receipt.importedSkills.length} 个技能`
        })
      } else {
        notifyError(new Error(result.error || '导入失败'), '导入失败')
      }
    } catch (err) {
      notifyError(err, '导入失败')
    } finally {
      setIsProcessing(false)
    }
  }, [preflightResult, source, scratchName, scratchDesc, scratchInstructions, scratchWhenToUse, scratchCategory, onSkillsChanged])

  const canProceed = () => {
    switch (source) {
      case 'scratch': return scratchName.trim().length > 0
      case 'markdown': return markdownPath.trim().length > 0
      case 'archive': return archivePath.trim().length > 0
      case 'github': return githubUrl.trim().length > 0
      default: return false
    }
  }

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>添加技能</DialogTitle>
        </DialogHeader>

        {step === 'source' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">选择添加技能的方式</p>
            <div className="grid grid-cols-2 gap-3">
              {SOURCE_OPTIONS.map(option => (
                <button
                  className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:border-[var(--ui-accent)] ${
                    source === option.id ? 'border-[var(--ui-accent)] bg-[var(--ui-accent)]/5' : 'border-[var(--dt-border)]'
                  }`}
                  key={option.id}
                  onClick={() => setSource(option.id)}
                  type="button"
                >
                  <Codicon name={option.icon} size="1.25rem" />
                  <div className="font-medium">{option.title}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'input' && source === 'scratch' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">技能名称 *</label>
              <Input
                onChange={e => setScratchName(e.target.value)}
                placeholder="例如：角色起名助手"
                value={scratchName}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">技能描述</label>
              <Input
                onChange={e => setScratchDesc(e.target.value)}
                placeholder="一句话描述这个技能的用途"
                value={scratchDesc}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">适用场景</label>
              <Textarea
                onChange={e => setScratchWhenToUse(e.target.value)}
                placeholder="描述什么时候应该使用这个技能"
                rows={2}
                value={scratchWhenToUse}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">详细指令</label>
              <Textarea
                onChange={e => setScratchInstructions(e.target.value)}
                placeholder="详细描述技能的操作步骤和要求"
                rows={6}
                value={scratchInstructions}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">分类</label>
              <Input
                onChange={e => setScratchCategory(e.target.value)}
                placeholder="general"
                value={scratchCategory}
              />
            </div>
            <div className="rounded-lg bg-[var(--theme-card-seed)] p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">SKILL.md 预览</div>
              <pre className="max-h-40 overflow-auto text-xs font-mono text-muted-foreground">
{`---
name: ${scratchName || 'skill-name'}
description: ${scratchDesc || '技能描述'}
---

# ${scratchName || '技能名称'}

${scratchDesc || '技能描述'}

## 使用时机

${scratchWhenToUse || '当用户需要相应帮助时使用。'}

## 操作步骤

${scratchInstructions || '1. 理解用户需求\n2. 执行相应操作\n3. 返回结果'}
`}
              </pre>
            </div>
          </div>
        )}

        {step === 'input' && source === 'markdown' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">选择 Markdown 文件</label>
              <div className="flex gap-2">
                <Input
                  onChange={e => setMarkdownPath(e.target.value)}
                  placeholder="选择或输入 .md 文件路径"
                  value={markdownPath}
                />
                <label className="cursor-pointer">
                  <Input
                    accept=".md,.markdown,.txt"
                    className="hidden"
                    onChange={e => handleFileSelect('markdown', e)}
                    type="file"
                  />
                  <Button size="sm" type="button" variant="secondary">
                    <Codicon name="folder" size="0.875rem" /> 浏览
                  </Button>
                </label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              选择包含 SKILL.md 格式的 Markdown 文件，系统将解析 front matter 中的名称和描述。
            </p>
          </div>
        )}

        {step === 'input' && source === 'archive' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">选择压缩包文件</label>
              <div className="flex gap-2">
                <Input
                  onChange={e => setArchivePath(e.target.value)}
                  placeholder="选择 .zip 文件路径"
                  value={archivePath}
                />
                <label className="cursor-pointer">
                  <Input
                    accept=".zip,.tar.gz,.tgz"
                    className="hidden"
                    onChange={e => handleFileSelect('archive', e)}
                    type="file"
                  />
                  <Button size="sm" type="button" variant="secondary">
                    <Codicon name="folder" size="0.875rem" /> 浏览
                  </Button>
                </label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              支持 ZIP 格式压缩包。压缩包内应包含 SKILL.md 文件，支持一次导入多个技能。系统会安全解压并检查路径穿越。
            </p>
          </div>
        )}

        {step === 'input' && source === 'github' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">GitHub 仓库链接</label>
              <Input
                onChange={e => setGithubUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                value={githubUrl}
              />
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>支持的 URL 格式：</p>
              <ul className="list-inside list-disc space-y-1">
                <li>仓库主页：https://github.com/owner/repo</li>
                <li>特定分支：https://github.com/owner/repo/tree/main</li>
                <li>特定目录：https://github.com/owner/repo/tree/main/skills/my-skill</li>
              </ul>
              <p className="mt-2">注意：GitHub 导入需要网络连接，将下载仓库归档。</p>
            </div>
          </div>
        )}

        {step === 'preflight' && preflightResult && (
          <div className="space-y-4 py-2">
            <h3 className="text-sm font-medium">预检结果</h3>

            {preflightResult.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <div className="mb-1 text-xs font-medium text-amber-600">警告</div>
                <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
                  {preflightResult.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {preflightResult.conflicts.length > 0 && (
              <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-3">
                <div className="mb-1 text-xs font-medium text-orange-600">冲突</div>
                <ul className="space-y-1 text-xs">
                  {preflightResult.conflicts.map((conflict, i) => (
                    <li key={i}>
                      <span className="font-medium">{conflict.name}</span>: {conflict.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/50 p-3">
              <div className="mb-2 text-xs font-medium">检测到的技能</div>
              <div className="space-y-2">
                {preflightResult.detectedSkills.map((skill: SkillImportDetectedSkill, i: number) => (
                  <div className="flex items-start gap-2 rounded border border-[var(--dt-border)] p-2" key={i}>
                    <Badge className="mt-0.5 h-4 shrink-0 px-1 text-[9px] bg-violet-500/10 text-violet-500 border-0">
                      {skill.sourceType}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{skill.name}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{skill.description || '暂无描述'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 'result' && importResult && (
          <div className="space-y-4 py-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              <Codicon className="text-emerald-500" name="check" size="2rem" />
            </div>
            <div>
              <div className="text-lg font-medium">导入成功</div>
              <div className="mt-1 text-sm text-muted-foreground">
                成功导入 {importResult.importedCount} 个技能，已对新会话生效。
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'source' && (
            <>
              <Button onClick={handleClose} type="button" variant="ghost">取消</Button>
              <Button
                disabled={!source}
                onClick={() => setStep('input')}
                type="button"
              >
                下一步
              </Button>
            </>
          )}

          {step === 'input' && (
            <>
              <Button onClick={() => setStep('source')} type="button" variant="ghost">上一步</Button>
              <Button onClick={handleClose} type="button" variant="ghost">取消</Button>
              <Button
                disabled={!canProceed() || isProcessing}
                onClick={() => void runPreflight()}
                type="button"
              >
                {isProcessing ? '检查中…' : '下一步'}
              </Button>
            </>
          )}

          {step === 'preflight' && (
            <>
              <Button onClick={() => setStep('input')} type="button" variant="ghost">上一步</Button>
              <Button onClick={handleClose} type="button" variant="ghost">取消</Button>
              <Button
                disabled={isProcessing || !preflightResult?.canImport}
                onClick={() => void handleCommit()}
                type="button"
              >
                {isProcessing ? '导入中…' : '确认导入'}
              </Button>
            </>
          )}

          {step === 'result' && (
            <Button onClick={handleClose} type="button">完成</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
