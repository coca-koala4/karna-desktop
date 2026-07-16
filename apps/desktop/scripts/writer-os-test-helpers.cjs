const DEFAULT_TEST_PROJECT_TITLE = 'Writer OS Smoke Lab'

async function resolveWriterOsProject(adapter, preferred = '') {
  const target = preferred || process.argv[2] || process.env.KARNA_WRITER_PROJECT || DEFAULT_TEST_PROJECT_TITLE
  const projects = await adapter.handleKarnaApiRequest({ path: '/api/writer/projects?includeArchived=1', method: 'GET' })
  const list = projects.projects || []
  let project = list.find(p => p.slug === target || p.id === target || p.title === target)
  if (!project && target === DEFAULT_TEST_PROJECT_TITLE) {
    const created = await adapter.handleKarnaApiRequest({
      path: '/api/writer/projects',
      method: 'POST',
      body: { title: DEFAULT_TEST_PROJECT_TITLE, type: 'novel' }
    })
    project = created.project
  }
  if (!project) project = list[0]
  if (!project) throw new Error('No writer project found. Create a Writer OS project first.')
  return { project, ref: encodeURIComponent(project.slug || project.id), target }
}

async function bootstrapWriterOsProject(adapter, ref, options = {}) {
  const repair = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/os/guide`,
    method: 'POST',
    body: { action: 'repair', confirmWiki: true, all: true, provider: 'local', ...(options.repair || {}) }
  })
  const canon = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/os/guide`,
    method: 'POST',
    body: { action: 'run-step', step: 'canon_review', all: true }
  })
  const benchmark = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/os/benchmark`,
    method: 'POST',
    body: {}
  })
  return { repair, canon, benchmark }
}

module.exports = { DEFAULT_TEST_PROJECT_TITLE, resolveWriterOsProject, bootstrapWriterOsProject }
