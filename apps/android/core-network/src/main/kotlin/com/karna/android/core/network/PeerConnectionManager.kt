package com.karna.android.core.network

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap

enum class PeerConnectionState {
    IDLE,
    CONNECTING,
    CONNECTED,
    DISCONNECTED,
    FAILED
}

enum class DataChannelState {
    CONNECTING,
    OPEN,
    CLOSING,
    CLOSED
}

data class IceCandidate(
    val sdpMid: String?,
    val sdpMLineIndex: Int,
    val sdp: String
)

data class SessionDescription(
    val type: String,
    val sdp: String
)

data class PeerConnectionConfig(
    val stunServers: List<String> = listOf(
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302"
    ),
    val turnServers: List<TurnServer> = emptyList(),
    val dataChannelLabel: String = "karna-data",
    val relayFallback: Boolean = true
)

data class TurnServer(
    val urls: List<String>,
    val username: String? = null,
    val credential: String? = null
)

data class DataChannelMessage(
    val channelId: String,
    val data: ByteArray,
    val isBinary: Boolean
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is DataChannelMessage) return false
        return channelId == other.channelId && data.contentEquals(other.data)
    }

    override fun hashCode(): Int {
        var result = channelId.hashCode()
        result = 31 * result + data.contentHashCode()
        return result
    }
}

interface SignalingChannel {
    fun sendOffer(peerId: String, sdp: SessionDescription)
    fun sendAnswer(peerId: String, sdp: SessionDescription)
    fun sendIceCandidate(peerId: String, candidate: IceCandidate)
    fun setOnOfferListener(listener: (String, SessionDescription) -> Unit)
    fun setOnAnswerListener(listener: (String, SessionDescription) -> Unit)
    fun setOnIceCandidateListener(listener: (String, IceCandidate) -> Unit)
}

class PeerConnectionManager(
    private val config: PeerConnectionConfig = PeerConnectionConfig(),
    private val relayConnection: RelayConnection? = null,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
) {
    private val _state = MutableStateFlow(PeerConnectionState.IDLE)
    val state: StateFlow<PeerConnectionState> = _state.asStateFlow()

    private val _channelState = MutableStateFlow(DataChannelState.CLOSED)
    val channelState: StateFlow<DataChannelState> = _channelState.asStateFlow()

    private val _messages = MutableStateFlow<DataChannelMessage?>(null)
    val messages: StateFlow<DataChannelMessage?> = _messages.asStateFlow()

    private val _connectedPeers = MutableStateFlow<Set<String>>(emptySet())
    val connectedPeers: StateFlow<Set<String>> = _connectedPeers.asStateFlow()

    private val peerConnections = ConcurrentHashMap<String, Any>()
    private val dataChannels = ConcurrentHashMap<String, Any>()
    private var signalingChannel: SignalingChannel? = null
    private var localPeerId: String = generatePeerId()

    fun getLocalPeerId(): String = localPeerId

    fun setSignalingChannel(channel: SignalingChannel) {
        signalingChannel = channel
        setupSignalingListeners()
    }

    fun setRelayConnection(relay: RelayConnection) {
        // Phase 12 placeholder: WebRTC signaling will go through relay when implemented
    }

    fun createOffer(peerId: String) {
        _state.value = PeerConnectionState.CONNECTING

        scope.launch {
            relayConnection?.send(peerId, """
                {"type":"webrtc.offer_request","peerId":"$localPeerId","timestamp":${System.currentTimeMillis()}}
            """.trimIndent())
        }
    }

    fun createAnswer(peerId: String, offer: SessionDescription) {
        scope.launch {
            relayConnection?.send(peerId, """
                {"type":"webrtc.answer","peerId":"$localPeerId","timestamp":${System.currentTimeMillis()}}
            """.trimIndent())
        }
    }

    fun addIceCandidate(peerId: String, candidate: IceCandidate) {
        // Phase 12 placeholder: Full WebRTC implementation will be added later
    }

    fun sendData(peerId: String, data: ByteArray, binary: Boolean = true): Boolean {
        return if (_state.value == PeerConnectionState.CONNECTED && _channelState.value == DataChannelState.OPEN) {
            _messages.value = DataChannelMessage(peerId, data, binary)
            true
        } else {
            relayConnection?.send(peerId, String(data, Charsets.UTF_8)) ?: false
        }
    }

    fun sendText(peerId: String, text: String): Boolean {
        return sendData(peerId, text.toByteArray(Charsets.UTF_8), binary = false)
    }

    fun disconnect(peerId: String) {
        peerConnections.remove(peerId)
        dataChannels.remove(peerId)
        _connectedPeers.value = _connectedPeers.value - peerId
        if (_connectedPeers.value.isEmpty()) {
            _state.value = PeerConnectionState.DISCONNECTED
            _channelState.value = DataChannelState.CLOSED
        }
    }

    fun disconnectAll() {
        peerConnections.clear()
        dataChannels.clear()
        _connectedPeers.value = emptySet()
        _state.value = PeerConnectionState.DISCONNECTED
        _channelState.value = DataChannelState.CLOSED
    }

    fun isConnected(): Boolean = _state.value == PeerConnectionState.CONNECTED

    fun isChannelOpen(): Boolean = _channelState.value == DataChannelState.OPEN

    private fun setupSignalingListeners() {
        signalingChannel?.setOnOfferListener { peerId, sdp ->
            createAnswer(peerId, sdp)
        }

        signalingChannel?.setOnAnswerListener { _, _ ->
            _state.value = PeerConnectionState.CONNECTED
        }

        signalingChannel?.setOnIceCandidateListener { peerId, candidate ->
            addIceCandidate(peerId, candidate)
        }
    }

    private fun handleRelaySignaling(message: RelayMessage) {
        try {
            when {
                message.payload.contains("webrtc.offer_request") -> {
                }
                message.payload.contains("webrtc.offer") -> {
                }
                message.payload.contains("webrtc.answer") -> {
                    _state.value = PeerConnectionState.CONNECTED
                    _channelState.value = DataChannelState.OPEN
                    _connectedPeers.value = _connectedPeers.value + message.from
                }
                message.payload.contains("webrtc.ice_candidate") -> {
                }
                message.payload.contains("webrtc.datachannel_open") -> {
                    _channelState.value = DataChannelState.OPEN
                }
            }
        } catch (_: Exception) {
        }
    }

    companion object {
        const val CHUNK_SIZE = 256 * 1024

        private fun generatePeerId(): String {
            val bytes = ByteArray(16)
            SecureRandom().nextBytes(bytes)
            return android.util.Base64.encodeToString(
                bytes,
                android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING
            )
        }
    }
}
