package com.karna.android.core.sync

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

sealed class SyncStatus {
    data object Idle : SyncStatus()
    data class Syncing(val progress: Int = 0, val total: Int = 0) : SyncStatus()
    data class Error(val message: String, val throwable: Throwable? = null) : SyncStatus()
    data object Success : SyncStatus()
}

data class SyncStateData(
    val status: SyncStatus = SyncStatus.Idle,
    val lastSyncTime: Long? = null,
    val pendingEvents: Int = 0,
    val pendingCommands: Int = 0
)

@Singleton
class SyncState @Inject constructor() {
    private val _state = MutableStateFlow(SyncStateData())
    val state: StateFlow<SyncStateData> = _state.asStateFlow()

    fun updateStatus(status: SyncStatus) {
        _state.value = _state.value.copy(status = status)
        if (status is SyncStatus.Success) {
            _state.value = _state.value.copy(lastSyncTime = System.currentTimeMillis())
        }
    }

    fun updatePendingCounts(pendingEvents: Int? = null, pendingCommands: Int? = null) {
        _state.value = _state.value.copy(
            pendingEvents = pendingEvents ?: _state.value.pendingEvents,
            pendingCommands = pendingCommands ?: _state.value.pendingCommands
        )
    }
}
