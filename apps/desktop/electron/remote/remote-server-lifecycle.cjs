'use strict'

const http = require('node:http')
const https = require('node:https')
const { WebSocketServer } = require('ws')
const { URL } = require('node:url')
const crypto = require('node:crypto')

const DEFAULT_PORT = 0
const API_PREFIX = '/remote/v1'
const HEALTH_ENDPOINT = '/health'
const CAPABILITIES_ENDPOINT = '/remote/v1/capabilities'
const EVENTS_WS_PATH = '/remote/v1/events'

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  PARTIAL_CONTENT: 206,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  RANGE_NOT_SATISFIABLE: 416,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
}

const PUBLIC_ENDPOINTS = new Set([
  HEALTH_ENDPOINT,
  CAPABILITIES_ENDPOINT,
  '/remote/v1/pairing/hello',
  '/remote/v1/pairing/confirm',
  '/remote/v1/pairing/finalize'
])

function createRemoteServer(deps = {}) {
  const {
    networkUtils,
    identityManager,
    tlsCertificate,
    pairingService,
    deviceTrustStore,
    sessionManager,
    authorizationManager,
    auditLogger,
    eventStore,
    projectFacade,
    commandGateway,
    interactionService,
    artifactService,
    resourceSnapshot,
    runtimeBridge,
    qrCodeGenerator,
    relayClient,
    pushRegistration,
    http: httpDep = http,
    https: httpsDep = https,
    wsServer: WsServer = WebSocketServer,
    cryptoDep = crypto
  } = deps

  let server = null
  let wss = null
  let status = 'stopped'
  let bindAddress = null
  let port = null
  let actualPort = null
  let tlsCert = null
  const commandStatusMap = new Map()

  const activeEventConnections = new Set()
  const localRuntimeBridge = {
    handleMessage: null
  }

  function setRuntimeBridge(bridge) {
    localRuntimeBridge.handleMessage = bridge.handleMessage
  }

  function getEffectiveRuntimeBridge() {
    return runtimeBridge || localRuntimeBridge
  }

  function getStatus() {
    const relayStatus = relayClient ? relayClient.getStatus() : { state: 'unavailable', networkMode: 'offline' }
    const networkInterfaces = networkUtils ? networkUtils.detectPrivateInterfaces() : []
    const lanAvailable = networkUtils ? networkUtils.hasLanConnectivity() : false
    const pushStatus = pushRegistration ? pushRegistration.getStatus() : { configured: false }

    return {
      status,
      bindAddress,
      port: actualPort,
      configuredPort: port,
      tlsEnabled: Boolean(tlsCert),
      activeSessions: sessionManager ? sessionManager.getActiveSessionCount() : 0,
      pairedDevices: deviceTrustStore ? deviceTrustStore.listDevices().filter(d => d.trusted).length : 0,
      activeEventConnections: activeEventConnections.size,
      network: {
        lanAvailable,
        interfaces: networkInterfaces,
        mode: relayStatus.networkMode || (lanAvailable ? 'lan' : 'offline')
      },
      relay: relayStatus,
      push: pushStatus
    }
  }

  function sendJson(res, statusCode, data) {
    const body = JSON.stringify(data)
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    })
    res.end(body)
  }

  function sendError(res, statusCode, error, details = {}) {
    sendJson(res, statusCode, { error, ...details })
  }

  function setCorsHeaders(req, res) {
    const origin = req.headers.origin
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Max-Age', '86400')
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => resolve(body))
      req.on('error', reject)
    })
  }

  async function parseJsonBody(req) {
    const body = await readBody(req)
    if (!body) return {}
    try {
      return JSON.parse(body)
    } catch (e) {
      throw new Error('invalid_json')
    }
  }

  function authenticateRequest(req) {
    const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname

    if (PUBLIC_ENDPOINTS.has(pathname)) {
      return { authenticated: true, public: true }
    }

    if (req.method === 'OPTIONS') {
      return { authenticated: true, public: true }
    }

    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { authenticated: false, reason: 'missing_token' }
    }

    const token = authHeader.slice(7)
    if (!sessionManager) {
      return { authenticated: false, reason: 'session_unavailable' }
    }

    const result = sessionManager.verifyToken(token)
    if (!result.valid) {
      return { authenticated: false, reason: result.reason }
    }

    sessionManager.touchSession(result.sessionId)
    return {
      authenticated: true,
      sessionId: result.sessionId,
      deviceId: result.deviceId,
      session: result.session
    }
  }

  function validateRequiredFields(obj, fields) {
    const missing = []
    for (const field of fields) {
      if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
        missing.push(field)
      }
    }
    return missing.length > 0 ? { valid: false, missing } : { valid: true }
  }

  function matchRoute(pathname, method, routes) {
    for (const route of routes) {
      if (route.method !== method) continue
      const pattern = new RegExp('^' + route.path.replace(/:[^/]+/g, '([^/]+)') + '$')
      const match = pathname.match(pattern)
      if (match) {
        const params = {}
        const paramNames = (route.path.match(/:[^/]+/g) || []).map(p => p.slice(1))
        paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(match[i + 1])
        })
        return { handler: route.handler, params }
      }
    }
    return null
  }

  async function handleCapabilities(req, res) {
    const serverStatus = getStatus()
    sendJson(res, HTTP_STATUS.OK, {
      version: '1.0.0',
      name: 'karna-remote-gateway',
      status: serverStatus.status,
      capabilities: authorizationManager ? authorizationManager.getPublicCapabilities() : [],
      allCapabilities: authorizationManager ? authorizationManager.getCapabilities() : [],
      pairingRequired: true,
      auth: 'bearer-token',
      crypto: 'x25519-hkdf-hmac-sha256',
      wsEndpoint: EVENTS_WS_PATH,
      serverTime: Date.now()
    })
  }

  async function handlePairingHello(req, res) {
    try {
      const data = await parseJsonBody(req)
      const result = pairingService ? pairingService.hello(data) : { error: 'pairing unavailable' }
      if (eventStore) eventStore.append('pairing_hello_api', { deviceName: data.name })
      sendJson(res, HTTP_STATUS.OK, result)
    } catch (e) {
      sendError(res, HTTP_STATUS.BAD_REQUEST, 'invalid_request')
    }
  }

  async function handlePairingConfirm(req, res) {
    try {
      const data = await parseJsonBody(req)
      const validation = validateRequiredFields(data, ['token', 'sasCode'])
      if (!validation.valid) {
        return sendError(res, HTTP_STATUS.BAD_REQUEST, 'missing_fields', { fields: validation.missing })
      }
      const result = pairingService ? pairingService.confirm(data.token, data.sasCode, data) : { success: false, reason: 'pairing unavailable' }
      sendJson(res, result.success ? HTTP_STATUS.OK : HTTP_STATUS.FORBIDDEN, result)
    } catch (e) {
      sendError(res, HTTP_STATUS.BAD_REQUEST, 'invalid_request')
    }
  }

  async function handlePairingFinalize(req, res) {
    try {
      const data = await parseJsonBody(req)
      const validation = validateRequiredFields(data, ['token'])
      if (!validation.valid) {
        return sendError(res, HTTP_STATUS.BAD_REQUEST, 'missing_fields', { fields: validation.missing })
      }
      const result = pairingService ? pairingService.finalize(data.token, data) : { success: false, reason: 'pairing unavailable' }
      if (result.success && auditLogger) {
        auditLogger.devicePair({ deviceId: result.device?.id })
      }
      sendJson(res, result.success ? HTTP_STATUS.OK : HTTP_STATUS.FORBIDDEN, result)
    } catch (e) {
      sendError(res, HTTP_STATUS.BAD_REQUEST, 'invalid_request')
    }
  }

  async function handleSessionOpen(req, res, auth) {
    try {
      const data = await parseJsonBody(req)
      const validation = validateRequiredFields(data, ['deviceId', 'ephemeralPublicKey'])
      if (!validation.valid) {
        return sendError(res, HTTP_STATUS.BAD_REQUEST, 'missing_fields', { fields: validation.missing })
      }

      const device = deviceTrustStore ? deviceTrustStore.getDevice(data.deviceId) : null
      if (!device || !device.trusted) {
        if (auditLogger) auditLogger.authFailure({ reason: 'device_not_trusted', deviceId: data.deviceId })
        return sendError(res, HTTP_STATUS.FORBIDDEN, 'device_not_trusted')
      }

      if (identityManager && data.signature && data.publicKey) {
        const dataToVerify = JSON.stringify({ deviceId: data.deviceId, ts: data.ts || Date.now(), ephemeralPublicKey: data.ephemeralPublicKey })
        const valid = identityManager.verify(dataToVerify, data.signature, device.publicKey)
        if (!valid) {
          return sendError(res, HTTP_STATUS.FORBIDDEN, 'invalid_signature')
        }
      }

      if (deviceTrustStore) deviceTrustStore.touchDevice(device.id)

      if (!sessionManager) {
        return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'session_unavailable')
      }

      const session = sessionManager.openSession(device.id, device.publicKey, data.ephemeralPublicKey, {
        remoteAddress: req.socket.remoteAddress
      })

      if (eventStore) eventStore.append('session_opened', { sessionId: session.id, deviceId: device.id })

      sendJson(res, HTTP_STATUS.CREATED, session)
    } catch (e) {
      sendError(res, HTTP_STATUS.BAD_REQUEST, 'invalid_request')
    }
  }

  async function handleSessionRefresh(req, res, auth) {
    if (!sessionManager) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'session_unavailable')
    }
    const result = sessionManager.refreshSession(auth.sessionId)
    if (!result) {
      return sendError(res, HTTP_STATUS.UNAUTHORIZED, 'invalid_session')
    }
    sendJson(res, HTTP_STATUS.OK, result)
  }

  async function handleSessionClose(req, res, auth) {
    if (!sessionManager) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'session_unavailable')
    }
    sessionManager.closeSession(auth.sessionId, 'client_closed')
    if (eventStore) eventStore.append('session_closed_by_client', { sessionId: auth.sessionId })
    sendJson(res, HTTP_STATUS.OK, { success: true })
  }

  async function handleGetDevices(req, res, auth) {
    if (!deviceTrustStore) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'trust_store_unavailable')
    }
    const authCheck = authorizationManager ? authorizationManager.checkCapability(auth.deviceId, 'settings_read') : { allowed: true }
    if (!authCheck.allowed) {
      return sendError(res, HTTP_STATUS.FORBIDDEN, authCheck.reason)
    }
    const devices = deviceTrustStore.listDevices().map(d => ({
      id: d.id,
      name: d.name,
      fingerprint: d.fingerprint,
      trusted: d.trusted,
      permissions: d.permissions,
      pairedAt: d.pairedAt,
      lastSeenAt: d.lastSeenAt
    }))
    sendJson(res, HTTP_STATUS.OK, { devices })
  }

  async function handleUpdateDevice(req, res, auth, params) {
    if (!deviceTrustStore) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'trust_store_unavailable')
    }
    const authCheck = authorizationManager ? authorizationManager.checkCapability(auth.deviceId, 'settings_write') : { allowed: true }
    if (!authCheck.allowed) {
      return sendError(res, HTTP_STATUS.FORBIDDEN, authCheck.reason)
    }
    try {
      const data = await parseJsonBody(req)
      const updates = {}
      if (data.name !== undefined) updates.name = data.name
      if (data.permissions !== undefined) updates.permissions = data.permissions
      if (data.metadata !== undefined) updates.metadata = data.metadata

      const device = deviceTrustStore.updateDevice(params.deviceId, updates)
      if (!device) {
        return sendError(res, HTTP_STATUS.NOT_FOUND, 'device_not_found')
      }
      if (eventStore) eventStore.append('device_updated', { deviceId: params.deviceId })
      sendJson(res, HTTP_STATUS.OK, {
        device: {
          id: device.id,
          name: device.name,
          fingerprint: device.fingerprint,
          trusted: device.trusted,
          permissions: device.permissions
        }
      })
    } catch (e) {
      sendError(res, HTTP_STATUS.BAD_REQUEST, 'invalid_request')
    }
  }

  async function handleDeleteDevice(req, res, auth, params) {
    if (!deviceTrustStore) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'trust_store_unavailable')
    }
    const authCheck = authorizationManager ? authorizationManager.checkCapability(auth.deviceId, 'device_revoke') : { allowed: true }
    if (!authCheck.allowed) {
      return sendError(res, HTTP_STATUS.FORBIDDEN, authCheck.reason)
    }

    if (sessionManager) {
      sessionManager.terminateDeviceSessions(params.deviceId)
    }
    const revoked = deviceTrustStore.revokeDevice(params.deviceId)
    if (!revoked) {
      return sendError(res, HTTP_STATUS.NOT_FOUND, 'device_not_found')
    }
    if (eventStore) eventStore.append('device_revoked', { deviceId: params.deviceId })
    sendJson(res, HTTP_STATUS.OK, { success: true })
  }

  async function handleGetProjects(req, res, auth) {
    if (!projectFacade) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'project_service_unavailable')
    }
    const result = projectFacade.getProjects(auth.deviceId)
    if (!result.ok) {
      return sendError(res, HTTP_STATUS.FORBIDDEN, result.error)
    }
    sendJson(res, HTTP_STATUS.OK, { projects: result.projects })
  }

  async function handleGetProject(req, res, auth, params) {
    if (!projectFacade) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'project_service_unavailable')
    }
    const result = projectFacade.getProject(auth.deviceId, params.projectId)
    if (!result.ok) {
      if (result.error === 'project_not_found') {
        return sendError(res, HTTP_STATUS.NOT_FOUND, result.error)
      }
      return sendError(res, HTTP_STATUS.FORBIDDEN, result.error)
    }
    sendJson(res, HTTP_STATUS.OK, { project: result.project })
  }

  async function handleGetProjectStatus(req, res, auth, params) {
    if (!projectFacade) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'project_service_unavailable')
    }
    const projectResult = projectFacade.getProject(auth.deviceId, params.projectId)
    if (!projectResult.ok) {
      if (projectResult.error === 'project_not_found') {
        return sendError(res, HTTP_STATUS.NOT_FOUND, projectResult.error)
      }
      return sendError(res, HTTP_STATUS.FORBIDDEN, projectResult.error)
    }

    let runs = []
    let projectStatus = { state: 'idle', activeRun: null }

    const bridge = getEffectiveRuntimeBridge()
    if (bridge && bridge.isConnected && bridge.isConnected()) {
      try {
        projectStatus.state = 'connected'
      } catch (_) {}
    }

    sendJson(res, HTTP_STATUS.OK, {
      projectId: params.projectId,
      status: projectStatus,
      activeRuns: runs,
      pendingInteractions: interactionService ? interactionService.listPendingInteractions({ projectId: params.projectId }).length : 0
    })
  }

  async function handleGetProjectConversations(req, res, auth, params) {
    if (!projectFacade) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'project_service_unavailable')
    }
    const result = projectFacade.getProjectConversations(auth.deviceId, params.projectId)
    if (!result.ok) {
      return sendError(res, HTTP_STATUS.FORBIDDEN, result.error)
    }
    sendJson(res, HTTP_STATUS.OK, { conversations: result.conversations })
  }

  async function handleCreateConversation(req, res, auth, params) {
    try {
      const data = await parseJsonBody(req)
      if (commandGateway) {
        const result = await commandGateway.handleCommand(
          { type: 'conversation.create', payload: { projectId: params.projectId, ...data } },
          { deviceId: auth.deviceId, sessionId: auth.sessionId }
        )
        if (!result.ok) {
          return sendError(res, HTTP_STATUS.BAD_REQUEST, result.error)
        }
        return sendJson(res, HTTP_STATUS.CREATED, result)
      }
      sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'command_gateway_unavailable')
    } catch (e) {
      sendError(res, HTTP_STATUS.BAD_REQUEST, 'invalid_request')
    }
  }

  async function handleGetConversationMessages(req, res, auth, params) {
    if (!projectFacade) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'project_service_unavailable')
    }
    const url = new URL(req.url, `http://${req.headers.host}`)
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const before = url.searchParams.get('before')
    const projectId = params.projectId

    if (!projectId) {
      return sendError(res, HTTP_STATUS.BAD_REQUEST, 'project_id_required')
    }

    const result = projectFacade.getConversationMessages(auth.deviceId, projectId, params.conversationId)
    if (!result.ok) {
      return sendError(res, HTTP_STATUS.FORBIDDEN, result.error)
    }
    let messages = result.messages || []
    if (before) {
      const idx = messages.findIndex(m => m.id === before)
      if (idx >= 0) messages = messages.slice(0, idx)
    }
    messages = messages.slice(-limit)
    sendJson(res, HTTP_STATUS.OK, { messages, hasMore: messages.length >= limit })
  }

  async function handleGetConversationMessagesLegacy(req, res, auth, params) {
    return sendError(res, HTTP_STATUS.BAD_REQUEST, 'project_id_required_use_project_scoped_endpoint')
  }

  async function handleGetProjectRuns(req, res, auth, params) {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const limit = parseInt(url.searchParams.get('limit') || '20', 10)
    const status = url.searchParams.get('status')

    const runs = []
    sendJson(res, HTTP_STATUS.OK, { runs, limit, hasMore: false })
  }

  async function handleGetRun(req, res, auth, params) {
    sendError(res, HTTP_STATUS.NOT_FOUND, 'run_not_found')
  }

  async function handlePendingInteractions(req, res, auth) {
    if (!interactionService) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'interaction_service_unavailable')
    }
    const url = new URL(req.url, `http://${req.headers.host}`)
    const projectId = url.searchParams.get('projectId')
    const type = url.searchParams.get('type')
    const interactions = interactionService.listPendingInteractions({ projectId, type })
    sendJson(res, HTTP_STATUS.OK, { interactions })
  }

  async function handleGetInteraction(req, res, auth, params) {
    if (!interactionService) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'interaction_service_unavailable')
    }
    const interaction = interactionService.getInteraction(params.interactionId)
    if (!interaction) {
      return sendError(res, HTTP_STATUS.NOT_FOUND, 'interaction_not_found')
    }
    sendJson(res, HTTP_STATUS.OK, { interaction })
  }

  async function handleGetProjectFiles(req, res, auth, params) {
    if (!artifactService) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'artifact_service_unavailable')
    }

    const result = artifactService.getProjectFiles(params.projectId, auth.deviceId)
    if (!result.ok) {
      const statusCode = {
        project_not_found: HTTP_STATUS.NOT_FOUND,
        access_denied: HTTP_STATUS.FORBIDDEN,
        path_outside_project: HTTP_STATUS.FORBIDDEN
      }[result.error] || HTTP_STATUS.BAD_REQUEST
      return sendError(res, statusCode, result.error)
    }

    sendJson(res, HTTP_STATUS.OK, {
      projectId: params.projectId,
      files: result.files
    })
  }

  async function handleGetFileInfo(req, res, auth, params) {
    if (!artifactService) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'artifact_service_unavailable')
    }
    const result = artifactService.getFileInfo(params.fileId)
    if (!result.ok) {
      return sendError(res, HTTP_STATUS.NOT_FOUND, result.error)
    }
    sendJson(res, HTTP_STATUS.OK, { file: result.file })
  }

  async function handleCreateDownloadTicket(req, res, auth, params) {
    if (!artifactService) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'artifact_service_unavailable')
    }
    try {
      const data = await parseJsonBody(req)
      const result = artifactService.createDownloadTicket(params.fileId, {
        deviceId: auth.deviceId,
        projectId: data.projectId
      })
      if (!result.ok) {
        const statusCode = {
          file_not_found: HTTP_STATUS.NOT_FOUND,
          access_denied: HTTP_STATUS.FORBIDDEN,
          path_outside_project: HTTP_STATUS.FORBIDDEN
        }[result.error] || HTTP_STATUS.BAD_REQUEST
        return sendError(res, statusCode, result.error)
      }
      sendJson(res, HTTP_STATUS.CREATED, { ticket: result.ticket })
    } catch (e) {
      sendError(res, HTTP_STATUS.BAD_REQUEST, 'invalid_request')
    }
  }

  async function handleFileDownload(req, res, auth, params) {
    if (!artifactService) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'artifact_service_unavailable')
    }

    const url = new URL(req.url, `http://${req.headers.host}`)
    const ticketHash = url.searchParams.get('hash')
    const rangeHeader = req.headers.range

    const result = await artifactService.handleDownload(
      params.ticketId,
      ticketHash,
      auth.deviceId,
      rangeHeader
    )

    if (!result.ok) {
      const statusCode = result.statusCode || HTTP_STATUS.FORBIDDEN
      return sendError(res, statusCode, result.error)
    }

    const headers = {
      'Content-Type': result.contentType,
      'Content-Length': result.data.length,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(result.filename)}"`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    }

    if (result.isRangeRequest) {
      headers['Content-Range'] = `bytes ${result.start}-${result.end}/${result.totalSize}`
      res.writeHead(HTTP_STATUS.PARTIAL_CONTENT, headers)
    } else {
      res.writeHead(HTTP_STATUS.OK, headers)
    }

    res.end(result.data)
  }

  async function handleCreatePreview(req, res, auth, params) {
    if (!artifactService) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'artifact_service_unavailable')
    }
    try {
      const data = await parseJsonBody(req)
      const result = await artifactService.createPreview(params.fileId, {
        deviceId: auth.deviceId,
        projectId: data.projectId
      }, data.options || {})
      if (!result.ok) {
        const statusCode = {
          file_not_found: HTTP_STATUS.NOT_FOUND,
          access_denied: HTTP_STATUS.FORBIDDEN,
          path_outside_project: HTTP_STATUS.FORBIDDEN,
          converter_unavailable: HTTP_STATUS.SERVICE_UNAVAILABLE,
          preview_expired: HTTP_STATUS.GONE
        }[result.error] || HTTP_STATUS.BAD_REQUEST
        return sendError(res, statusCode, result.error)
      }
      sendJson(res, HTTP_STATUS.CREATED, result)
    } catch (e) {
      sendError(res, HTTP_STATUS.BAD_REQUEST, 'invalid_request')
    }
  }

  async function handleGetPreviewManifest(req, res, auth, params) {
    if (!artifactService) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'artifact_service_unavailable')
    }
    const result = artifactService.getPreviewManifest(params.previewId)
    if (!result.ok) {
      const statusCode = {
        preview_not_found: HTTP_STATUS.NOT_FOUND,
        preview_expired: HTTP_STATUS.GONE
      }[result.error] || HTTP_STATUS.NOT_FOUND
      return sendError(res, statusCode, result.error)
    }
    sendJson(res, HTTP_STATUS.OK, result)
  }

  async function handleGetPreviewChunk(req, res, auth, params) {
    if (!artifactService) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'artifact_service_unavailable')
    }

    const chunkIndex = parseInt(params.chunkId, 10)
    if (isNaN(chunkIndex) || chunkIndex < 0) {
      return sendError(res, HTTP_STATUS.BAD_REQUEST, 'invalid_chunk_index')
    }

    const result = await artifactService.getPreviewChunk(params.previewId, chunkIndex)
    if (!result.ok) {
      const statusCode = {
        preview_not_found: HTTP_STATUS.NOT_FOUND,
        preview_expired: HTTP_STATUS.GONE,
        invalid_chunk_index: HTTP_STATUS.BAD_REQUEST
      }[result.error] || HTTP_STATUS.INTERNAL_ERROR
      return sendError(res, statusCode, result.error)
    }
    sendJson(res, HTTP_STATUS.OK, result)
  }

  async function handleSendCommand(req, res, auth) {
    try {
      const data = await parseJsonBody(req)
      const validation = validateRequiredFields(data, ['type'])
      if (!validation.valid) {
        return sendError(res, HTTP_STATUS.BAD_REQUEST, 'missing_fields', { fields: validation.missing })
      }

      const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      commandStatusMap.set(commandId, { id: commandId, status: 'queued', createdAt: Date.now() })

      if (commandGateway) {
        const result = await commandGateway.handleCommand(
          { commandId, type: data.type, payload: data.payload || {}, idempotencyKey: data.idempotencyKey },
          { deviceId: auth.deviceId, sessionId: auth.sessionId }
        )
        commandStatusMap.set(commandId, {
          id: commandId,
          status: result.ok ? 'completed' : 'failed',
          result,
          completedAt: Date.now()
        })
        sendJson(res, HTTP_STATUS.ACCEPTED, { commandId, status: result.ok ? 'queued' : 'failed', result })
      } else {
        commandStatusMap.set(commandId, { id: commandId, status: 'no_handler', completedAt: Date.now() })
        sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'command_gateway_unavailable')
      }
    } catch (e) {
      sendError(res, HTTP_STATUS.BAD_REQUEST, 'invalid_request')
    }
  }

  async function handleGetCommandStatus(req, res, auth, params) {
    const status = commandStatusMap.get(params.commandId)
    if (!status) {
      return sendError(res, HTTP_STATUS.NOT_FOUND, 'command_not_found')
    }
    sendJson(res, HTTP_STATUS.OK, { command: status })
  }

  async function handleSyncSnapshot(req, res, auth) {
    if (!resourceSnapshot) {
      return sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'snapshot_service_unavailable')
    }
    const url = new URL(req.url, `http://${req.headers.host}`)
    const projectId = url.searchParams.get('projectId')

    try {
      const result = await resourceSnapshot.createSnapshot({ deviceId: auth.deviceId, projectId })
      if (!result.ok) {
        return sendError(res, HTTP_STATUS.FORBIDDEN, result.error)
      }

      const devices = deviceTrustStore ? deviceTrustStore.listDevices().filter(d => d.trusted).length : 0
      const sessions = sessionManager ? sessionManager.getActiveSessionCount() : 0
      const events = eventStore ? eventStore.getStats() : { latestCursor: '0' }

      sendJson(res, HTTP_STATUS.OK, {
        snapshot: result.snapshot,
        serverStatus: {
          version: '1.0.0',
          serverTime: Date.now(),
          pairedDevices: devices,
          activeSessions: sessions
        },
        latestEventCursor: events.latestCursor
      })
    } catch (e) {
      sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'snapshot_failed')
    }
  }

  async function handleGetNetworkStatus(req, res, auth) {
    const networkInterfaces = networkUtils ? networkUtils.detectPrivateInterfaces() : []
    const lanAvailable = networkUtils ? networkUtils.hasLanConnectivity() : false
    const relayStatus = relayClient ? relayClient.getStatus() : { state: 'unavailable' }

    sendJson(res, HTTP_STATUS.OK, {
      lanAvailable,
      interfaces: networkInterfaces,
      currentMode: relayStatus.networkMode || (lanAvailable ? 'lan' : 'offline'),
      relay: relayStatus,
      timestamp: Date.now()
    })
  }

  async function handleGetRelayStatus(req, res, auth) {
    if (!relayClient) {
      return sendJson(res, HTTP_STATUS.OK, {
        configured: false,
        state: 'unavailable',
        message: 'Relay client not initialized'
      })
    }
    const status = relayClient.getStatus()
    sendJson(res, HTTP_STATUS.OK, {
      configured: true,
      ...status
    })
  }

  async function handleGetPushStatus(req, res, auth) {
    if (!pushRegistration) {
      return sendJson(res, HTTP_STATUS.OK, {
        configured: false,
        available: false,
        message: 'Push service not available'
      })
    }
    const status = pushRegistration.getStatus()
    sendJson(res, HTTP_STATUS.OK, status)
  }

  async function handleRegisterPushToken(req, res, auth) {
    if (!pushRegistration) {
      return sendError(res, HTTP_STATUS.SERVICE_UNAVAILABLE, 'push_service_unavailable')
    }
    try {
      const data = await parseJsonBody(req)
      const validation = validateRequiredFields(data, ['token'])
      if (!validation.valid) {
        return sendError(res, HTTP_STATUS.BAD_REQUEST, 'missing_fields', { fields: validation.missing })
      }
      const result = await pushRegistration.registerToken(data.token, {
        deviceId: auth.deviceId,
        platform: data.platform || 'android'
      })
      sendJson(res, HTTP_STATUS.OK, result)
    } catch (e) {
      sendError(res, HTTP_STATUS.BAD_REQUEST, 'invalid_request')
    }
  }

  const routes = [
    { method: 'GET', path: CAPABILITIES_ENDPOINT, handler: handleCapabilities },
    { method: 'POST', path: '/remote/v1/pairing/hello', handler: handlePairingHello },
    { method: 'POST', path: '/remote/v1/pairing/confirm', handler: handlePairingConfirm },
    { method: 'POST', path: '/remote/v1/pairing/finalize', handler: handlePairingFinalize },
    { method: 'POST', path: '/remote/v1/session/open', handler: handleSessionOpen },
    { method: 'POST', path: '/remote/v1/session/refresh', handler: handleSessionRefresh },
    { method: 'POST', path: '/remote/v1/session/close', handler: handleSessionClose },
    { method: 'GET', path: '/remote/v1/devices', handler: handleGetDevices },
    { method: 'PATCH', path: '/remote/v1/devices/:deviceId', handler: handleUpdateDevice },
    { method: 'DELETE', path: '/remote/v1/devices/:deviceId', handler: handleDeleteDevice },
    { method: 'GET', path: '/remote/v1/projects', handler: handleGetProjects },
    { method: 'GET', path: '/remote/v1/projects/:projectId', handler: handleGetProject },
    { method: 'GET', path: '/remote/v1/projects/:projectId/status', handler: handleGetProjectStatus },
    { method: 'GET', path: '/remote/v1/projects/:projectId/conversations', handler: handleGetProjectConversations },
    { method: 'POST', path: '/remote/v1/projects/:projectId/conversations', handler: handleCreateConversation },
    { method: 'GET', path: '/remote/v1/projects/:projectId/conversations/:conversationId/messages', handler: handleGetConversationMessages },
    { method: 'GET', path: '/remote/v1/conversations/:conversationId/messages', handler: handleGetConversationMessagesLegacy },
    { method: 'GET', path: '/remote/v1/projects/:projectId/runs', handler: handleGetProjectRuns },
    { method: 'GET', path: '/remote/v1/runs/:runId', handler: handleGetRun },
    { method: 'GET', path: '/remote/v1/interactions/pending', handler: handlePendingInteractions },
    { method: 'GET', path: '/remote/v1/interactions/:interactionId', handler: handleGetInteraction },
    { method: 'GET', path: '/remote/v1/projects/:projectId/files', handler: handleGetProjectFiles },
    { method: 'GET', path: '/remote/v1/files/:fileId', handler: handleGetFileInfo },
    { method: 'POST', path: '/remote/v1/files/:fileId/download-ticket', handler: handleCreateDownloadTicket },
    { method: 'GET', path: '/remote/v1/download/:ticketId', handler: handleFileDownload },
    { method: 'POST', path: '/remote/v1/files/:fileId/previews', handler: handleCreatePreview },
    { method: 'GET', path: '/remote/v1/previews/:previewId/manifest', handler: handleGetPreviewManifest },
    { method: 'GET', path: '/remote/v1/previews/:previewId/chunks/:chunkId', handler: handleGetPreviewChunk },
    { method: 'POST', path: '/remote/v1/commands', handler: handleSendCommand },
    { method: 'GET', path: '/remote/v1/commands/:commandId', handler: handleGetCommandStatus },
    { method: 'GET', path: '/remote/v1/sync/snapshot', handler: handleSyncSnapshot },
    { method: 'GET', path: '/remote/v1/network/status', handler: handleGetNetworkStatus },
    { method: 'GET', path: '/remote/v1/relay/status', handler: handleGetRelayStatus },
    { method: 'GET', path: '/remote/v1/push/status', handler: handleGetPushStatus },
    { method: 'POST', path: '/remote/v1/push/register', handler: handleRegisterPushToken }
  ]

  async function handleRequest(req, res) {
    setCorsHeaders(req, res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const pathname = url.pathname

    if (req.method === 'GET' && pathname === HEALTH_ENDPOINT) {
      sendJson(res, HTTP_STATUS.OK, {
        status: 'ok',
        service: 'karna-remote-gateway',
        version: '1.0.0',
        ts: Date.now(),
        uptime: process.uptime()
      })
      return
    }

    const auth = authenticateRequest(req)
    if (!auth.authenticated) {
      if (auditLogger) auditLogger.authFailure({ reason: auth.reason, path: pathname })
      return sendError(res, HTTP_STATUS.UNAUTHORIZED, auth.reason || 'authentication_required')
    }

    const matched = matchRoute(pathname, req.method, routes)
    if (matched) {
      try {
        await matched.handler(req, res, auth, matched.params)
      } catch (e) {
        if (auditLogger) auditLogger.error('request_handler_failed', { path: pathname, error: e.message })
        sendError(res, HTTP_STATUS.INTERNAL_ERROR, 'internal_error')
      }
      return
    }

    sendError(res, HTTP_STATUS.NOT_FOUND, 'not_found', { path: pathname })
  }

  function broadcastEvent(event) {
    const message = JSON.stringify(event)
    for (const client of activeEventConnections) {
      if (client.readyState === 1) {
        try {
          client.send(message)
        } catch (_) {}
      }
    }
  }

  function handleEventConnection(ws, req) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const cursor = url.searchParams.get('cursor') || '0'
    const sessionToken = url.searchParams.get('sessionToken')

    let authenticated = false
    let deviceId = null
    let sessionId = null
    let lastSentCursor = cursor

    activeEventConnections.add(ws)
    ws.isAlive = true

    function authenticateWs(token) {
      if (!sessionManager) return false
      const result = sessionManager.verifyToken(token)
      if (!result.valid) return false
      authenticated = true
      deviceId = result.deviceId
      sessionId = result.sessionId
      sessionManager.touchSession(sessionId)
      return true
    }

    if (sessionToken) {
      if (!authenticateWs(sessionToken)) {
        ws.send(JSON.stringify({ type: 'error', error: 'authentication_failed' }))
        ws.close(4001, 'authentication_failed')
        activeEventConnections.delete(ws)
        return
      }
    }

    ws.send(JSON.stringify({
      type: 'connection.ready',
      ts: Date.now(),
      serverTime: Date.now(),
      authenticated,
      latestCursor: eventStore ? eventStore.getLatestCursor() : '0'
    }))

    if (eventStore) {
      const missedEvents = eventStore.getEventsSince(cursor)
      for (const event of missedEvents) {
        ws.send(JSON.stringify(event))
        lastSentCursor = event.cursor
      }
    }

    ws.on('message', (raw) => {
      let message
      try {
        message = JSON.parse(raw.toString())
      } catch (_) {
        ws.send(JSON.stringify({ type: 'error', error: 'invalid_json' }))
        return
      }

      if (message.type === 'authenticate') {
        if (authenticateWs(message.sessionToken)) {
          ws.send(JSON.stringify({ type: 'authenticated', deviceId, sessionId }))
          if (eventStore) {
            const missedEvents = eventStore.getEventsSince(lastSentCursor)
            for (const event of missedEvents) {
              ws.send(JSON.stringify(event))
              lastSentCursor = event.cursor
            }
          }
        } else {
          ws.send(JSON.stringify({ type: 'error', error: 'authentication_failed' }))
        }
        return
      }

      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }))
        return
      }

      if (message.type === 'events.since' && eventStore) {
        const events = eventStore.getEventsSince(message.cursor || lastSentCursor)
        for (const event of events) {
          ws.send(JSON.stringify(event))
          lastSentCursor = event.cursor
        }
        ws.send(JSON.stringify({
          type: 'events.caught_up',
          latestCursor: eventStore.getLatestCursor()
        }))
        return
      }

      if (!authenticated) {
        ws.send(JSON.stringify({ type: 'error', error: 'not_authenticated' }))
      }
    })

    ws.on('pong', () => {
      ws.isAlive = true
    })

    ws.on('close', () => {
      activeEventConnections.delete(ws)
      if (sessionId && sessionManager) {
        sessionManager.touchSession(sessionId)
      }
    })

    ws.on('error', () => {
      activeEventConnections.delete(ws)
    })
  }

  const heartbeatInterval = setInterval(() => {
    for (const ws of activeEventConnections) {
      if (ws.isAlive === false) {
        activeEventConnections.delete(ws)
        return ws.terminate()
      }
      ws.isAlive = false
      try {
        ws.ping()
      } catch (_) {}
    }
  }, 30000)

  function healthCheck() {
    if (status !== 'running') return false
    return server && server.listening
  }

  async function start(options = {}) {
    if (status === 'running') {
      return { success: true, port: actualPort, alreadyRunning: true }
    }

    if (!identityManager || !identityManager.isAvailable()) {
      const error = new Error('safeStorage is not available; cannot start Remote Gateway')
      status = 'error'
      throw error
    }

    identityManager.initialize()

    if (deviceTrustStore) deviceTrustStore.initialize()
    if (sessionManager) sessionManager.initialize()
    if (pairingService) pairingService.initialize()
    if (authorizationManager) authorizationManager.initialize()
    if (eventStore) eventStore.initialize()
    if (auditLogger) auditLogger.initialize()
    if (projectFacade) projectFacade.initialize()
    if (commandGateway) commandGateway.initialize()
    if (interactionService) interactionService.initialize()
    if (artifactService) artifactService.initialize()
    if (resourceSnapshot) resourceSnapshot.initialize()
    if (qrCodeGenerator) qrCodeGenerator.initialize()
    if (relayClient && relayClient.setLanAvailable) {
      relayClient.setLanAvailable(networkUtils ? networkUtils.hasLanConnectivity() : false)
    }

    port = options.port || DEFAULT_PORT

    if (options.bindAddress) {
      bindAddress = options.bindAddress
    } else if (networkUtils) {
      bindAddress = networkUtils.selectBestBindAddress()
    } else {
      bindAddress = '127.0.0.1'
    }

    if (networkUtils) {
      const validation = networkUtils.validateBindAddress(bindAddress)
      if (!validation.valid) {
        status = 'error'
        throw new Error(`Invalid bind address: ${validation.reason}`)
      }
    }

    if (networkUtils && networkUtils.monitor) {
      networkUtils.monitor.on('lanConnectivityChanged', ({ available }) => {
        if (relayClient && relayClient.setLanAvailable) {
          relayClient.setLanAvailable(available)
        }
        if (eventStore) {
          eventStore.append('network_lan_changed', { available })
        }
      })
      networkUtils.monitor.start()
    }

    status = 'starting'

    try {
      if (options.tls && tlsCertificate) {
        tlsCert = tlsCertificate
        server = httpsDep.createServer({
          key: tlsCert.privateKey,
          cert: tlsCert.certPem
        }, handleRequest)
      } else {
        server = httpDep.createServer(handleRequest)
      }

      wss = new WsServer({
        server,
        path: EVENTS_WS_PATH
      })

      wss.on('connection', handleEventConnection)

      if (eventStore) {
        const originalAppend = eventStore.append
        eventStore.append = function(type, payload) {
          const event = originalAppend.call(this, type, payload)
          if (event) {
            process.nextTick(() => broadcastEvent(event))
          }
          return event
        }
      }

      await new Promise((resolve, reject) => {
        server.on('error', reject)
        server.listen(port, bindAddress, () => {
          actualPort = server.address().port
          resolve()
        })
      })

      status = 'running'

      if (auditLogger) auditLogger.serverStart({ bindAddress, port: actualPort, tls: Boolean(tlsCert) })
      if (eventStore) eventStore.append('server_started', { bindAddress, port: actualPort, tls: Boolean(tlsCert) })

      return {
        success: true,
        bindAddress,
        port: actualPort,
        tls: Boolean(tlsCert)
      }
    } catch (e) {
      status = 'error'
      if (auditLogger) auditLogger.error('server_start_failed', { error: e.message })
      throw e
    }
  }

  async function stop() {
    if (status === 'stopped') return { success: true }

    status = 'stopping'

    clearInterval(heartbeatInterval)

    if (networkUtils && networkUtils.monitor) {
      networkUtils.monitor.stop()
    }

    for (const ws of activeEventConnections) {
      try { ws.close(1000, 'server_shutdown') } catch (_) {}
    }
    activeEventConnections.clear()

    if (wss) {
      try { wss.close() } catch (_) {}
      wss = null
    }

    for (const session of (sessionManager ? sessionManager.listActiveSessions() : [])) {
      sessionManager.closeSession(session.id, 'server_stopped')
    }

    if (server) {
      await new Promise((resolve) => {
        server.close(() => resolve())
        setTimeout(resolve, 2000)
      })
      server = null
    }

    if (relayClient) {
      try { relayClient.disconnect('server_shutdown') } catch (_) {}
    }

    if (auditLogger) {
      auditLogger.serverStop({ reason: 'shutdown' })
      await auditLogger.shutdown()
    }
    if (eventStore) eventStore.append('server_stopped', { reason: 'shutdown' })

    commandStatusMap.clear()
    status = 'stopped'
    bindAddress = null
    port = null
    actualPort = null
    tlsCert = null

    return { success: true }
  }

  return Object.freeze({
    start,
    stop,
    getStatus,
    healthCheck,
    setRuntimeBridge,
    API_PREFIX,
    CAPABILITIES_ENDPOINT,
    EVENTS_WS_PATH
  })
}

module.exports = {
  createRemoteServer,
  DEFAULT_PORT,
  API_PREFIX,
  CAPABILITIES_ENDPOINT,
  EVENTS_WS_PATH,
  HTTP_STATUS
}
