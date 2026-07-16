'use strict'

const { createPairingService } = require('./pairing-service.cjs')

function createQrCodeGenerator(deps = {}) {
  const {
    pairingService,
    networkUtils,
    tlsCert
  } = deps

  function buildBaseUrl(host, port, useTls) {
    const protocol = useTls ? 'https' : 'http'
    return `${protocol}://${host}:${port}`
  }

  function getLocalAddresses() {
    if (!networkUtils || typeof networkUtils.getLocalAddresses !== 'function') {
      return ['localhost', '127.0.0.1']
    }
    const addresses = networkUtils.getLocalAddresses()
    return [...new Set(['localhost', '127.0.0.1', ...addresses])]
  }

  function generatePairingOffer(serverInfo = {}) {
    if (!pairingService) {
      return { ok: false, error: 'pairing_service_unavailable' }
    }

    const { port, bindAddress = '0.0.0.0', useTls = false, deviceName } = serverInfo

    const localAddresses = getLocalAddresses()
    const baseUrls = localAddresses.map(addr => buildBaseUrl(addr, port, useTls))

    const helloResult = pairingService.hello({
      name: deviceName || 'Remote Device'
    })

    const primaryBaseUrl = baseUrls[0]
    const qrPayload = pairingService.generateQrPayload(primaryBaseUrl, helloResult.token)

    return {
      ok: true,
      token: helloResult.token,
      sasCode: helloResult.sasCode,
      serverPublicKey: helloResult.serverPublicKey,
      serverFingerprint: helloResult.serverFingerprint,
      expiresAt: helloResult.expiresAt,
      tlsCertFingerprint: helloResult.tlsCertFingerprint,
      qrPayload,
      qrData: {
        v: 1,
        type: 'karna-remote-pair',
        token: helloResult.token,
        urls: baseUrls,
        serverFingerprint: helloResult.serverFingerprint,
        tlsCertFingerprint: helloResult.tlsCertFingerprint,
        t: Date.now()
      },
      endpoints: {
        hello: `${primaryBaseUrl}/remote/v1/pairing/hello`,
        confirm: `${primaryBaseUrl}/remote/v1/pairing/confirm`,
        finalize: `${primaryBaseUrl}/remote/v1/pairing/finalize`,
        events: `${useTls ? 'wss' : 'ws'}://${localAddresses[0]}:${port}/remote/v1/events`
      },
      localAddresses,
      baseUrls
    }
  }

  function getPairingOffer(token, serverInfo = {}) {
    if (!pairingService) {
      return { ok: false, error: 'pairing_service_unavailable' }
    }

    const { port, useTls = false } = serverInfo
    const localAddresses = getLocalAddresses()
    const primaryBaseUrl = buildBaseUrl(localAddresses[0], port, useTls)

    const offer = pairingService.getPairingOffer(primaryBaseUrl, token)
    if (!offer) {
      return { ok: false, error: 'pairing_not_found' }
    }

    return {
      ok: true,
      ...offer,
      qrData: {
        v: 1,
        type: 'karna-remote-pair',
        token,
        urls: localAddresses.map(addr => buildBaseUrl(addr, port, useTls)),
        serverFingerprint: offer.serverFingerprint,
        tlsCertFingerprint: offer.tlsCertFingerprint,
        t: Date.now()
      }
    }
  }

  function initialize() {
  }

  return Object.freeze({
    initialize,
    generatePairingOffer,
    getPairingOffer,
    buildBaseUrl,
    getLocalAddresses
  })
}

module.exports = { createQrCodeGenerator }
