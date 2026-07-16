package com.karna.android.core.network

import android.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okio.ByteString
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlin.math.min
import kotlin.random.Random

private fun generateRoutingId(): String {
    val bytes = ByteArray(32)
    SecureRandom().nextBytes(bytes)
    return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
}

data class EncryptedRelayEnvelopeV1(
    val version: String = "v1",
    val nonce: String,
    val sourceRoutingId: String,
    val targetRoutingId: String,
    val expiresAt: Long,
    val ciphertext: String
)

data class RelayMessage(
    val from: String,
    val to: String,
    val payload: String,
    val envelope: EncryptedRelayEnvelopeV1
)

enum class RelayState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    AUTHENTICATING,
    AUTHENTICATED,
    RECONNECTING,
    ERROR
}

data class RelayConfig(
    val relayUrl: String = "wss://relay.karna.dev/relay/v1/ws",
    val deviceId: String = "",
    val routingId: String = generateRoutingId(),
    val authToken: String = "",
    val autoReconnect: Boolean = true,
    val lanPreferred: Boolean = true
)

class RelayCrypto {
    companion object {
        private const val AES_KEY_SIZE = 32
        private const val GCM_IV_SIZE = 12
        private const val GCM_TAG_SIZE = 128
        private const val ENVELOPE_TTL_MS = 5 * 60 * 1000L

        fun generateKey(): ByteArray {
            val key = ByteArray(AES_KEY_SIZE)
            SecureRandom().nextBytes(key)
            return key
        }

        fun generateNonce(length: Int = 24): String {
            val bytes = ByteArray(length)
            SecureRandom().nextBytes(bytes)
            return base64UrlEncode(bytes)
        }

        fun encrypt(
            plaintext: String,
            sourceRoutingId: String,
            targetRoutingId: String,
            sessionKey: ByteArray,
            ttlMs: Long = ENVELOPE_TTL_MS
        ): EncryptedRelayEnvelopeV1 {
            val iv = ByteArray(GCM_IV_SIZE)
            SecureRandom().nextBytes(iv)

            val keySpec = SecretKeySpec(sessionKey, "AES")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            val gcmSpec = GCMParameterSpec(GCM_TAG_SIZE, iv)
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, gcmSpec)

            val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))

            val ivB64 = base64UrlEncode(iv)
            val ctB64 = base64UrlEncode(ciphertext)

            return EncryptedRelayEnvelopeV1(
                nonce = generateNonce(),
                sourceRoutingId = sourceRoutingId,
                targetRoutingId = targetRoutingId,
                expiresAt = System.currentTimeMillis() + ttlMs,
                ciphertext = "$ivB64.$ctB64"
            )
        }

        fun decrypt(envelope: EncryptedRelayEnvelopeV1, sessionKey: ByteArray): String {
            val parts = envelope.ciphertext.split(".")
            if (parts.size != 2) {
                throw IllegalArgumentException("Invalid ciphertext format")
            }

            val iv = base64UrlDecode(parts[0])
            val ciphertext = base64UrlDecode(parts[1])

            val keySpec = SecretKeySpec(sessionKey, "AES")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            val gcmSpec = GCMParameterSpec(GCM_TAG_SIZE, iv)
            cipher.init(Cipher.DECRYPT_MODE, keySpec, gcmSpec)

            val plaintext = cipher.doFinal(ciphertext)
            return String(plaintext, Charsets.UTF_8)
        }

        private fun base64UrlEncode(bytes: ByteArray): String {
            return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        }

        private fun base64UrlDecode(str: String): ByteArray {
            return Base64.decode(str, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        }

        fun keyToBase64(key: ByteArray): String = base64UrlEncode(key)

        fun base64ToKey(b64: String): ByteArray = base64UrlDecode(b64)
    }
}

class RelayConnection(
    private val client: OkHttpClient,
    private val config: RelayConfig,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
) {
    private val _state = MutableStateFlow<RelayState>(RelayState.DISCONNECTED)
    val state: StateFlow<RelayState> = _state.asStateFlow()

    private val _messages = MutableStateFlow<RelayMessage?>(null)
    val messages: StateFlow<RelayMessage?> = _messages.asStateFlow()

    private val _isLanAvailable = MutableStateFlow(false)
    val isLanAvailable: StateFlow<Boolean> = _isLanAvailable.asStateFlow()

    private val _isPeerAvailable = MutableStateFlow(false)
    val isPeerAvailable: StateFlow<Boolean> = _isPeerAvailable.asStateFlow()

    private val _networkStateMachine = NetworkStateMachine()
    val networkStateMachine: NetworkStateMachine get() = _networkStateMachine

    private var webSocket: KarnaWebSocket? = null
    private var reconnectJob: Job? = null
    private var reconnectAttempts = 0
    private val sessionKeys = mutableMapOf<String, ByteArray>()
    private val pendingMessages = mutableListOf<PendingMessage>()
    private val pendingNonces = mutableSetOf<String>()
    private val offlineCache = mutableListOf<EncryptedRelayEnvelopeV1>()

    private val maxReconnectDelayMs = 60_000L
    private val baseReconnectDelayMs = 1_000L
    private val jitterMs = 500L
    private val maxEnvelopeSize = 1024 * 1024
    private val offlineTtlMs = 24 * 60 * 60 * 1000L

    data class PendingMessage(
        val targetRoutingId: String,
        val plaintext: String,
        val attempts: Int = 0,
        val maxAttempts: Int = 10
    )

    fun getStatus() = mapOf(
        "state" to _state.value.name,
        "routingId" to config.routingId,
        "lanAvailable" to _isLanAvailable.value,
        "peerAvailable" to _isPeerAvailable.value,
        "reconnectAttempts" to reconnectAttempts,
        "queuedMessages" to pendingMessages.size,
        "networkMode" to _networkStateMachine.getCurrentMode().name
    )

    fun getRoutingId(): String = config.routingId

    fun setLanAvailable(available: Boolean) {
        val previous = _isLanAvailable.value
        _isLanAvailable.value = available
        if (available && config.lanPreferred) {
            _networkStateMachine.transition(NetworkEvent.SwitchToLan)
        } else if (!available && previous) {
            _networkStateMachine.transition(NetworkEvent.LanConnectionLost)
            if (_state.value != RelayState.AUTHENTICATED) {
                connect()
            }
        }
    }

    fun setPeerAvailable(available: Boolean) {
        val previous = _isPeerAvailable.value
        _isPeerAvailable.value = available
        if (available && !_isLanAvailable.value) {
            _networkStateMachine.transition(NetworkEvent.SwitchToPeer)
        } else if (!available && previous && _isLanAvailable.value) {
            _networkStateMachine.transition(NetworkEvent.PeerConnectionLost)
        }
    }

    fun setSessionKey(peerRoutingId: String, key: ByteArray) {
        sessionKeys[peerRoutingId] = key
        deliverCachedMessages(peerRoutingId)
    }

    fun setSessionKeyFromBase64(peerRoutingId: String, keyB64: String) {
        setSessionKey(peerRoutingId, RelayCrypto.base64ToKey(keyB64))
    }

    fun generateSessionKey(): ByteArray = RelayCrypto.generateKey()

    fun connect() {
        if (_isLanAvailable.value && config.lanPreferred) {
            _networkStateMachine.transition(NetworkEvent.ConnectedLan)
            return
        }

        if (_state.value == RelayState.CONNECTED ||
            _state.value == RelayState.AUTHENTICATED ||
            _state.value == RelayState.CONNECTING) {
            return
        }

        _state.value = RelayState.CONNECTING
        _networkStateMachine.transition(NetworkEvent.Connect)

        val ws = KarnaWebSocket(client, scope)
        webSocket = ws
        reconnectAttempts = 0

        scope.launch {
            ws.events.collect { event ->
                when (event) {
                    is WebSocketEvent.Connected -> {
                        _state.value = RelayState.AUTHENTICATING
                        authenticate()
                    }
                    is WebSocketEvent.MessageReceived -> {
                        handleMessage(event.text)
                    }
                    is WebSocketEvent.BinaryReceived -> {
                        handleBinaryMessage(event.bytes)
                    }
                    is WebSocketEvent.Disconnected -> {
                        if (_state.value != RelayState.DISCONNECTED) {
                            _state.value = RelayState.DISCONNECTED
                            _networkStateMachine.transition(NetworkEvent.RelayConnectionLost)
                            scheduleReconnect()
                        }
                    }
                    is WebSocketEvent.ConnectionFailed -> {
                        _state.value = RelayState.ERROR
                        _networkStateMachine.transition(NetworkEvent.ConnectionLost)
                        scheduleReconnect()
                    }
                    null -> {}
                }
            }
        }

        val url = buildString {
            append(config.relayUrl)
            append(if (config.relayUrl.contains("?")) "&" else "?")
            append("routingId=")
            append(config.routingId)
        }

        ws.connect(url)
    }

    fun send(targetRoutingId: String, payload: String): Boolean {
        if (_isLanAvailable.value && config.lanPreferred) {
            pendingMessages.add(PendingMessage(targetRoutingId, payload))
            return false
        }

        val sessionKey = sessionKeys[targetRoutingId]
        if (sessionKey == null) {
            pendingMessages.add(PendingMessage(targetRoutingId, payload))
            if (_state.value == RelayState.DISCONNECTED || _state.value == RelayState.ERROR) {
                connect()
            }
            return false
        }

        if (_state.value != RelayState.AUTHENTICATED) {
            pendingMessages.add(PendingMessage(targetRoutingId, payload))
            if (_state.value == RelayState.DISCONNECTED) {
                connect()
            }
            return false
        }

        return try {
            val envelope = RelayCrypto.encrypt(
                payload,
                config.routingId,
                targetRoutingId,
                sessionKey
            )

            if (pendingNonces.contains(envelope.nonce)) {
                return false
            }
            pendingNonces.add(envelope.nonce)
            scope.launch {
                delay(300000)
                pendingNonces.remove(envelope.nonce)
            }

            val serialized = """
                {"version":"${envelope.version}","nonce":"${envelope.nonce}","sourceRoutingId":"${envelope.sourceRoutingId}","targetRoutingId":"${envelope.targetRoutingId}","expiresAt":${envelope.expiresAt},"ciphertext":"${envelope.ciphertext}"}
            """.trimIndent()

            if (serialized.toByteArray().size > maxEnvelopeSize) {
                return false
            }

            val sent = webSocket?.send(serialized) == true
            if (!sent) {
                pendingMessages.add(PendingMessage(targetRoutingId, payload))
            }
            sent
        } catch (e: Exception) {
            pendingMessages.add(PendingMessage(targetRoutingId, payload))
            false
        }
    }

    fun disconnect() {
        reconnectJob?.cancel()
        reconnectJob = null
        webSocket?.close(1000, "User initiated disconnect")
        webSocket = null
        _state.value = RelayState.DISCONNECTED
    }

    fun shutdown() {
        disconnect()
        sessionKeys.clear()
        pendingMessages.clear()
        pendingNonces.clear()
        offlineCache.clear()
    }

    private fun authenticate() {
        if (config.authToken.isNotEmpty()) {
            val authMessage = """
                {"type":"auth","routingId":"${config.routingId}","token":"${config.authToken}","timestamp":${System.currentTimeMillis()}}
            """.trimIndent()
            webSocket?.send(authMessage)
        }

        _state.value = RelayState.AUTHENTICATED
        _networkStateMachine.transition(NetworkEvent.ConnectedRelay)
        flushPendingMessages()
        deliverOfflineMessages()
    }

    private fun handleMessage(text: String) {
        try {
            val json = org.json.JSONObject(text)

            if (json.has("error")) {
                return
            }

            if (json.optString("type") == "auth_ok") {
                _state.value = RelayState.AUTHENTICATED
                _networkStateMachine.transition(NetworkEvent.ConnectedRelay)
                flushPendingMessages()
                deliverOfflineMessages()
                return
            }

            if (json.optString("version") == "v1") {
                handleEnvelope(EncryptedRelayEnvelopeV1(
                    nonce = json.getString("nonce"),
                    sourceRoutingId = json.getString("sourceRoutingId"),
                    targetRoutingId = json.getString("targetRoutingId"),
                    expiresAt = json.getLong("expiresAt"),
                    ciphertext = json.getString("ciphertext")
                ))
            }
        } catch (_: Exception) {}
    }

    private fun handleBinaryMessage(bytes: ByteString) {
        // Reserved for future binary message support
    }

    private fun handleEnvelope(envelope: EncryptedRelayEnvelopeV1) {
        if (envelope.expiresAt < System.currentTimeMillis()) {
            return
        }

        val sessionKey = sessionKeys[envelope.sourceRoutingId]
        if (sessionKey == null) {
            offlineCache.add(envelope)
            cleanupOfflineCache()
            return
        }

        try {
            val plaintext = RelayCrypto.decrypt(envelope, sessionKey)
            _messages.value = RelayMessage(
                from = envelope.sourceRoutingId,
                to = envelope.targetRoutingId,
                payload = plaintext,
                envelope = envelope
            )
        } catch (e: Exception) {
            offlineCache.add(envelope)
        }
    }

    private fun scheduleReconnect() {
        if (reconnectJob?.isActive == true || !config.autoReconnect) {
            return
        }

        if (_isLanAvailable.value) {
            _networkStateMachine.transition(NetworkEvent.SwitchToLan)
            return
        }

        _state.value = RelayState.RECONNECTING
        _networkStateMachine.transition(NetworkEvent.StartReconnect)

        val delayMs = calculateReconnectDelay()
        reconnectJob = scope.launch {
            delay(delayMs)
            if (isActive && _state.value == RelayState.RECONNECTING) {
                connect()
            }
        }
    }

    private fun calculateReconnectDelay(): Long {
        val exponentialDelay = baseReconnectDelayMs * (1L shl min(reconnectAttempts, 10))
        val withJitter = exponentialDelay + Random.nextLong(0, jitterMs)
        reconnectAttempts++
        return min(withJitter, maxReconnectDelayMs)
    }

    private fun flushPendingMessages() {
        val messages = ArrayList(pendingMessages)
        pendingMessages.clear()
        for (msg in messages) {
            if (msg.attempts >= msg.maxAttempts) {
                continue
            }
            send(msg.targetRoutingId, msg.plaintext)
        }
    }

    private fun deliverOfflineMessages() {
        val messages = ArrayList(offlineCache)
        offlineCache.clear()
        for (envelope in messages) {
            handleEnvelope(envelope)
        }
    }

    private fun deliverCachedMessages(peerRoutingId: String) {
        val messages = offlineCache.filter { it.sourceRoutingId == peerRoutingId }
        offlineCache.removeAll(messages)
        for (envelope in messages) {
            handleEnvelope(envelope)
        }
        flushPendingMessages()
    }

    private fun cleanupOfflineCache() {
        val now = System.currentTimeMillis()
        offlineCache.removeAll { it.expiresAt < now - offlineTtlMs }
        if (offlineCache.size > 1000) {
            offlineCache.subList(0, offlineCache.size - 1000).clear()
        }
    }
}
