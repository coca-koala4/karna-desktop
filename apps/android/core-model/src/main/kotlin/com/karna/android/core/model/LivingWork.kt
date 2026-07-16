package com.karna.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class LivingWorkStatus {
    @SerialName("draft") DRAFT,
    @SerialName("active") ACTIVE,
    @SerialName("awaiting_decision") AWAITING_DECISION,
    @SerialName("paused") PAUSED,
    @SerialName("completed") COMPLETED,
    @SerialName("terminated") TERMINATED
}

@Serializable
enum class RiskLevel {
    @SerialName("low") LOW,
    @SerialName("medium") MEDIUM,
    @SerialName("high") HIGH,
    @SerialName("critical") CRITICAL
}

@Serializable
enum class AuthorDecisionType {
    @SerialName("approve") APPROVE,
    @SerialName("reject") REJECT,
    @SerialName("defer") DEFER,
    @SerialName("modify") MODIFY
}

@Serializable
data class CreativeContract(
    val id: String? = null,
    @SerialName("work_id") val workId: String? = null,
    val vision: String? = null,
    val scope: String? = null,
    val constraints: List<String> = emptyList(),
    val priorities: List<String> = emptyList(),
    @SerialName("non_goals") val nonGoals: List<String> = emptyList(),
    @SerialName("do_not_do") val doNotDo: List<String> = emptyList(),
    @SerialName("risk_level") val riskLevel: RiskLevel = RiskLevel.MEDIUM,
    @SerialName("quality_bars") val qualityBars: List<String> = emptyList(),
    @SerialName("agreed_at") val agreedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class CandidateNextStep(
    val id: String,
    @SerialName("work_id") val workId: String? = null,
    val title: String? = null,
    val description: String? = null,
    val rationale: String? = null,
    val impact: String? = null,
    val risk: String? = null,
    @SerialName("risk_level") val riskLevel: RiskLevel = RiskLevel.MEDIUM,
    @SerialName("estimated_effort") val estimatedEffort: String? = null,
    @SerialName("estimated_tokens") val estimatedTokens: Int = 0,
    @SerialName("is_selected") val isSelected: Boolean = false,
    @SerialName("selection_reason") val selectionReason: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class ImpactAnalysis(
    val id: String? = null,
    @SerialName("work_id") val workId: String? = null,
    @SerialName("step_id") val stepId: String? = null,
    val scope: String? = null,
    @SerialName("affected_files") val affectedFiles: List<String> = emptyList(),
    @SerialName("affected_systems") val affectedSystems: List<String> = emptyList(),
    @SerialName("rollback_steps") val rollbackSteps: List<String> = emptyList(),
    val positives: List<String> = emptyList(),
    val negatives: List<String> = emptyList(),
    val risks: List<String> = emptyList(),
    val mitigations: List<String> = emptyList(),
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class AuthorDecision(
    val id: String? = null,
    @SerialName("work_id") val workId: String? = null,
    @SerialName("candidate_id") val candidateId: String? = null,
    @SerialName("step_id") val stepId: String? = null,
    val decision: String,
    @SerialName("decision_type") val decisionType: AuthorDecisionType? = null,
    @SerialName("modified_to") val modifiedTo: String? = null,
    val reasoning: String? = null,
    val reason: String? = null,
    val feedback: String? = null,
    @SerialName("decided_at") val decidedAt: String? = null,
    val timestamp: String? = null,
    @SerialName("decided_by") val decidedBy: String? = null
)

@Serializable
data class LivingWork(
    val id: String,
    @SerialName("project_id") val projectId: String? = null,
    @SerialName("session_id") val sessionId: String? = null,
    val title: String? = null,
    val summary: String? = null,
    val status: LivingWorkStatus = LivingWorkStatus.DRAFT,
    val contract: CreativeContract? = null,
    @SerialName("creative_contract") val creativeContract: CreativeContract? = null,
    @SerialName("candidate_steps") val candidateSteps: List<CandidateNextStep> = emptyList(),
    @SerialName("candidate_next_steps") val candidateNextSteps: List<CandidateNextStep> = emptyList(),
    @SerialName("impact_analyses") val impactAnalyses: List<ImpactAnalysis> = emptyList(),
    @SerialName("impact_analysis") val impactAnalysis: ImpactAnalysis? = null,
    val decisions: List<AuthorDecision> = emptyList(),
    @SerialName("author_decisions") val authorDecisions: List<AuthorDecision> = emptyList(),
    @SerialName("selected_step_id") val selectedStepId: String? = null,
    @SerialName("current_iteration") val currentIteration: Int = 0,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("paused_at") val pausedAt: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("created_by") val createdBy: String? = null
)
