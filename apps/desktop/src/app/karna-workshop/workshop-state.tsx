import { useCallback, useEffect, useState } from 'react'

import { notify, notifyError } from '@/store/notifications'

import type { ProjectSummary } from './project-picker'

/**
 * Shared data layer for the Writer Workshop.
 *
 * One hook owns the project list + active project id and exposes a single
 * `api<T>(...)` call surface for every panel to use, so a panel can stay
 * focused on its own UI without knowing about how projects are switched.
 */

export interface WriterProject extends ProjectSummary {}

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  return window.karnaDesktop.api<T>({ path, method, body })
}

export function projectRef(project: WriterProject | null) {
  return project?.slug || project?.id || ''
}

export function useWorkshopState() {
  const [projects, setProjects] = useState<WriterProject[]>([])
  const [activeId, setActiveId] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refreshProjects = useCallback(async () => {
    setBusy('refresh-projects')

    try {
      const result = await api<{ projects?: WriterProject[]; active_project_id?: string }>('/api/writer/projects?includeArchived=1')
      const rows = result.projects || []
      setProjects(rows)
      setActiveId(current => {
        if (current && rows.some(p => p.id === current)) {return current}

        return result.active_project_id || rows[0]?.id || ''
      })
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      notifyError(err, '加载项目失败')
    } finally {
      setBusy('')
    }
  }, [])

  useEffect(() => { void refreshProjects() }, [refreshProjects])

  const selectProject = useCallback((project: WriterProject) => {
    setActiveId(project.id)
  }, [])

  const active = projects.find(p => p.id === activeId) || null

  return { active, activeId, api, busy, error, projects, refreshProjects, selectProject, setActiveId, setBusy, setProjects }
}

export function useProjectAction<T>(
  busyKey: string,
  busy: string,
  setBusy: (v: string) => void,
  fn: () => Promise<T>,
  errorLabel: string
) {
  return useCallback(async () => {
    if (busy) {return}
    setBusy(busyKey)

    try {
      return await fn()
    } catch (err) {
      notifyError(err, errorLabel)
      throw err
    } finally {
      setBusy('')
    }
  }, [busy, busyKey, errorLabel, fn, setBusy])
}

export { api, notify }
