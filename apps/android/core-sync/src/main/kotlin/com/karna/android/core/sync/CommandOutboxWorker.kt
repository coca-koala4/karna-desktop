package com.karna.android.core.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

@HiltWorker
class CommandOutboxWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val offlineQueueManager: OfflineQueueManager,
    private val syncState: SyncState
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            val pendingCommands = offlineQueueManager.getPendingCommandsForRetry()

            syncState.updatePendingCounts(pendingCommands = pendingCommands.size)

            for (command in pendingCommands) {
                if (isStopped) break

                try {
                    sendCommand(command)
                    offlineQueueManager.markCommandSent(command.id)
                } catch (e: Exception) {
                    offlineQueueManager.markCommandFailed(command.id, e.message ?: "Unknown error")
                }
            }

            offlineQueueManager.cleanupOldSentCommands()
            syncState.updatePendingCounts(pendingCommands = 0)
            Result.success()
        } catch (e: Exception) {
            syncState.updateStatus(SyncStatus.Error("Failed to process outbox", e))
            if (runAttemptCount < MAX_RETRIES) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }

    private suspend fun sendCommand(command: com.karna.android.core.database.entity.CommandOutboxEntity) {
    }

    companion object {
        private const val MAX_RETRIES = 3
        const val WORK_NAME = "command-outbox-sync"
    }
}
