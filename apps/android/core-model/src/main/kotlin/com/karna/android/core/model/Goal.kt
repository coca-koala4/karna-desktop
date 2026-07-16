package com.karna.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class GoalStatus {
    @SerialName("draft") DRAFT,
    @SerialName("active") ACTIVE,
    @SerialName("paused") PAUSED,
    @SerialName("completed") COMPLETED,
    @SerialName("abandoned") ABANDONED,
    @SerialName("failed") FAILED
}

@Serializable
enum class BudgetUnit {
    @SerialName("tokens") TOKENS,
    @SerialName("usd") USD,
    @SerialName("money") MONEY,
    @SerialName("minutes") MINUTES,
    @SerialName("time") TIME,
    @SerialName("turns") TURNS
}

@Serializable
data class SuccessCriterion(
    val id: String,
    @SerialName("goal_id") val goalId: String? = null,
    val description: String,
    val met: Boolean = false,
    val evidence: String? = null,
    @SerialName("verified_at") val verifiedAt: String? = null
)

@Serializable
data class GoalBudget(
    val amount: Double,
    val unit: BudgetUnit,
    val used: Double = 0.0,
    @SerialName("alert_threshold") val alertThreshold: Double = 0.8
)

@Serializable
data class Blocker(
    val id: String,
    @SerialName("goal_id") val goalId: String? = null,
    val description: String,
    val severity: String = "medium",
    val resolved: Boolean = false,
    val resolution: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("resolved_at") val resolvedAt: String? = null
)

@Serializable
data class Goal(
    val id: String,
    @SerialName("project_id") val projectId: String? = null,
    @SerialName("session_id") val sessionId: String? = null,
    val title: String? = null,
    val description: String? = null,
    val status: GoalStatus = GoalStatus.DRAFT,
    @SerialName("success_criteria") val successCriteria: List<SuccessCriterion> = emptyList(),
    @SerialName("success_criteria_text") val successCriteriaText: List<String> = emptyList(),
    val budget: GoalBudget? = null,
    val blockers: List<Blocker> = emptyList(),
    @SerialName("blocker_descriptions") val blockerDescriptions: List<String> = emptyList(),
    @SerialName("rounds_used") val roundsUsed: Int = 0,
    @SerialName("current_round") val currentRound: Int = 0,
    @SerialName("max_rounds") val maxRounds: Int? = null,
    @SerialName("progress_percent") val progressPercent: Int = 0,
    val evidence: List<String> = emptyList(),
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("paused_at") val pausedAt: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("created_by") val createdBy: String? = null
)
