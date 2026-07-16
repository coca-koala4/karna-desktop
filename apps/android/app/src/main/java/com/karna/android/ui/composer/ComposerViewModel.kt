package com.karna.android.ui.composer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karna.android.core.model.McpResource
import com.karna.android.core.model.ModeResource
import com.karna.android.core.model.SkillResource
import com.karna.android.core.model.SoulResource
import com.karna.android.core.model.WorkflowResource
import com.karna.android.data.repository.ResourceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ComposerUiState(
    val draftText: String = "",
    val selectedSkills: Set<String> = emptySet(),
    val selectedMcps: Set<String> = emptySet(),
    val selectedSoulId: String? = null,
    val selectedWorkflowId: String? = null,
    val selectedModeId: String? = null,
    val skills: List<SkillResource> = emptyList(),
    val mcps: List<McpResource> = emptyList(),
    val souls: List<SoulResource> = emptyList(),
    val workflows: List<WorkflowResource> = emptyList(),
    val modes: List<ModeResource> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null
) {
    val selectedResourceVersions: Map<String, String>
        get() {
            val versions = mutableMapOf<String, String>()
            skills.filter { it.id in selectedSkills }.forEach { versions[it.id] = it.version }
            selectedSoulId?.let { soulId ->
                souls.find { it.id == soulId }?.let { versions[it.id] = "" }
            }
            return versions
        }

    val canSend: Boolean
        get() = draftText.isNotBlank()
}

@HiltViewModel
class ComposerViewModel @Inject constructor(
    private val resourceRepository: ResourceRepository
) : ViewModel() {

    private val _draftText = MutableStateFlow("")
    private val _selectedSkills = MutableStateFlow<Set<String>>(emptySet())
    private val _selectedMcps = MutableStateFlow<Set<String>>(emptySet())
    private val _selectedSoulId = MutableStateFlow<String?>(null)
    private val _selectedWorkflowId = MutableStateFlow<String?>(null)
    private val _selectedModeId = MutableStateFlow<String?>(null)
    private val _isLoading = MutableStateFlow(false)
    private val _errorMessage = MutableStateFlow<String?>(null)

    val uiState: StateFlow<ComposerUiState>

    init {
        val selectionsFlow = combine(
            _draftText,
            _selectedSkills,
            _selectedMcps,
            _selectedSoulId,
            _selectedWorkflowId
        ) { draft, skills, mcps, soulId, workflowId ->
            object {
                val draft = draft
                val skills = skills
                val mcps = mcps
                val soulId = soulId
                val workflowId = workflowId
            }
        }

        uiState = combine(
            selectionsFlow,
            _selectedModeId,
            resourceRepository.resourceSnapshot,
            _isLoading,
            _errorMessage
        ) { selections, modeId, snapshot, loading, error ->
            ComposerUiState(
                draftText = selections.draft,
                selectedSkills = selections.skills,
                selectedMcps = selections.mcps,
                selectedSoulId = selections.soulId ?: snapshot?.souls?.find { it.isActive }?.id,
                selectedWorkflowId = selections.workflowId,
                selectedModeId = modeId ?: snapshot?.modes?.find { it.isActive }?.id,
                skills = snapshot?.skills?.filter { it.enabled } ?: emptyList(),
                mcps = snapshot?.mcps?.filter { it.status == "connected" } ?: emptyList(),
                souls = snapshot?.souls ?: emptyList(),
                workflows = snapshot?.workflows ?: emptyList(),
                modes = snapshot?.modes ?: emptyList(),
                isLoading = loading,
                errorMessage = error
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = ComposerUiState(isLoading = true)
        )

        loadResources()
    }

    fun loadResources() {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            resourceRepository.refreshResources().onFailure { e ->
                _errorMessage.value = e.message ?: "加载资源失败"
            }
            _isLoading.value = false
        }
    }

    fun onDraftChange(text: String) {
        _draftText.value = text
    }

    fun toggleSkill(skillId: String) {
        _selectedSkills.value = _selectedSkills.value.toMutableSet().apply {
            if (contains(skillId)) remove(skillId) else add(skillId)
        }
    }

    fun toggleMcp(mcpId: String) {
        _selectedMcps.value = _selectedMcps.value.toMutableSet().apply {
            if (contains(mcpId)) remove(mcpId) else add(mcpId)
        }
    }

    fun selectSoul(soulId: String?) {
        _selectedSoulId.value = soulId
    }

    fun selectWorkflow(workflowId: String?) {
        _selectedWorkflowId.value = workflowId
    }

    fun selectMode(modeId: String) {
        _selectedModeId.value = modeId
    }

    fun clearSelection() {
        _selectedSkills.value = emptySet()
        _selectedMcps.value = emptySet()
        _selectedWorkflowId.value = null
    }

    fun buildMessagePayload(): String {
        val state = uiState.value
        val resourceIds = mutableListOf<String>()
        val resourceVersions = mutableMapOf<String, String>()

        resourceIds.addAll(state.selectedSkills)
        state.skills.filter { it.id in state.selectedSkills }.forEach {
            resourceVersions[it.id] = it.version
        }

        resourceIds.addAll(state.selectedMcps)

        state.selectedSoulId?.let {
            resourceIds.add(it)
        }

        state.selectedWorkflowId?.let {
            resourceIds.add(it)
        }

        return buildString {
            append("{")
            append("\"content\":\"${state.draftText.replace("\"", "\\\"")}\"")
            append(",\"resourceIds\":${resourceIds.joinToString(prefix = "[", postfix = "]") { "\"$it\"" }}")
            append(",\"expectedResourceVersions\":{")
            append(resourceVersions.entries.joinToString(",") { "\"${it.key}\":\"${it.value}\"" })
            append("}")
            state.selectedModeId?.let { append(",\"mode\":\"$it\"") }
            append("}")
        }
    }

    fun clearDraft() {
        _draftText.value = ""
    }

    fun clearError() {
        _errorMessage.value = null
    }
}
