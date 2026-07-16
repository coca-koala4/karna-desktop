package com.karna.android.ui.runs

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karna.android.core.database.entity.RunEntity
import com.karna.android.core.database.entity.RunNodeEntity
import com.karna.android.data.repository.RunRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RunsUiState(
    val runs: List<RunEntity> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

data class RunDetailUiState(
    val run: RunEntity? = null,
    val nodes: List<RunNodeEntity> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isActionInProgress: Boolean = false
)

@HiltViewModel
class RunsViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val runRepository: RunRepository
) : ViewModel() {

    private val runId: String? = savedStateHandle["runId"]
    private val _isLoading = MutableStateFlow(false)
    private val _errorMessage = MutableStateFlow<String?>(null)
    private val _isActionInProgress = MutableStateFlow(false)

    val runsUiState: StateFlow<RunsUiState>

    val runDetailUiState: StateFlow<RunDetailUiState>

    init {
        runsUiState = combine(
            runRepository.observeActiveRuns(),
            _isLoading,
            _errorMessage
        ) { runs, loading, error ->
            RunsUiState(
                runs = runs.sortedByDescending { it.createdAtTimestamp },
                isLoading = loading,
                errorMessage = error
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = RunsUiState(isLoading = true)
        )

        val nodesFlow = if (runId != null) {
            runRepository.observeNodesByRun(runId)
        } else {
            kotlinx.coroutines.flow.flowOf(emptyList())
        }

        val runFlow = kotlinx.coroutines.flow.flow {
            if (runId != null) {
                emit(runRepository.getRunById(runId))
            } else {
                emit(null)
            }
        }

        runDetailUiState = combine(
            runFlow,
            nodesFlow,
            _isLoading,
            _errorMessage,
            _isActionInProgress
        ) { run, nodes, loading, error, actionInProgress ->
            RunDetailUiState(
                run = run,
                nodes = nodes.sortedBy { it.createdAtTimestamp },
                isLoading = loading,
                errorMessage = error,
                isActionInProgress = actionInProgress
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = RunDetailUiState(isLoading = true)
        )
    }

    fun refreshRuns() {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            _isLoading.value = false
        }
    }

    fun cancelRun(runId: String) {
        viewModelScope.launch {
            _isActionInProgress.value = true
            _errorMessage.value = null
            val run = runRepository.getRunById(runId)
            run?.conversationId?.let { convId ->
                runRepository.cancelRun(convId, runId).onFailure { e ->
                    _errorMessage.value = e.message ?: "取消失败"
                }
            }
            _isActionInProgress.value = false
        }
    }

    fun pauseRun(runId: String) {
        viewModelScope.launch {
            _isActionInProgress.value = true
            _errorMessage.value = null
            val run = runRepository.getRunById(runId)
            if (run != null) {
                runRepository.updateRunStatus(runId, "paused")
            }
            _isActionInProgress.value = false
        }
    }

    fun resumeRun(runId: String) {
        viewModelScope.launch {
            _isActionInProgress.value = true
            _errorMessage.value = null
            runRepository.updateRunStatus(runId, "running")
            _isActionInProgress.value = false
        }
    }

    fun retryRun(runId: String) {
        viewModelScope.launch {
            _isActionInProgress.value = true
            _errorMessage.value = null
            _isActionInProgress.value = false
        }
    }

    fun clearError() {
        _errorMessage.value = null
    }
}

fun formatDuration(startMs: Long?, endMs: Long?): String {
    if (startMs == null) return "-"
    val end = endMs ?: System.currentTimeMillis()
    val duration = end - startMs
    val seconds = duration / 1000
    val minutes = seconds / 60
    val hours = minutes / 60

    return when {
        hours > 0 -> "${hours}h ${minutes % 60}m"
        minutes > 0 -> "${minutes}m ${seconds % 60}s"
        else -> "${seconds}s"
    }
}

fun formatTokenCount(tokens: Int): String {
    return when {
        tokens >= 1_000_000 -> String.format("%.1fM", tokens / 1_000_000.0)
        tokens >= 1_000 -> String.format("%.1fK", tokens / 1_000.0)
        else -> tokens.toString()
    }
}

fun getStatusDisplayName(status: String): String {
    return when (status.lowercase()) {
        "queued" -> "排队中"
        "running" -> "运行中"
        "awaiting_approval", "paused" -> "等待中"
        "completed" -> "已完成"
        "failed" -> "已失败"
        "cancelled" -> "已取消"
        "timeout" -> "已超时"
        else -> status
    }
}

fun getNodeStatusDisplayName(status: String): String {
    return when (status.lowercase()) {
        "pending" -> "待执行"
        "running" -> "执行中"
        "awaiting_approval" -> "等待审批"
        "skipped" -> "已跳过"
        "completed" -> "已完成"
        "failed" -> "已失败"
        else -> status
    }
}

fun getNodeTypeDisplayName(type: String): String {
    return when (type.lowercase()) {
        "start" -> "开始"
        "llm" -> "LLM调用"
        "tool" -> "工具调用"
        "condition" -> "条件判断"
        "approval" -> "人工审批"
        "code" -> "代码执行"
        "parallel" -> "并行分支"
        "end" -> "结束"
        else -> type
    }
}
