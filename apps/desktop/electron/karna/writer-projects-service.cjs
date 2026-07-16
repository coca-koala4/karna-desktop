/* eslint-disable no-unused-vars -- partial compatibility API keeps its public parameters. */
'use strict'

function createWriterProjectsService({ fs, path, karnaPaths, storage }) {
  const writerProjectsFile = () => path.join(karnaPaths.dataRoot, 'writer_projects.json')
  const projectsDir = () => path.join(karnaPaths.dataRoot, 'writer-projects')

  function listProjects() {
    try {
      const data = storage.readJsonFile(writerProjectsFile(), { projects: [] })
      return data.projects || []
    } catch {
      return []
    }
  }

  function getProject(id) {
    const projects = listProjects()
    return projects.find(p => p.id === id) || null
  }

  function getProjectTree(projectId) {
    return []
  }

  function getProjectVersions(projectId) {
    try {
      const project = getProject(projectId)
      if (!project || !project.folder) {
        return []
      }
      const versionsDir = path.join(project.folder, 'versions')
      if (!fs.existsSync(versionsDir)) {
        return []
      }
      const entries = fs.readdirSync(versionsDir, { withFileTypes: true })
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
    } catch {
      return []
    }
  }

  function exportProject(projectId, format) {
    return { ok: true, path: '' }
  }

  return { listProjects, getProject, getProjectTree, getProjectVersions, exportProject }
}

module.exports = { createWriterProjectsService }
