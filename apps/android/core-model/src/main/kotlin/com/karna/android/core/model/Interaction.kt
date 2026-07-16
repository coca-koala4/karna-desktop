package com.karna.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 交互操作信息
 *
 * 用于需要用户确认或审批的操作
 *
 * @property interactionId 交互唯一ID
 * @property type 交互类型
 * @property status 交互状态
 * @property approvalLevel 所需审批级别
 * @property title 操作标题
 * @property description 操作描述
 * @property requestData 请求数据
 * @property responseData 响应数据
 * @property runId 关联的工作流运行ID
 * @property nodeId 关联的节点ID
 * @property createdAt 创建时间 (ISO 8601)
 * @property expiresAt 过期时间 (ISO 8601)
 * @property respondedAt 响应时间 (ISO 8601)
 */
@Serializable
data class Interaction(
    @SerialName("interaction_id") val interactionId: String,
    val type: InteractionType,
    val status: InteractionStatus,
    @SerialName("approval_level") val approvalLevel: ApprovalLevel,
    val title: String,
    val description: String,
    @SerialName("request_data") val requestData: String? = null,
    @SerialName("response_data") val responseData: String? = null,
    @SerialName("run_id") val runId: String? = null,
    @SerialName("node_id") val nodeId: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("expires_at") val expiresAt: String? = null,
    @SerialName("responded_at") val respondedAt: String? = null
)

/**
 * 交互类型枚举
 */
@Serializable
enum class InteractionType {
    /** 单选 */
    @SerialName("single_select") SINGLE_SELECT,
    /** 多选 */
    @SerialName("multi_select") MULTI_SELECT,
    /** 确认 */
    @SerialName("confirmation") CONFIRMATION,
    /** 文本输入 */
    @SerialName("text_input") TEXT_INPUT,
    /** 审批 */
    @SerialName("approval") APPROVAL,
    /** 需要桌面端 */
    @SerialName("desktop_required") DESKTOP_REQUIRED,
    /** 工具调用审批 */
    @SerialName("tool_approval") TOOL_APPROVAL,
    /** 文件操作确认 */
    @SerialName("file_confirmation") FILE_CONFIRMATION,
    /** 命令执行确认 */
    @SerialName("command_confirmation") COMMAND_CONFIRMATION,
    /** 配对确认 */
    @SerialName("pairing_confirmation") PAIRING_CONFIRMATION,
    /** 权限请求 */
    @SerialName("permission_request") PERMISSION_REQUEST,
    /** 信息提示 */
    @SerialName("info") INFO
}

/**
 * 交互状态枚举
 */
@Serializable
enum class InteractionStatus {
    /** 待处理 */
    @SerialName("pending") PENDING,
    /** 已批准 */
    @SerialName("approved") APPROVED,
    /** 已拒绝 */
    @SerialName("rejected") REJECTED,
    /** 已过期 */
    @SerialName("expired") EXPIRED,
    /** 已取消 */
    @SerialName("cancelled") CANCELLED
}

/**
 * 审批级别枚举
 */
@Serializable
enum class ApprovalLevel {
    /** 低风险，自动批准 */
    @SerialName("auto") AUTO,
    /** 通知级别，仅通知无需操作 */
    @SerialName("notify") NOTIFY,
    /** 需要用户确认 */
    @SerialName("confirm") CONFIRM,
    /** 需要用户明确批准 */
    @SerialName("approve") APPROVE,
    /** 高风险，需要二次确认 */
    @SerialName("critical") CRITICAL
}
