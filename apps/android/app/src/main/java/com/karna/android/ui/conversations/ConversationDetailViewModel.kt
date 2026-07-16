package com.karna.android.ui.conversations

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karna.android.core.database.entity.MessageEntity
import com.karna.android.core.model.StreamingState
import com.karna.android.core.model.WebSocketState
import com.karna.android.data.repository.ConversationRepository
import com.karna.android.data.repository.MessageRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ConversationDetailUiState(
    val conversationId: String = "",
    val conversationTitle: String = "对话",
    val messages: List<MessageEntity> = emptyList(),
    val draftText: String = "",
    val isStreaming: Boolean = false,
    val isConnected: Boolean = false,
    val connectionState: WebSocketState = WebSocketState.DISCONNECTED,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val canSend: Boolean = false
)

@HiltViewModel
class ConversationDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val messageRepository: MessageRepository,
    private val conversationRepository: ConversationRepository
) : ViewModel() {

    private val conversationId: String = savedStateHandle["conversationId"] ?: ""
    private val _draftText = MutableStateFlow("")
    private val _errorMessage = MutableStateFlow<String?>(null)
    private val _conversationTitle = MutableStateFlow("")

    init {
        loadConversation()
        observeDraft()
    }

    private fun loadConversation() {
        viewModelScope.launch {
            val conv = conversationRepository.getConversationById(conversationId)
            _conversationTitle.value = conv?.title ?: "对话"
        }
    }

    private fun observeDraft() {
        viewModelScope.launch {
            messageRepository.getDraftForConversation(conversationId).collect { draft ->
                _draftText.value = draft ?: ""
            }
        }
    }

    val uiState: StateFlow<ConversationDetailUiState> = combine(
        combine(
            messageRepository.getMessagesForConversation(conversationId),
            _conversationTitle,
            _draftText
        ) { messages, title, draft ->
            object {
                val messages = messages
                val title = title
                val draft = draft
            }
        },
        messageRepository.streamingState,
        messageRepository.connectionState,
        _errorMessage
    ) { combined, streamState, connState, error ->
        ConversationDetailUiState(
            conversationId = conversationId,
            conversationTitle = combined.title,
            messages = combined.messages,
            draftText = combined.draft,
            isStreaming = streamState == StreamingState.STREAMING,
            isConnected = connState == WebSocketState.CONNECTED,
            connectionState = connState,
            isLoading = false,
            errorMessage = error,
            canSend = streamState != StreamingState.STREAMING && combined.draft.isNotBlank()
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = ConversationDetailUiState(
            conversationId = conversationId,
            isLoading = true
        )
    )

    fun onDraftChange(text: String) {
        _draftText.value = text
        viewModelScope.launch {
            messageRepository.saveDraft(conversationId, text)
        }
    }

    fun sendMessage() {
        val text = _draftText.value.trim()
        if (text.isBlank()) return

        viewModelScope.launch {
            _errorMessage.value = null
            _draftText.value = ""
            messageRepository.clearDraft(conversationId)
            runCatching {
                messageRepository.sendMessage(conversationId, text)
            }.onFailure { e ->
                _errorMessage.value = e.message ?: "发送失败"
            }
        }
    }

    fun interruptGeneration() {
        viewModelScope.launch {
            messageRepository.interruptGeneration(conversationId)
        }
    }

    fun clearError() {
        _errorMessage.value = null
    }
}
