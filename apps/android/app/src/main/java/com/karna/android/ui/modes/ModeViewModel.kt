package com.karna.android.ui.modes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karna.android.core.model.Goal
import com.karna.android.core.model.LivingWork
import com.karna.android.core.model.Plan
import com.karna.android.data.repository.ModeRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class WorkMode {
    DIRECT,
    PLAN,
    GOAL,
    LIVING_WORK
}

data class ModeUiState(
    val currentMode: WorkMode = WorkMode.DIRECT,
    val plan: Plan? = null,
    val goal: Goal? = null,
    val livingWork: LivingWork? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

@HiltViewModel
class ModeViewModel @Inject constructor(
    private val modeRepository: ModeRepository
) : ViewModel() {

    private val _isLoading = MutableStateFlow(false)
    private val _errorMessage = MutableStateFlow<String?>(null)
    private val _currentMode = MutableStateFlow(WorkMode.DIRECT)

    val uiState: StateFlow<ModeUiState> = combine(
        combine(
            _currentMode,
            modeRepository.observeCurrentPlan(),
            modeRepository.observeCurrentGoal()
        ) { mode, plan, goal ->
            object {
                val mode = mode
                val plan = plan
                val goal = goal
            }
        },
        modeRepository.observeCurrentLivingWork(),
        _isLoading,
        _errorMessage
    ) { combined, livingWork, loading, error ->
        val currentPlan = if (combined.mode == WorkMode.PLAN) combined.plan else null
        val currentGoal = if (combined.mode == WorkMode.GOAL) combined.goal else null
        val currentLivingWork = if (combined.mode == WorkMode.LIVING_WORK) livingWork else null

        ModeUiState(
            currentMode = combined.mode,
            plan = currentPlan,
            goal = currentGoal,
            livingWork = currentLivingWork,
            isLoading = loading,
            errorMessage = error
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = ModeUiState(isLoading = true)
    )

    init {
        refreshAll()
    }

    fun setMode(mode: WorkMode) {
        _currentMode.value = mode
        when (mode) {
            WorkMode.PLAN -> refreshPlan()
            WorkMode.GOAL -> refreshGoal()
            WorkMode.LIVING_WORK -> refreshLivingWork()
            else -> {}
        }
    }

    fun refreshAll() {
        refreshPlan()
        refreshGoal()
        refreshLivingWork()
    }

    fun refreshPlan() {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            modeRepository.refreshCurrentPlan().onFailure { e ->
                _errorMessage.value = e.message
            }
            _isLoading.value = false
        }
    }

    fun refreshGoal() {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            modeRepository.refreshCurrentGoal().onFailure { e ->
                _errorMessage.value = e.message
            }
            _isLoading.value = false
        }
    }

    fun refreshLivingWork() {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            modeRepository.refreshCurrentLivingWork().onFailure { e ->
                _errorMessage.value = e.message
            }
            _isLoading.value = false
        }
    }

    fun approvePlan() {
        val plan = uiState.value.plan ?: return
        viewModelScope.launch {
            _isLoading.value = true
            modeRepository.approvePlan(plan.id).onFailure { e ->
                _errorMessage.value = e.message
            }
            _isLoading.value = false
        }
    }

    fun rejectPlan(reason: String) {
        val plan = uiState.value.plan ?: return
        viewModelScope.launch {
            _isLoading.value = true
            modeRepository.rejectPlan(plan.id, reason).onFailure { e ->
                _errorMessage.value = e.message
            }
            _isLoading.value = false
        }
    }

    fun pausePlan() {
        val plan = uiState.value.plan ?: return
        viewModelScope.launch {
            _isLoading.value = true
            modeRepository.pausePlan(plan.id).onFailure { e ->
                _errorMessage.value = e.message
            }
            _isLoading.value = false
        }
    }

    fun resumePlan() {
        val plan = uiState.value.plan ?: return
        viewModelScope.launch {
            _isLoading.value = true
            modeRepository.resumePlan(plan.id).onFailure { e ->
                _errorMessage.value = e.message
            }
            _isLoading.value = false
        }
    }

    fun confirmGoal() {
        val goal = uiState.value.goal ?: return
        viewModelScope.launch {
            _isLoading.value = true
            modeRepository.confirmGoal(goal.id).onFailure { e ->
                _errorMessage.value = e.message
            }
            _isLoading.value = false
        }
    }

    fun resolveBlocker(blockerId: String) {
        val goal = uiState.value.goal ?: return
        viewModelScope.launch {
            _isLoading.value = true
            modeRepository.resolveBlocker(goal.id, blockerId).onFailure { e ->
                _errorMessage.value = e.message
            }
            _isLoading.value = false
        }
    }

    fun selectCandidateStep(stepId: String) {
        val work = uiState.value.livingWork ?: return
        viewModelScope.launch {
            _isLoading.value = true
            modeRepository.selectCandidateStep(work.id, stepId).onFailure { e ->
                _errorMessage.value = e.message
            }
            _isLoading.value = false
        }
    }

    fun approveCandidateStep(stepId: String) {
        val work = uiState.value.livingWork ?: return
        viewModelScope.launch {
            _isLoading.value = true
            modeRepository.approveCandidateStep(work.id, stepId).onFailure { e ->
                _errorMessage.value = e.message
            }
            _isLoading.value = false
        }
    }

    fun rejectCandidateStep(stepId: String, reason: String) {
        val work = uiState.value.livingWork ?: return
        viewModelScope.launch {
            _isLoading.value = true
            modeRepository.rejectCandidateStep(work.id, stepId, reason).onFailure { e ->
                _errorMessage.value = e.message
            }
            _isLoading.value = false
        }
    }

    fun deferCandidateStep(stepId: String) {
        val work = uiState.value.livingWork ?: return
        viewModelScope.launch {
            _isLoading.value = true
            modeRepository.deferCandidateStep(work.id, stepId).onFailure { e ->
                _errorMessage.value = e.message
            }
            _isLoading.value = false
        }
    }

    fun modifyCandidateStep(stepId: String, modifiedTo: String) {
        val work = uiState.value.livingWork ?: return
        viewModelScope.launch {
            _isLoading.value = true
            modeRepository.modifyCandidateStep(work.id, stepId, modifiedTo).onFailure { e ->
                _errorMessage.value = e.message
            }
            _isLoading.value = false
        }
    }

    fun clearError() {
        _errorMessage.value = null
    }
}
