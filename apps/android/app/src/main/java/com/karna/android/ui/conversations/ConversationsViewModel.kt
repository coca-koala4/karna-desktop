package com.karna.android.ui.conversations

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karna.android.core.database.entity.ConversationEntity
import com.karna.android.data.repository.ConversationRepository
import com.karna.android.data.repository.ProjectRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ConversationsUiState(
    val projectName: String = "所有对话",
    val projectId: String? = null,
    val conversations: List<ConversationEntity> = emptyList(),
    val isLoading: Boolean = false,
    val isCreatingConversation: Boolean = false,
    val errorMessage: String? = null
)

@HiltViewModel
class ConversationsViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val conversationRepository: ConversationRepository,
    private val projectRepository: ProjectRepository
) : ViewModel() {

    private val projectId: String? = savedStateHandle["projectId"]
    private val _errorMessage = MutableStateFlow<String?>(null)
    private val _isCreatingConversation = MutableStateFlow(false)

    val uiState: StateFlow<ConversationsUiState>

    init {
        val conversationsFlow = if (projectId != null) {
            conversationRepository.observeConversationsByProject(projectId)
        } else {
            conversationRepository.observeActiveConversations()
        }

        val projectFlow = flow {
            if (projectId != null) {
                val project = projectRepository.getProjectById(projectId)
                emit(project)
            } else {
                emit(null)
            }
        }

        uiState = combine(
            conversationsFlow,
            projectFlow,
            _errorMessage,
            _isCreatingConversation
        ) { conversations, project, error, creating ->
            ConversationsUiState(
                projectName = project?.name ?: "所有对话",
                projectId = projectId,
                conversations = conversations,
                isLoading = false,
                errorMessage = error,
                isCreatingConversation = creating
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = ConversationsUiState(isLoading = true, projectId = projectId)
        )
    }

    fun createNewConversation(title: String = "新对话") {
        viewModelScope.launch {
            _isCreatingConversation.value = true
            _errorMessage.value = null
            conversationRepository.createConversation(
                title = title,
                projectId = projectId
            ).onFailure { e ->
                _errorMessage.value = e.message ?: "创建对话失败"
            }
            _isCreatingConversation.value = false
        }
    }

    fun clearError() {
        _errorMessage.value = null
    }
}
