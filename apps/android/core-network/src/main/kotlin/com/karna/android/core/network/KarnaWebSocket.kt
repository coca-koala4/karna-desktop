package com.karna.android.core.network

import com.karna.android.core.model.WebSocketState
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
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import kotlin.math.min
import kotlin.random.Random

sealed class WebSocketEvent {
    data class Connected(val response: Response) : WebSocketEvent()
    data class MessageReceived(val text: String) : WebSocketEvent()
    data class BinaryReceived(val bytes: ByteString) : WebSocketEvent()
    data class Disconnected(val code: Int, val reason: String) : WebSocketEvent()
    data class ConnectionFailed(val throwable: Throwable) : WebSocketEvent()
}

class KarnaWebSocket(
    private val client: OkHttpClient,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
) {
    private val _state = MutableStateFlow<WebSocketState>(WebSocketState.DISCONNECTED)
    val state: StateFlow<WebSocketState> = _state.asStateFlow()

    private val _events = MutableStateFlow<WebSocketEvent?>(null)
    val events: StateFlow<WebSocketEvent?> = _events.asStateFlow()

    private var webSocket: WebSocket? = null
    private var reconnectJob: Job? = null
    private var currentUrl: String? = null
    private var currentHeaders: Map<String, String> = emptyMap()
    private var reconnectAttempts = 0
    private val maxReconnectDelayMs = 60_000L
    private val baseReconnectDelayMs = 1_000L
    private val jitterMs = 500L

    fun connect(url: String, headers: Map<String, String> = emptyMap()) {
        if (_state.value == WebSocketState.CONNECTED || _state.value == WebSocketState.CONNECTING) {
            return
        }

        currentUrl = url
        currentHeaders = headers
        reconnectAttempts = 0
        startConnection(url, headers)
    }

    fun send(text: String): Boolean {
        return webSocket?.send(text) ?: false
    }

    fun send(bytes: ByteString): Boolean {
        return webSocket?.send(bytes) ?: false
    }

    fun disconnect(code: Int = 1000, reason: String = "Normal closure") {
        reconnectJob?.cancel()
        reconnectJob = null
        webSocket?.close(code, reason)
        webSocket = null
        _state.value = WebSocketState.DISCONNECTED
    }

    fun close(code: Int = 1000, reason: String = "User closed") {
        reconnectJob?.cancel()
        reconnectJob = null
        webSocket?.close(code, reason)
        webSocket = null
        _state.value = WebSocketState.CLOSED
    }

    private fun startConnection(url: String, headers: Map<String, String> = emptyMap()) {
        _state.value = WebSocketState.CONNECTING

        val requestBuilder = Request.Builder()
            .url(url)
        headers.forEach { (key, value) ->
            requestBuilder.addHeader(key, value)
        }
        val request = requestBuilder.build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                reconnectAttempts = 0
                _state.value = WebSocketState.CONNECTED
                _events.value = WebSocketEvent.Connected(response)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                _events.value = WebSocketEvent.MessageReceived(text)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                _events.value = WebSocketEvent.BinaryReceived(bytes)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                this@KarnaWebSocket.webSocket = null
                if (_state.value != WebSocketState.CLOSED && _state.value != WebSocketState.DISCONNECTED) {
                    _events.value = WebSocketEvent.Disconnected(code, reason)
                    scheduleReconnect()
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                this@KarnaWebSocket.webSocket = null
                _events.value = WebSocketEvent.ConnectionFailed(t)
                if (_state.value != WebSocketState.CLOSED) {
                    _state.value = WebSocketState.FAILED
                    scheduleReconnect()
                }
            }
        })
    }

    private fun scheduleReconnect() {
        if (reconnectJob?.isActive == true || _state.value == WebSocketState.CLOSED) {
            return
        }

        _state.value = WebSocketState.RECONNECTING

        val delayMs = calculateReconnectDelay()
        reconnectJob = scope.launch {
            delay(delayMs)
            if (isActive && _state.value == WebSocketState.RECONNECTING) {
                currentUrl?.let { url ->
                    startConnection(url, currentHeaders)
                }
            }
        }
    }

    private fun calculateReconnectDelay(): Long {
        val exponentialDelay = baseReconnectDelayMs * (1L shl min(reconnectAttempts, 10))
        val withJitter = exponentialDelay + Random.nextLong(0, jitterMs)
        reconnectAttempts++
        return min(withJitter, maxReconnectDelayMs)
    }
}
