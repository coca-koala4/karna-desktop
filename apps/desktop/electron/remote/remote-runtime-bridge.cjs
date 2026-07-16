'use strict'

const WebSocket = require('ws')

const DEFAULT_GATEWAY_PORT = 17891
const WS_PATH = '/api/ws'

const RUNTIME_EVENTS = Object.freeze({
  CONNECTION_READY: 'connection.ready',
  GATEWAY_READY: 'gateway.ready',
  SESSION_INFO: 'session.info',
  MESSAGE_START: 'message.start',
  MESSAGE_DELTA: 'message.delta',
  MESSAGE_COMPLETE: 'message.complete',
  TOOL_START: 'tool.start',
  TOOL_COMPLETE: 'tool.complete',
  CLARIFY_REQUEST: 'clarify.request',
  APPROVAL_REQUEST: 'approval.request',
  STATUS_UPDATE: 'status.update',
  RUN_UPDATE: 'run.update',
  NODE_UPDATE: 'node.update',
  BRIDGE_CONNECTED: 'bridge.connected',
  BRIDGE_DISCONNECTED: 'bridge.disconnected',
  BRIDGE_ERROR: 'bridge.error'
})

const SESSION_METHODS = Object.freeze({
  SESSION_CREATE: 'session.create',
  SESSION_RESUME: 'session.resume',
  SESSION_HISTORY: 'session.history',
  SESSION_INTERRUPT: 'session.interrupt',
  PROMPT_SUBMIT: 'prompt.submit',
  CLARIFY_RESPOND: 'clarify.respond',
  APPROVAL_RESPOND: 'approval.respond'
})

const EVENT_VERSION = 'v1'
const RECONNECT_DELAY_MS = 1000
const MAX_RECONNECT_ATTEMPTS = 10
const REQUEST_TIMEOUT_MS = 60000

let eventSequence = 0

function nextEventSequence() {
  eventSequence += 1
  return eventSequence
}

function createRuntimeBridge(deps = {}) {
  const {
    eventStore,
    auditLogger,
    gatewayPort,
    getGatewayPort,
    WebSocketImpl = WebSocket
  } = deps

  let ws = null
  let connected = false
  let gatewayReady = false
  let reconnectAttempts = 0
  let reconnectTimer = null
  let currentPort = gatewayPort || null
  let pendingRequests = new Map()
  let requestSeq = 0
  let sessionEventMap = new Map()
  let sessionSubscriptions = new Map()

  function generateRequestId() {
    requestSeq += 1
    return `rpc_${Date.now()}_${requestSeq}`
  }

  function toRemoteEvent(type, payload = {}) {
    return {
      v: EVENT_VERSION,
      seq: nextEventSequence(),
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      ts: Date.now(),
      type,
      payload
    }
  }

  function appendEvent(type, payload) {
    if (!eventStore) return null
    const event = toRemoteEvent(type, payload)
    eventStore.append(`runtime.${type}`, event)
    return event
  }

  function emitSessionEvent(sessionId, type, payload) {
    appendEvent(type, { session_id: sessionId, ...payload })
    const listeners = sessionSubscriptions.get(sessionId)
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(type, { session_id: sessionId, ...payload })
        } catch (_) {
        }
      }
    }
  }

  function handleEventMessage(params) {
    if (!params || typeof params !== 'object') return

    const { type, session_id } = params
    const payload = params.payload || params

    switch (type) {
      case 'gateway.ready':
        gatewayReady = true
        appendEvent(RUNTIME_EVENTS.GATEWAY_READY, payload)
        appendEvent(RUNTIME_EVENTS.CONNECTION_READY, { connected: true, gatewayReady: true })
        break

      case 'session.info':
        emitSessionEvent(session_id, RUNTIME_EVENTS.SESSION_INFO, payload)
        break

      case 'message.start':
        emitSessionEvent(session_id, RUNTIME_EVENTS.MESSAGE_START, payload)
        break

      case 'message.delta':
        emitSessionEvent(session_id, RUNTIME_EVENTS.MESSAGE_DELTA, payload)
        break

      case 'message.complete':
        emitSessionEvent(session_id, RUNTIME_EVENTS.MESSAGE_COMPLETE, payload)
        break

      case 'tool.start':
        emitSessionEvent(session_id, RUNTIME_EVENTS.TOOL_START, payload)
        break

      case 'tool.complete':
        emitSessionEvent(session_id, RUNTIME_EVENTS.TOOL_COMPLETE, payload)
        break

      case 'clarify.request':
        emitSessionEvent(session_id, RUNTIME_EVENTS.CLARIFY_REQUEST, payload)
        if (payload && payload.interaction_id) {
          sessionEventMap.set(payload.interaction_id, { type: 'clarify', session_id, ...payload })
        }
        break

      case 'approval.request':
        emitSessionEvent(session_id, RUNTIME_EVENTS.APPROVAL_REQUEST, payload)
        if (payload && payload.interaction_id) {
          sessionEventMap.set(payload.interaction_id, { type: 'approval', session_id, ...payload })
        }
        break

      case 'status.update':
        emitSessionEvent(session_id, RUNTIME_EVENTS.STATUS_UPDATE, payload)
        break

      case 'run.update':
        emitSessionEvent(session_id, RUNTIME_EVENTS.RUN_UPDATE, payload)
        break

      case 'node.update':
        emitSessionEvent(session_id, RUNTIME_EVENTS.NODE_UPDATE, payload)
        break

      default:
        appendEvent(type, payload)
        break
    }
  }

  function handleRpcResponse(msg) {
    const { id, result, error } = msg

    if (id && pendingRequests.has(id)) {
      const { resolve, reject } = pendingRequests.get(id)
      pendingRequests.delete(id)
      if (error) {
        const errMsg = (error && (error.message || error.data)) ? (error.message || JSON.stringify(error)) : 'RPC error'
        reject(new Error(errMsg))
      } else {
        resolve(result)
      }
      return true
    }
    return false
  }

  function handleRuntimeMessage(rawData) {
    let msg
    try {
      msg = typeof rawData === 'string' ? JSON.parse(rawData) : rawData
    } catch (_) {
      return
    }

    if (!msg || typeof msg !== 'object') return

    if (msg.jsonrpc !== '2.0') return

    if (msg.method === 'event') {
      handleEventMessage(msg.params)
      return
    }

    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      handleRpcResponse(msg)
    }
  }

  async function connect() {
    if (connected && gatewayReady) return { connected: true, gatewayReady: true }

    if (!currentPort && typeof getGatewayPort === 'function') {
      try {
        currentPort = await getGatewayPort()
      } catch (_) {
        currentPort = null
      }
    }

    if (!currentPort) {
      currentPort = DEFAULT_GATEWAY_PORT
    }

    const wsUrl = `ws://127.0.0.1:${currentPort}${WS_PATH}`

    return new Promise((resolve, reject) => {
      try {
        ws = new WebSocketImpl(wsUrl)
      } catch (err) {
        reject(err)
        return
      }

      const connectTimeout = setTimeout(() => {
        try { if (ws && typeof ws.terminate === 'function') ws.terminate() } catch (_) {}
        reject(new Error('WebSocket connection timeout'))
      }, 10000)

      let readyResolved = false

      ws.on('open', () => {
        clearTimeout(connectTimeout)
        connected = true
        gatewayReady = false
        reconnectAttempts = 0
        appendEvent(RUNTIME_EVENTS.BRIDGE_CONNECTED, { port: currentPort, url: wsUrl })
        if (auditLogger) auditLogger.log('runtime_bridge_connected', { port: currentPort })
      })

      ws.on('message', (data) => {
        const message = data.toString()
        handleRuntimeMessage(message)

        if (!readyResolved && gatewayReady) {
          readyResolved = true
          resolve({ connected: true, gatewayReady: true, port: currentPort })
        }
      })

      ws.on('error', (err) => {
        clearTimeout(connectTimeout)
        if (!readyResolved && !connected) {
          reject(err)
        }
        appendEvent(RUNTIME_EVENTS.BRIDGE_ERROR, { message: err.message })
      })

      ws.on('close', () => {
        clearTimeout(connectTimeout)
        const wasConnected = connected
        connected = false
        gatewayReady = false
        ws = null
        appendEvent(RUNTIME_EVENTS.BRIDGE_DISCONNECTED, { wasConnected })

        for (const [, { reject }] of pendingRequests) {
          reject(new Error('WebSocket disconnected'))
        }
        pendingRequests.clear()

        if (wasConnected && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts += 1
          reconnectTimer = setTimeout(() => {
            connect().catch(() => {})
          }, RECONNECT_DELAY_MS * reconnectAttempts)
        }

        if (!readyResolved) {
          readyResolved = true
          if (!wasConnected) {
            reject(new Error('WebSocket closed before ready'))
          } else {
            resolve({ connected: false, gatewayReady: false })
          }
        }
      })
    })
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      try { ws.close() } catch (_) {}
      ws = null
    }
    connected = false
    gatewayReady = false
    reconnectAttempts = 0
    for (const [, { reject }] of pendingRequests) {
      reject(new Error('Bridge disconnected'))
    }
    pendingRequests.clear()
    sessionSubscriptions.clear()
  }

  function sendRequest(method, params = {}) {
    if (!ws || !connected) {
      return Promise.reject(new Error('Runtime bridge not connected'))
    }

    const id = generateRequestId()
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(id)
        reject(new Error(`Request timeout: ${method}`))
      }, REQUEST_TIMEOUT_MS)

      pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout)
          resolve(result)
        },
        reject: (err) => {
          clearTimeout(timeout)
          reject(err)
        }
      })

      try {
        ws.send(JSON.stringify(message))
      } catch (err) {
        clearTimeout(timeout)
        pendingRequests.delete(id)
        reject(err)
      }
    })
  }

  function sessionCreate(params = {}) {
    return sendRequest(SESSION_METHODS.SESSION_CREATE, params)
  }

  function sessionResume(sessionId, params = {}) {
    return sendRequest(SESSION_METHODS.SESSION_RESUME, { session_id: sessionId, ...params })
  }

  function sessionHistory(sessionId, params = {}) {
    return sendRequest(SESSION_METHODS.SESSION_HISTORY, { session_id: sessionId, ...params })
  }

  function sessionInterrupt(sessionId, params = {}) {
    return sendRequest(SESSION_METHODS.SESSION_INTERRUPT, { session_id: sessionId, ...params })
  }

  function promptSubmit(sessionId, prompt, params = {}) {
    return sendRequest(SESSION_METHODS.PROMPT_SUBMIT, { session_id: sessionId, prompt, ...params })
  }

  function clarifyRespond(sessionId, interactionId, response, params = {}) {
    return sendRequest(SESSION_METHODS.CLARIFY_RESPOND, {
      session_id: sessionId,
      interaction_id: interactionId,
      response,
      ...params
    })
  }

  function approvalRespond(sessionId, interactionId, approved, params = {}) {
    return sendRequest(SESSION_METHODS.APPROVAL_RESPOND, {
      session_id: sessionId,
      interaction_id: interactionId,
      approved,
      ...params
    })
  }

  function subscribeSession(sessionId, listener) {
    if (!sessionSubscriptions.has(sessionId)) {
      sessionSubscriptions.set(sessionId, new Set())
    }
    sessionSubscriptions.get(sessionId).add(listener)
    return () => {
      const listeners = sessionSubscriptions.get(sessionId)
      if (listeners) {
        listeners.delete(listener)
        if (listeners.size === 0) {
          sessionSubscriptions.delete(sessionId)
        }
      }
    }
  }

  async function handleRemoteMessage(message, context = {}) {
    const { type, payload } = message
    const { sessionId } = context

    try {
      switch (type) {
        case 'session.create':
          return { type: 'session.created', result: await sessionCreate(payload) }
        case 'session.resume':
          return { type: 'session.resumed', result: await sessionResume(payload?.session_id || payload?.sessionId || sessionId, payload) }
        case 'session.history':
          return { type: 'session.history', result: await sessionHistory(payload?.session_id || payload?.sessionId || sessionId, payload) }
        case 'session.interrupt':
          return { type: 'session.interrupted', result: await sessionInterrupt(payload?.session_id || payload?.sessionId || sessionId, payload) }
        case 'prompt.submit':
          return { type: 'prompt.submitted', result: await promptSubmit(payload?.session_id || payload?.sessionId || sessionId, payload?.prompt, payload) }
        case 'clarify.respond':
          return { type: 'clarify.responded', result: await clarifyRespond(payload?.session_id || payload?.sessionId || sessionId, payload?.interaction_id || payload?.interactionId, payload?.response, payload) }
        case 'approval.respond':
          return { type: 'approval.responded', result: await approvalRespond(payload?.session_id || payload?.sessionId || sessionId, payload?.interaction_id || payload?.interactionId, payload?.approved, payload) }
        default:
          return { type: 'error', error: `unknown_method: ${type}` }
      }
    } catch (err) {
      return { type: 'error', error: err.message }
    }
  }

  function isConnected() {
    return connected && gatewayReady
  }

  function getStatus() {
    return {
      connected,
      gatewayReady,
      port: currentPort,
      reconnectAttempts,
      pendingRequests: pendingRequests.size
    }
  }

  function initialize() {
    pendingRequests = new Map()
    sessionEventMap = new Map()
    sessionSubscriptions = new Map()
    requestSeq = 0
  }

  return Object.freeze({
    initialize,
    connect,
    disconnect,
    isConnected,
    getStatus,
    handleMessage: handleRemoteMessage,
    sessionCreate,
    sessionResume,
    sessionHistory,
    sessionInterrupt,
    promptSubmit,
    clarifyRespond,
    approvalRespond,
    subscribeSession,
    RUNTIME_EVENTS,
    SESSION_METHODS
  })
}

module.exports = {
  createRuntimeBridge,
  RUNTIME_EVENTS,
  SESSION_METHODS,
  EVENT_VERSION
}
