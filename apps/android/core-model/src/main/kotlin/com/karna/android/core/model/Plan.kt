package com.karna.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class PlanStatus {
    @SerialName("draft") DRAFT,
    @SerialName("drafting") DRAFTING,
    @SerialName("pending_approval") PENDING_APPROVAL,
    @SerialName("approved") APPROVED,
    @SerialName("active") ACTIVE,
    @SerialName("in_progress") IN_PROGRESS,
    @SerialName("paused") PAUSED,
    @SerialName("completed") COMPLETED,
    @SerialName("abandoned") ABANDONED,
    @SerialName("rejected") REJECTED,
    @SerialName("cancelled") CANCELLED
}

@Serializable
enum class PlanStepStatus {
    @SerialName("pending") PENDING,
    @SerialName("in_progress") IN_PROGRESS,
    @SerialName("completed") COMPLETED,
    @SerialName("blocked") BLOCKED,
    @SerialName("skipped") SKIPPED
}

@Serializable
data class PlanStep(
    val id: String,
    @SerialName("plan_id") val planId: String? = null,
    val title: String,
    val description: String? = null,
    val status: PlanStepStatus = PlanStepStatus.PENDING,
    val order: Int = 0,
    @SerialName("estimated_minutes") val estimatedMinutes: Int? = null,
    @SerialName("actual_minutes") val actualMinutes: Int? = null,
    @SerialName("depends_on") val dependsOn: List<String> = emptyList(),
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    val notes: String? = null
)

@Serializable
data class PlanRisk(
    val id: String,
    @SerialName("plan_id") val planId: String? = null,
    val description: String,
    val severity: String = "medium",
    val mitigation: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class PlanOpenQuestion(
    val id: String,
    @SerialName("plan_id") val planId: String? = null,
    val question: String,
    val answer: String? = null,
    @SerialName("answered_by") val answeredBy: String? = null,
    @SerialName("answered_at") val answeredAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class Plan(
    val id: String,
    @SerialName("project_id") val projectId: String? = null,
    @SerialName("session_id") val sessionId: String? = null,
    val title: String,
    val summary: String? = null,
    val status: PlanStatus = PlanStatus.DRAFT,
    val steps: List<PlanStep> = emptyList(),
    val risks: List<PlanRisk> = emptyList(),
    @SerialName("risk_descriptions") val riskDescriptions: List<String> = emptyList(),
    val confirmations: List<String> = emptyList(),
    @SerialName("open_questions") val openQuestions: List<PlanOpenQuestion> = emptyList(),
    @SerialName("total_estimated_minutes") val totalEstimatedMinutes: Int? = null,
    @SerialName("approval_requested_at") val approvalRequestedAt: String? = null,
    @SerialName("approved_at") val approvedAt: String? = null,
    @SerialName("approved_by") val approvedBy: String? = null,
    @SerialName("rejected_at") val rejectedAt: String? = null,
    @SerialName("rejected_reason") val rejectedReason: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("created_by") val createdBy: String? = null
)
