package com.karna.android.ui.projects

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karna.android.core.database.entity.ProjectEntity
import com.karna.android.data.repository.ProjectRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProjectItem(
    val project: ProjectEntity,
    val conversationCount: Int
)

data class ProjectsUiState(
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val projects: List<ProjectItem> = emptyList(),
    val errorMessage: String? = null
)

@HiltViewModel
class ProjectsViewModel @Inject constructor(
    private val projectRepository: ProjectRepository
) : ViewModel() {

    private val _isRefreshing = MutableStateFlow(false)
    private val _errorMessage = MutableStateFlow<String?>(null)

    private val projectsWithCounts =
        projectRepository.observeAllProjects().flatMapLatest { projects ->
            flow {
                val items = projects.map { project ->
                    ProjectItem(
                        project = project,
                        conversationCount = projectRepository.getConversationCountForProject(project.id)
                    )
                }
                emit(items)
            }
        }

    val uiState: StateFlow<ProjectsUiState> = combine(
        projectsWithCounts,
        _isRefreshing,
        _errorMessage
    ) { items, refreshing, error ->
        ProjectsUiState(
            isLoading = false,
            isRefreshing = refreshing,
            projects = items,
            errorMessage = error
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = ProjectsUiState(isLoading = true)
    )

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _isRefreshing.value = true
            _errorMessage.value = null
            projectRepository.refreshProjects().onFailure { e ->
                _errorMessage.value = e.message ?: "刷新失败"
            }
            _isRefreshing.value = false
        }
    }

    fun selectProject(projectId: String) {
        viewModelScope.launch {
            projectRepository.setActiveProject(projectId)
        }
    }

    fun clearError() {
        _errorMessage.value = null
    }
}
