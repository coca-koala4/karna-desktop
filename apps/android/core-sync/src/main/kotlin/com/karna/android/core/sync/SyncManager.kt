package com.karna.android.core.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.karna.android.core.model.RemoteEventV1
import com.karna.android.core.network.RemoteApiService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SyncManager @Inject constructor(
    private val context: Context,
    private val remoteApiService: RemoteApiService,
    private val eventCursorManager: EventCursorManager,
    private val eventReducer: EventReducer,
    private val snapshotSync: SnapshotSync,
    private val offlineQueueManager: OfflineQueueManager,
    private val syncState: SyncState,
    private val json: Json
) {
    private val syncScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _eventsFlow = MutableSharedFlow<RemoteEventV1>(extraBufferCapacity = 64)
    val eventsFlow: SharedFlow<RemoteEventV1> = _eventsFlow

    private var isSyncing = false
    private var periodicSyncStarted = false

    fun startPeriodicSync() {
        if (periodicSyncStarted) return

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val syncRequest = PeriodicWorkRequestBuilder<CommandOutboxWorker>(
            15, TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            CommandOutboxWorker.WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            syncRequest
        )

        periodicSyncStarted = true
        startRealtimeSync()
    }

    private fun startRealtimeSync() {
        syncScope.launch {
            while (isActive) {
                try {
                    performIncrementalSync()
                } catch (e: Exception) {
                    syncState.updateStatus(SyncStatus.Error("Sync error", e))
                }
                delay(SYNC_INTERVAL_MS)
            }
        }
    }

    suspend fun syncNow(): Result<Unit> {
        if (isSyncing) return Result.success(Unit)
        isSyncing = true

        return try {
            syncState.updateStatus(SyncStatus.Syncing())

            if (eventCursorManager.isCursorStale()) {
                val newCursor = snapshotSync.performFullSnapshot().getOrThrow()
                eventCursorManager.saveCursor(newCursor)
            } else {
                performIncrementalSync()
            }

            syncState.updateStatus(SyncStatus.Success)
            Result.success(Unit)
        } catch (e: Exception) {
            syncState.updateStatus(SyncStatus.Error(e.message ?: "Sync failed", e))
            Result.failure(e)
        } finally {
            isSyncing = false
        }
    }

    private suspend fun performIncrementalSync() {
        val cursor = eventCursorManager.getCurrentCursor()
        val events = fetchEvents(cursor)

        events.forEachIndexed { index, event ->
            eventReducer.reduce(event)
            _eventsFlow.emit(event)
            syncState.updateStatus(SyncStatus.Syncing(index + 1, events.size))
        }

        if (events.isNotEmpty()) {
            val lastEvent = events.last()
            eventCursorManager.saveCursor(generateNextCursor(lastEvent))
        }
    }

    private suspend fun fetchEvents(cursor: String?): List<RemoteEventV1> {
        return runCatching {
            emptyList<RemoteEventV1>()
        }.getOrElse { emptyList() }
    }

    private fun generateNextCursor(event: RemoteEventV1): String {
        return "${event.sequenceId}-${event.timestamp}"
    }

    suspend fun enqueueCommand(
        type: com.karna.android.core.model.CommandType,
        payloadJson: String,
        relatedRunId: String? = null,
        relatedConversationId: String? = null
    ): Result<String> {
        return offlineQueueManager.enqueueCommand(type, payloadJson, relatedRunId, relatedConversationId)
    }

    suspend fun saveDraft(conversationId: String, content: String, attachmentsJson: String? = null) {
        offlineQueueManager.saveDraft(conversationId, content, attachmentsJson)
    }

    companion object {
        private const val SYNC_INTERVAL_MS = 5000L
    }
}
