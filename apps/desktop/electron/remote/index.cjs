'use strict'

const path = require('node:path')
const { createNetworkUtils } = require('./network-utils.cjs')
const { createTlsCertificateManager } = require('./tls-certificate.cjs')
const { createIdentityManager } = require('./remote-identity.cjs')
const { createDeviceTrustStore } = require('./device-trust-store.cjs')
const { createAuditLogger } = require('./remote-audit.cjs')
const { createEventStore } = require('./remote-event-store.cjs')
const { createSessionManager } = require('./remote-session.cjs')
const { createPairingService } = require('./pairing-service.cjs')
const { createAuthorizationManager } = require('./remote-authorization.cjs')
const { createRemoteServer } = require('./remote-server-lifecycle.cjs')
const { createRuntimeBridge } = require('./remote-runtime-bridge.cjs')
const { createProjectFacade } = require('./remote-project-facade.cjs')
const { createCommandGateway } = require('./remote-command-gateway.cjs')
const { createResourceSnapshotService } = require('./remote-resource-snapshot.cjs')
const { createInteractionService } = require('./remote-interaction-service.cjs')
const { createArtifactService } = require('./remote-artifact-service.cjs')
const { createFileIdResolver } = require('./file-id-resolver.cjs')
const { createDocumentPreviewService } = require('./document-preview-service.cjs')
const { createQrCodeGenerator } = require('./qr-code-generator.cjs')
const { createRelayClient } = require('./relay-client.cjs')
const { createPushRegistrationService } = require('./push-registration.cjs')

function createRemoteGateway(initialDeps = {}) {
  const {
    safeStorage,
    paths,
    app,
    tlsOptions,
    getGatewayPort
  } = initialDeps

  const runtimeServices = {
    writerProjectsService: initialDeps.writerProjectsService || null,
    skillsService: initialDeps.skillsService || null,
    mcpService: initialDeps.mcpService || null,
    soulService: initialDeps.soulService || null,
    capabilitiesService: initialDeps.capabilitiesService || null
  }

  const networkUtils = createNetworkUtils(initialDeps)
  const auditLogger = createAuditLogger({ paths, app })
  const eventStore = createEventStore()
  const identityManager = createIdentityManager({ safeStorage, paths, app })
  const tlsManager = createTlsCertificateManager({ paths, app })
  const deviceTrustStore = createDeviceTrustStore({ paths, app })
  const sessionManager = createSessionManager({ eventStore, auditLogger })
  const authorizationManager = createAuthorizationManager({ deviceTrustStore, auditLogger, eventStore, sessionManager })

  const fileIdResolver = createFileIdResolver()

  let previewsDir = null
  if (paths) {
    try {
      previewsDir = paths.remotePreviewsDir ? paths.remotePreviewsDir({ app }) : null
    } catch (_) {
      previewsDir = path.join(app?.getPath?.('temp') || require('node:os').tmpdir(), 'karna-remote-previews')
    }
  }

  const previewService = createDocumentPreviewService({
    fileIdResolver,
    tempDir: previewsDir,
    auditLogger,
    eventStore
  })

  function buildProjectFacadeDeps() {
    return {
      authorizationManager,
      writerProjectsService: runtimeServices.writerProjectsService,
      soulService: runtimeServices.soulService,
      mcpService: runtimeServices.mcpService,
      skillsService: runtimeServices.skillsService,
      capabilitiesService: runtimeServices.capabilitiesService,
      auditLogger,
      eventStore
    }
  }

  const projectFacade = createProjectFacade(buildProjectFacadeDeps())

  const runtimeBridge = createRuntimeBridge({
    eventStore,
    auditLogger,
    getGatewayPort
  })

  const interactionService = createInteractionService({
    runtimeBridge,
    auditLogger,
    eventStore
  })

  const commandGateway = createCommandGateway({
    runtimeBridge,
    interactionService,
    authorizationManager,
    projectFacade,
    auditLogger,
    eventStore
  })

  function buildResourceSnapshotDeps() {
    return {
      skillsService: runtimeServices.skillsService,
      mcpService: runtimeServices.mcpService,
      soulService: runtimeServices.soulService,
      capabilitiesService: runtimeServices.capabilitiesService,
      authorizationManager,
      projectFacade,
      auditLogger,
      eventStore
    }
  }

  const resourceSnapshotService = createResourceSnapshotService(buildResourceSnapshotDeps())

  const artifactService = createArtifactService({
    projectFacade,
    authorizationManager,
    auditLogger,
    eventStore,
    fileIdResolver,
    previewService
  })

  let tlsCert = null
  if (tlsOptions && tlsOptions.enabled && paths) {
    const dataRoot = typeof paths.dataRoot === 'function' ? paths.dataRoot({ app }) : paths.dataRoot
    const certPath = path.join(dataRoot, 'remote', 'tls-cert.pem')
    const keyPath = path.join(dataRoot, 'remote', 'tls-key.pem')
    tlsCert = tlsManager.loadOrCreateCert(certPath, keyPath, {
      commonName: tlsOptions.commonName || 'Karna Remote Gateway'
    })
  }

  const pairingService = createPairingService({
    identityManager,
    deviceTrustStore,
    sessionManager,
    auditLogger,
    eventStore,
    tlsCert
  })

  const qrCodeGenerator = createQrCodeGenerator({
    pairingService,
    networkUtils,
    tlsCert
  })

  const relayClient = createRelayClient({
    relayUrl: initialDeps.relayUrl,
    authToken: initialDeps.relayAuthToken,
    lanAvailable: networkUtils.hasLanConnectivity()
  })

  const pushRegistration = createPushRegistrationService({
    relayClient,
    storage: initialDeps.storage
  })

  relayClient.on('relayMessage', (message) => {
    if (eventStore) {
      eventStore.append('relay_message_received', { from: message.from })
    }
  })

  const remoteServer = createRemoteServer({
    networkUtils,
    identityManager,
    tlsCertificate: tlsCert,
    pairingService,
    deviceTrustStore,
    sessionManager,
    authorizationManager,
    auditLogger,
    eventStore,
    commandGateway,
    projectFacade,
    resourceSnapshot: resourceSnapshotService,
    interactionService,
    artifactService,
    runtimeBridge,
    qrCodeGenerator,
    relayClient,
    pushRegistration
  })

  remoteServer.setRuntimeBridge({
    handleMessage: async (message, context) => {
      const type = message.type || ''
      const isRemoteCommand = (
        type.startsWith('conversation.') ||
        type.startsWith('message.') ||
        type.startsWith('run.') ||
        type.startsWith('interaction.') ||
        type.startsWith('approval.') ||
        type === 'project.list' ||
        type === 'project.get' ||
        type === 'project.conversations' ||
        type === 'conversation.messages' ||
        type === 'resource.snapshot' ||
        type === 'artifact.register' ||
        type === 'artifact.ticket' ||
        type === 'artifact.download' ||
        type === 'artifact.preview'
      )
      if (isRemoteCommand) {
        return commandGateway.handleCommand ? commandGateway.handleCommand(message, context) : { ok: false, error: 'command_gateway_unavailable' }
      }
      return runtimeBridge.handleMessage(message, context)
    }
  })

  async function startRemoteServer(options = {}) {
    const result = await remoteServer.start({
      ...options,
      tls: tlsCert ? true : (options.tls || false)
    })
    try {
      await runtimeBridge.connect()
    } catch (err) {
      if (auditLogger) auditLogger.error('runtime_bridge_connect_failed', { error: err.message })
    }
    try {
      relayClient.connect()
    } catch (err) {
      if (auditLogger) auditLogger.error('relay_connect_failed', { error: err.message })
    }
    eventStore.append('remote_gateway_started', { runtimeBridgeConnected: runtimeBridge.isConnected() })
    return result
  }

  async function stopRemoteServer() {
    runtimeBridge.disconnect()
    try {
      relayClient.shutdown()
    } catch (_) {}
    try {
      pushRegistration.shutdown()
    } catch (_) {}
    const result = await remoteServer.stop()
    if (previewService && previewService.shutdown) {
      previewService.shutdown()
    }
    return result
  }

  function getRemoteStatus() {
    return {
      ...remoteServer.getStatus(),
      safeStorageAvailable: identityManager.isAvailable(),
      privateInterfaces: networkUtils.detectPrivateInterfaces(),
      tlsEnabled: Boolean(tlsCert),
      runtimeBridge: runtimeBridge.getStatus(),
      commandGateway: commandGateway.getStats(),
      artifactService: artifactService.getStats(),
      interactions: interactionService.getStats(),
      relay: relayClient.getStatus(),
      push: pushRegistration.getStatus()
    }
  }

  function setRuntimeBridge(bridge) {
    remoteServer.setRuntimeBridge(bridge)
  }

  function setServiceDeps(serviceDeps = {}) {
    let updated = false

    if (serviceDeps.writerProjectsService !== undefined) {
      runtimeServices.writerProjectsService = serviceDeps.writerProjectsService
      updated = true
    }
    if (serviceDeps.skillsService !== undefined) {
      runtimeServices.skillsService = serviceDeps.skillsService
      updated = true
    }
    if (serviceDeps.mcpService !== undefined) {
      runtimeServices.mcpService = serviceDeps.mcpService
      updated = true
    }
    if (serviceDeps.soulService !== undefined) {
      runtimeServices.soulService = serviceDeps.soulService
      updated = true
    }
    if (serviceDeps.capabilitiesService !== undefined) {
      runtimeServices.capabilitiesService = serviceDeps.capabilitiesService
      updated = true
    }

    if (updated) {
      projectFacade.setDeps?.(buildProjectFacadeDeps())
      if (resourceSnapshotService.setDeps) {
        resourceSnapshotService.setDeps(buildResourceSnapshotDeps())
      }
      projectFacade.initialize?.()
      resourceSnapshotService.initialize?.()
    }
  }

  return Object.freeze({
    startRemoteServer,
    stopRemoteServer,
    getRemoteStatus,
    setRuntimeBridge,
    setServiceDeps,
    networkUtils,
    identityManager,
    deviceTrustStore,
    pairingService,
    sessionManager,
    authorizationManager,
    auditLogger,
    eventStore,
    tlsManager,
    runtimeBridge,
    projectFacade,
    commandGateway,
    resourceSnapshotService,
    interactionService,
    artifactService,
    fileIdResolver,
    previewService,
    qrCodeGenerator,
    relayClient,
    pushRegistration
  })
}

module.exports = { createRemoteGateway }
