'use strict'

function registerApiRoutes(app, deps) {
  const {
    listSessions,
    searchSessions,
    listProfileSessions,
    getSession,
    updateSession,
    deleteSession,
    getSessionMessages,
    getConfig,
    updateConfig,
    getConfigDefaults,
    getConfigSchema,
    getModelInfo,
    getAuxiliaryModels,
    getModelOptions,
    setModel,
    getCustomModels,
    createCustomModel,
    deleteCustomModel,
    updateCustomModel,
    testCustomModel,
    testModelEndpoint,
    getRecommendedDefaultModel,
    listSkills,
    getSkillsCatalog,
    searchSkills,
    createSkill,
    getSkill,
    installSkill,
    toggleSkill,
    uninstallSkill,
    preflightSkillImport,
    commitSkillImport,
    getSkillImportJob,
    createSkillDirect,
    getConnectorDefinitions,
    getConnectorAdvancedDefinitions,
    listConnectorInstances,
    createConnectorInstance,
    testConnectorInstance,
    updateConnectorInstance,
    deleteConnectorInstance,
    callConnectorTool,
    toggleConnectorTool,
    getConnectorAuditLogs,
    healthCheckConnectors,
    routeConnectorCandidates,
    reloadMcpServers,
    listMcpServers,
    createMcpServer,
    testMcpServer,
    updateMcpServer,
    deleteMcpServer,
    getMcpServer,
    getMcpServerTools,
    callBuiltinMcpTool,
    listToolsets,
    getToolsetConfig,
    setToolsetProvider,
    toolsetPostSetup,
    getToolset,
    setToolsetEnabled,
    listPlugins,
    setPluginEnabled,
    getArtifacts,
    updateArtifacts,
    getArtifact,
    deleteArtifact,
    getKnowledge,
    updateKnowledge,
    listKnowledgeLibraries,
    createKnowledgeLibrary,
    renameKnowledgeLibrary,
    importKnowledgeFolder,
    reindexKnowledge,
    searchKnowledge,
    getWriterResources,
    parseWriterPlan,
    enhancePrompt,
    getWorkflowAgentLibrary,
    createWorkflowAgent,
    updateWorkflowAgent,
    deleteWorkflowAgent,
    listWorkflows,
    saveWorkflow,
    updateWorkflowRunNodeAction,
    continueWorkflow,
    getWorkflow,
    updateWorkflow,
    deleteWorkflow,
    resolveWorkflow,
    listSoulAuthors,
    createSoulAuthor,
    fusionSoulPreview,
    getSoulAuthor,
    deleteSoulAuthor,
    importSoulTexts,
    processSoulAuthor,
    searchSoulAuthor,
    webResearchSoulAuthor,
    distillSoulProfile,
    criticSoulText,
    riskCheckSoulText,
    exportSoulSkill,
    exportSoulAuthor,
    listWriterProjects,
    createWriterProject,
    resolveWriterProject,
    setWriterProjectMainSession,
    updateProjectAgent,
    generateProjectTasks,
    getProjectTasks,
    updateProjectTask,
    createProjectSession,
    openProjectFolder,
    importProjectManuscript,
    analyzeProject,
    checkProjectConsistency,
    rewritePreview,
    getProjectBible,
    listProjectSources,
    getProjectFileTree,
    getProjectVersions,
    getWriterProject,
    updateWriterProject,
    deleteWriterProject,
    setActiveWriterProject,
    writerProjectStatus,
    exportWriterProject,
    saveWriterProjectFile,
    handleWriterOsRequest,
    getStatus,
    getElevenlabsVoices,
    getLogs,
    getEnv,
    setEnv,
    deleteEnv,
    revealEnv,
    listOauthProviders,
    handleOauthRequest,
    validateProvider,
    handleMemoryRequest,
    handleMessagingRequest,
    handleCronRequest,
    listCronJobs,
    listProfiles,
    createProfile,
    getActiveProfile,
    getProfileSoul,
    setProfileSoul,
    getProfileSetupCommand,
    renameProfile,
    deleteProfile,
    speakTts,
    generateImage,
    getAnalyticsUsage,
    getAnalytics,
    restartGateway,
    checkForUpdate,
    getActionStatus,
    handleActionRequest,
    transcribeAudio,
    createIngestJob,
    getIngestJob,
    getIngestResult,
    cancelIngestJob,
    getIngestCapabilities,
    materializeIngestResult,
    getUpdatesCheck,
    healthCheck,
    rootHealth
  } = deps

  app.get('/api/sessions/search', searchSessions)
  app.get('/api/sessions', listSessions)
  app.get('/api/profiles/sessions', listProfileSessions)
  app.get('/api/sessions/:id', getSession)
  app.patch('/api/sessions/:id', updateSession)
  app.delete('/api/sessions/:id', deleteSession)
  app.get('/api/sessions/:id/messages', getSessionMessages)

  app.get('/api/config', getConfig)
  app.put('/api/config', updateConfig)
  app.get('/api/config/defaults', getConfigDefaults)
  app.get('/api/config/schema', getConfigSchema)

  app.get('/api/model/info', getModelInfo)
  app.get('/api/model/auxiliary', getAuxiliaryModels)
  app.get('/api/model/options', getModelOptions)
  app.post('/api/model/set', setModel)
  app.get('/api/model/custom', getCustomModels)
  app.post('/api/model/custom', createCustomModel)
  app.delete('/api/model/custom/:id', deleteCustomModel)
  app.put('/api/model/custom/:id', updateCustomModel)
  app.post('/api/model/custom/:id/test', testCustomModel)
  app.post('/api/model/test', testModelEndpoint)
  app.get('/api/model/recommended-default', getRecommendedDefaultModel)

  app.get('/api/skills', listSkills)
  if (getSkillsCatalog) app.get('/api/skills/catalog', getSkillsCatalog)
  app.get('/api/skills/search', searchSkills)
  app.post('/api/skills/create', createSkill)
  if (preflightSkillImport) app.post('/api/skills/import/preflight', preflightSkillImport)
  if (commitSkillImport) app.post('/api/skills/import/commit', commitSkillImport)
  if (getSkillImportJob) app.get('/api/skills/import/:jobId', getSkillImportJob)
  if (createSkillDirect) app.post('/api/skills/create-direct', createSkillDirect)
  app.get('/api/skills/:name', getSkill)
  if (installSkill) app.post('/api/skills/install', installSkill)
  if (uninstallSkill) app.post('/api/skills/uninstall', uninstallSkill)
  app.post('/api/skills/toggle', toggleSkill)

  app.get('/api/connectors/definitions', getConnectorDefinitions)
  app.get('/api/connectors/advanced-definitions', getConnectorAdvancedDefinitions)
  app.get('/api/connectors/instances', listConnectorInstances)
  app.post('/api/connectors/instances', createConnectorInstance)
  app.post('/api/connectors/instances/:id/test', testConnectorInstance)
  app.patch('/api/connectors/instances/:id', updateConnectorInstance)
  app.delete('/api/connectors/instances/:id', deleteConnectorInstance)
  app.post('/api/connectors/tools/:id/call', callConnectorTool)
  app.patch('/api/connectors/tools/:id', toggleConnectorTool)
  app.get('/api/connectors/audit-logs', getConnectorAuditLogs)
  app.post('/api/connectors/health-check', healthCheckConnectors)
  app.post('/api/connectors/router/candidates', routeConnectorCandidates)

  app.post('/api/mcp/reload', reloadMcpServers)
  app.get('/api/mcp/servers', listMcpServers)
  app.post('/api/mcp/servers', createMcpServer)
  app.post('/api/mcp/servers/:name/test', testMcpServer)
  app.put('/api/mcp/servers/:name', updateMcpServer)
  app.delete('/api/mcp/servers/:name', deleteMcpServer)
  app.get('/api/mcp/servers/:name', getMcpServer)
  app.get('/api/mcp/servers/:name/tools', getMcpServerTools)
  app.post('/api/mcp/builtin/:tool', callBuiltinMcpTool)

  app.get('/api/tools/toolsets', listToolsets)
  app.get('/api/tools/toolsets/:name/config', getToolsetConfig)
  app.post('/api/tools/toolsets/:name/provider', setToolsetProvider)
  app.put('/api/tools/toolsets/:name/provider', setToolsetProvider)
  app.post('/api/tools/toolsets/:name/post-setup', toolsetPostSetup)
  app.get('/api/tools/toolsets/:name', getToolset)
  app.put('/api/tools/toolsets/:name', setToolsetEnabled)

  app.get('/api/plugins', listPlugins)
  app.put('/api/plugins/:id', setPluginEnabled)

  app.get('/api/artifacts', getArtifacts)
  app.put('/api/artifacts', updateArtifacts)
  app.get('/api/artifacts/:id', getArtifact)
  app.delete('/api/artifacts/:id', deleteArtifact)

  app.get('/api/knowledge', getKnowledge)
  app.put('/api/knowledge', updateKnowledge)
  app.get('/api/knowledge/libraries', listKnowledgeLibraries)
  app.post('/api/knowledge/libraries', createKnowledgeLibrary)
  app.patch('/api/knowledge/libraries/:id', renameKnowledgeLibrary)
  app.post('/api/knowledge/import-folder', importKnowledgeFolder)
  app.post('/api/knowledge/reindex', reindexKnowledge)
  app.post('/api/knowledge/search', searchKnowledge)

  app.get('/api/writer/resources', getWriterResources)
  app.post('/api/writer/plan/parse', parseWriterPlan)
  app.post('/api/prompt/enhance', enhancePrompt)

  app.get('/api/writer/agents/library', getWorkflowAgentLibrary)
  app.post('/api/writer/agents/library', createWorkflowAgent)
  app.patch('/api/writer/agents/library/:id', updateWorkflowAgent)
  app.delete('/api/writer/agents/library/:id', deleteWorkflowAgent)

  app.get('/api/writer/workflows', listWorkflows)
  app.post('/api/writer/workflows', saveWorkflow)
  app.post('/api/writer/workflows/:id/runs/:runId/nodes/:nodeId/:action', updateWorkflowRunNodeAction)
  app.post('/api/writer/workflows/:id/continue', continueWorkflow)
  app.get('/api/writer/workflows/:id', getWorkflow)
  app.put('/api/writer/workflows/:id', updateWorkflow)
  app.delete('/api/writer/workflows/:id', deleteWorkflow)

  app.get('/api/soul/authors', listSoulAuthors)
  app.post('/api/soul/authors', createSoulAuthor)
  app.post('/api/soul/fusion/preview', fusionSoulPreview)
  app.get('/api/soul/authors/:id', getSoulAuthor)
  app.delete('/api/soul/authors/:id', deleteSoulAuthor)
  app.post('/api/soul/authors/:id/import', importSoulTexts)
  app.post('/api/soul/authors/:id/process', processSoulAuthor)
  app.post('/api/soul/authors/:id/search', searchSoulAuthor)
  app.post('/api/soul/authors/:id/web-research', webResearchSoulAuthor)
  app.post('/api/soul/authors/:id/distill', distillSoulProfile)
  app.post('/api/soul/authors/:id/critic', criticSoulText)
  app.post('/api/soul/authors/:id/risk-check', riskCheckSoulText)
  app.post('/api/soul/authors/:id/export-skill', exportSoulSkill)
  app.post('/api/soul/authors/:id/export', exportSoulAuthor)

  app.get('/api/writer/projects', listWriterProjects)
  app.post('/api/writer/projects', createWriterProject)
  app.get('/api/writer/projects/resolve', resolveWriterProject)
  app.post('/api/writer/projects/:projectId/main-session', setWriterProjectMainSession)
  app.put('/api/writer/projects/:projectId/agents/:agentId', updateProjectAgent)
  app.post('/api/writer/projects/:id/tasks/generate', generateProjectTasks)
  app.get('/api/writer/projects/:id/tasks', getProjectTasks)
  app.patch('/api/writer/projects/:id/tasks/:taskId', updateProjectTask)
  app.post('/api/writer/projects/:id/sessions', createProjectSession)
  app.post('/api/writer/projects/:id/open-folder', openProjectFolder)
  app.post('/api/writer/projects/:id/import', importProjectManuscript)
  app.post('/api/writer/projects/:id/analyze', analyzeProject)
  app.post('/api/writer/projects/:id/check-consistency', checkProjectConsistency)
  app.post('/api/writer/projects/:id/rewrite-preview', rewritePreview)
  app.get('/api/writer/projects/:id/bible', getProjectBible)
  app.get('/api/writer/projects/:id/sources', listProjectSources)
  app.get('/api/writer/projects/:id/tree', getProjectFileTree)
  app.get('/api/writer/projects/:id/versions', getProjectVersions)
  app.get('/api/writer/projects/:id', getWriterProject)
  app.patch('/api/writer/projects/:id', updateWriterProject)
  app.delete('/api/writer/projects/:id', deleteWriterProject)
  app.post('/api/writer/projects/:id/open', setActiveWriterProject)
  app.get('/api/writer/projects/:id/status', writerProjectStatus)
  app.post('/api/writer/projects/:id/export', exportWriterProject)
  app.post('/api/writer/projects/:id/save', saveWriterProjectFile)

  app.all('/api/writer/projects/:id/os/:module', handleWriterOsRequest)
  app.all('/api/writer/projects/:id/os/:module/:action', handleWriterOsRequest)

  app.get('/api/status', getStatus)
  app.get('/api/audio/elevenlabs/voices', getElevenlabsVoices)
  app.get('/api/logs', getLogs)

  app.get('/api/env', getEnv)
  app.put('/api/env', setEnv)
  app.delete('/api/env', deleteEnv)
  app.post('/api/env/reveal', revealEnv)

  app.get('/api/providers/oauth', listOauthProviders)
  app.all('/api/providers/oauth/*', handleOauthRequest)
  app.post('/api/providers/validate', validateProvider)

  app.all('/api/memory/*', handleMemoryRequest)
  app.all('/api/messaging/*', handleMessagingRequest)
  app.get('/api/cron/jobs', listCronJobs)
  app.all('/api/cron/*', handleCronRequest)

  app.get('/api/profiles', listProfiles)
  app.post('/api/profiles', createProfile)
  app.get('/api/profiles/active', getActiveProfile)
  app.get('/api/profiles/:name/soul', getProfileSoul)
  app.put('/api/profiles/:name/soul', setProfileSoul)
  app.get('/api/profiles/:name/setup-command', getProfileSetupCommand)
  app.put('/api/profiles/:name', renameProfile)
  app.delete('/api/profiles/:name', deleteProfile)

  app.post('/api/tts/speak', speakTts)
  app.post('/api/image/generate', generateImage)

  app.get('/api/analytics/usage', getAnalyticsUsage)
  app.all('/api/analytics', getAnalytics)

  app.post('/api/gateway/restart', restartGateway)
  app.post('/api/karna/update', restartGateway)
  app.get('/api/karna/update/check', checkForUpdate)
  app.get('/api/actions/:name/status', getActionStatus)
  app.all('/api/action', handleActionRequest)
  app.all('/api/action/*', handleActionRequest)

  app.post('/api/audio/transcribe', transcribeAudio)

  app.get('/api/ingest/capabilities', getIngestCapabilities)
  app.post('/api/ingest/jobs', createIngestJob)
  app.get('/api/ingest/jobs/:id', getIngestJob)
  app.delete('/api/ingest/jobs/:id', cancelIngestJob)
  app.get('/api/ingest/results/:id', getIngestResult)
  app.post('/api/ingest/materialize', materializeIngestResult)

  app.get('/api/updates/check', getUpdatesCheck)

  app.get('/health', healthCheck)
  app.get('/', rootHealth)
}

module.exports = { registerApiRoutes }
