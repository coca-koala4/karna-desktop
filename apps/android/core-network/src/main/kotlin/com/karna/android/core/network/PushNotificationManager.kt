package com.karna.android.core.network

import android.content.Context
import androidx.work.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

enum class PushAvailability {
    AVAILABLE,
    UNAVAILABLE_NO_GOOGLE_SERVICES,
    UNAVAILABLE_NO_TOKEN,
    DISABLED_BY_USER
}

data class PushEventSummary(
    val eventId: String,
    val eventType: String,
    val timestamp: Long,
    val deviceId: String,
    val priority: String = "normal"
)

interface PushTokenListener {
    fun onTokenAvailable(token: String)
    fun onTokenRevoked()
}

class PushNotificationManager(
    private val context: Context,
    private val relayConnection: RelayConnection? = null,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
) {
    private val _availability = MutableStateFlow(PushAvailability.UNAVAILABLE_NO_GOOGLE_SERVICES)
    val availability: StateFlow<PushAvailability> = _availability.asStateFlow()

    private val _fcmToken = MutableStateFlow<String?>(null)
    val fcmToken: StateFlow<String?> = _fcmToken.asStateFlow()

    private val _pendingEvents = MutableStateFlow<List<PushEventSummary>>(emptyList())
    val pendingEvents: StateFlow<List<PushEventSummary>> = _pendingEvents.asStateFlow()

    private val tokenListeners = mutableListOf<PushTokenListener>()
    private var isInitialized = false

    fun initialize() {
        if (isInitialized) return
        isInitialized = true
        checkPushAvailability()
        observeRelayMessages()
    }

    fun isPushAvailable(): Boolean {
        return _availability.value == PushAvailability.AVAILABLE
    }

    fun getCurrentToken(): String? = _fcmToken.value

    fun registerToken(token: String) {
        _fcmToken.value = token
        _availability.value = PushAvailability.AVAILABLE
        tokenListeners.forEach { it.onTokenAvailable(token) }

        scope.launch {
            relayConnection?.send(
                targetRoutingId = "desktop",
                payload = """{"type":"push.register","token":"$token","deviceType":"android","timestamp":${System.currentTimeMillis()}}"""
            )
        }
    }

    fun revokeToken() {
        val oldToken = _fcmToken.value
        _fcmToken.value = null
        _availability.value = PushAvailability.UNAVAILABLE_NO_TOKEN
        tokenListeners.forEach { it.onTokenRevoked() }

        if (oldToken != null) {
            scope.launch {
                relayConnection?.send(
                    targetRoutingId = "desktop",
                    payload = """{"type":"push.revoke","token":"$oldToken","timestamp":${System.currentTimeMillis()}}"""
                )
            }
        }
    }

    fun onPushReceived(eventSummary: PushEventSummary) {
        _pendingEvents.value = _pendingEvents.value + eventSummary
        scheduleEventPull()
    }

    fun processPendingEvents() {
        val events = _pendingEvents.value
        if (events.isEmpty()) return

        scope.launch {
            events.forEach { event ->
                relayConnection?.send(
                    targetRoutingId = "desktop",
                    payload = """{"type":"pull.event_summary","eventId":"${event.eventId}","timestamp":${System.currentTimeMillis()}}"""
                )
            }
        }
    }

    fun clearPendingEvent(eventId: String) {
        _pendingEvents.value = _pendingEvents.value.filter { it.eventId != eventId }
    }

    fun clearAllPendingEvents() {
        _pendingEvents.value = emptyList()
    }

    fun addTokenListener(listener: PushTokenListener) {
        tokenListeners.add(listener)
    }

    fun removeTokenListener(listener: PushTokenListener) {
        tokenListeners.remove(listener)
    }

    fun setUserEnabled(enabled: Boolean) {
        if (enabled) {
            if (_fcmToken.value != null) {
                _availability.value = PushAvailability.AVAILABLE
            } else {
                _availability.value = PushAvailability.UNAVAILABLE_NO_TOKEN
            }
        } else {
            _availability.value = PushAvailability.DISABLED_BY_USER
        }
    }

    private fun checkPushAvailability() {
        val hasGoogleServices = try {
            Class.forName("com.google.firebase.messaging.FirebaseMessaging")
            true
        } catch (_: ClassNotFoundException) {
            false
        }

        _availability.value = if (hasGoogleServices) {
            PushAvailability.UNAVAILABLE_NO_TOKEN
        } else {
            PushAvailability.UNAVAILABLE_NO_GOOGLE_SERVICES
        }
    }

    private fun observeRelayMessages() {
        scope.launch {
            relayConnection?.messages?.collect { message ->
                message?.let { handleRelayMessage(it) }
            }
        }
    }

    private fun handleRelayMessage(message: RelayMessage) {
        try {
            when {
                message.payload.contains("push.ack") -> {
                }
                message.payload.contains("event.notification") -> {
                }
            }
        } catch (_: Exception) {
        }
    }

    private fun scheduleEventPull() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val pullRequest = OneTimeWorkRequestBuilder<EventPullWorker>()
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                30,
                TimeUnit.SECONDS
            )
            .build()

        WorkManager.getInstance(context)
            .enqueueUniqueWork(
                "karna-event-pull",
                ExistingWorkPolicy.REPLACE,
                pullRequest
            )
    }

    fun getStatusDescription(): String {
        return when (_availability.value) {
            PushAvailability.AVAILABLE -> "后台推送已配置"
            PushAvailability.UNAVAILABLE_NO_GOOGLE_SERVICES -> "后台推送不可用（无Google服务）"
            PushAvailability.UNAVAILABLE_NO_TOKEN -> "后台推送未配置"
            PushAvailability.DISABLED_BY_USER -> "后台推送已禁用"
        }
    }
}

class EventPullWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }
}
