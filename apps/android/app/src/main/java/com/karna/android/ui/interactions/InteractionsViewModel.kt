package com.karna.android.ui.interactions

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karna.android.core.database.entity.InteractionEntity
import com.karna.android.data.repository.InteractionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class InteractionsUiState(
    val pendingInteractions: List<InteractionEntity> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

data class InteractionDetailUiState(
    val interaction: InteractionEntity? = null,
    val isLoading: Boolean = false,
    val isActionInProgress: Boolean = false,
    val errorMessage: String? = null,
    val textInput: String = "",
    val selectedOptions: Set<String> = emptySet()
)

@HiltViewModel
class InteractionsViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val interactionRepository: InteractionRepository
) : ViewModel() {

    private val interactionId: String? = savedStateHandle["interactionId"]
    private val runId: String? = savedStateHandle["runId"]
    private val _isLoading = MutableStateFlow(false)
    private val _isActionInProgress = MutableStateFlow(false)
    private val _errorMessage = MutableStateFlow<String?>(null)
    private val _textInput = MutableStateFlow("")
    private val _selectedOptions = MutableStateFlow<Set<String>>(emptySet())

    val interactionsUiState: StateFlow<InteractionsUiState>

    val interactionDetailUiState: StateFlow<InteractionDetailUiState>

    init {
        val pendingFlow = if (runId != null) {
            interactionRepository.observeInteractionsByRun(runId)
        } else {
            kotlinx.coroutines.flow.flowOf(emptyList())
        }

        interactionsUiState = combine(
            pendingFlow,
            _isLoading,
            _errorMessage
        ) { interactions, loading, error ->
            InteractionsUiState(
                pendingInteractions = interactions.filter { it.requiresResponse },
                isLoading = loading,
                errorMessage = error
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = InteractionsUiState(isLoading = true)
        )

        val interactionFlow = kotlinx.coroutines.flow.flow {
            if (interactionId != null) {
                val interaction = interactionRepository.getInteractionById(interactionId)
                emit(interaction)
            } else {
                emit(null)
            }
        }

        interactionDetailUiState = combine(
            combine(
                interactionFlow,
                _isLoading,
                _isActionInProgress
            ) { interaction, loading, actionInProgress ->
                object {
                    val interaction = interaction
                    val loading = loading
                    val actionInProgress = actionInProgress
                }
            },
            _errorMessage,
            _textInput,
            _selectedOptions
        ) { combined, error, textInput, selectedOptions ->
            InteractionDetailUiState(
                interaction = combined.interaction,
                isLoading = combined.loading,
                isActionInProgress = combined.actionInProgress,
                errorMessage = error,
                textInput = textInput,
                selectedOptions = selectedOptions
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = InteractionDetailUiState(isLoading = true)
        )
    }

    fun refreshInteractions() {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            _isLoading.value = false
        }
    }

    fun onTextInputChange(text: String) {
        _textInput.value = text
    }

    fun toggleOption(option: String) {
        _selectedOptions.value = _selectedOptions.value.toMutableSet().apply {
            if (contains(option)) remove(option) else add(option)
        }
    }

    fun selectSingleOption(option: String) {
        _selectedOptions.value = setOf(option)
    }

    fun approve(interactionId: String, responseData: String? = null) {
        viewModelScope.launch {
            _isActionInProgress.value = true
            _errorMessage.value = null
            val interaction = interactionRepository.getInteractionById(interactionId)
            if (interaction != null) {
                interactionRepository.respondToInteraction(
                    runId = interaction.runId,
                    interactionId = interactionId,
                    approved = true,
                    responseData = responseData
                ).onFailure { e ->
                    _errorMessage.value = e.message ?: "批准失败"
                }
            }
            _isActionInProgress.value = false
        }
    }

    fun reject(interactionId: String, reason: String? = null) {
        viewModelScope.launch {
            _isActionInProgress.value = true
            _errorMessage.value = null
            val interaction = interactionRepository.getInteractionById(interactionId)
            if (interaction != null) {
                interactionRepository.respondToInteraction(
                    runId = interaction.runId,
                    interactionId = interactionId,
                    approved = false,
                    responseData = reason
                ).onFailure { e ->
                    _errorMessage.value = e.message ?: "拒绝失败"
                }
            }
            _isActionInProgress.value = false
        }
    }

    fun clearError() {
        _errorMessage.value = null
    }
}

fun getInteractionTypeDisplayName(type: String): String {
    return when (type.lowercase()) {
        "single_select" -> "单选"
        "multi_select" -> "多选"
        "confirmation" -> "确认"
        "text_input" -> "文本输入"
        "approval" -> "审批"
        "desktop_required" -> "需要桌面端"
        "tool_approval" -> "工具审批"
        "file_confirmation" -> "文件确认"
        "command_confirmation" -> "命令确认"
        "permission_request" -> "权限请求"
        "pairing_confirmation" -> "配对确认"
        "info" -> "信息"
        else -> type
    }
}
