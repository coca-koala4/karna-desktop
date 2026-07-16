package com.karna.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 工作流运行实例
 *
 * @property runId 运行唯一ID
 * @property workflowId 工作流ID
 * @property workflowName 工作流名称
 * @property status 运行状态
 * @property nodes 节点执行列表
 * @property startedAt 开始时间 (ISO 8601)
 * @property completedAt 完成时间 (ISO 8601)
 * @property error 错误信息
 */
@Serializable
data class WorkflowRun(
    @SerialName("run_id") val runId: String,
    @SerialName("workflow_id") val workflowId: String,
    @SerialName("workflow_name") val workflowName: String,
    val status: RunStatus,
    val nodes: List<RunNode>,
    @SerialName("started_at") val startedAt: String,
    @SerialName("completed_at") val completedAt: String? = null,
    val error: String? = null
)

/**
 * 运行节点信息
 *
 * @property nodeId 节点ID
 * @property nodeType 节点类型
 * @property name 节点名称
 * @property status 节点执行状态
 * @property input 输入数据
 * @property output 输出数据
 * @property startedAt 开始时间 (ISO 8601)
 * @property completedAt 完成时间 (ISO 8601)
 * @property error 错误信息
 */
@Serializable
data class RunNode(
    @SerialName("node_id") val nodeId: String,
    @SerialName("node_type") val nodeType: NodeType,
    val name: String,
    val status: NodeStatus,
    val input: String? = null,
    val output: String? = null,
    @SerialName("started_at") val startedAt: String,
    @SerialName("completed_at") val completedAt: String? = null,
    val error: String? = null
)

/**
 * 运行状态枚举
 */
@Serializable
enum class RunStatus {
    /** 排队中 */
    @SerialName("queued") QUEUED,
    /** 运行中 */
    @SerialName("running") RUNNING,
    /** 等待审批 */
    @SerialName("awaiting_approval") AWAITING_APPROVAL,
    /** 已完成 */
    @SerialName("completed") COMPLETED,
    /** 已失败 */
    @SerialName("failed") FAILED,
    /** 已取消 */
    @SerialName("cancelled") CANCELLED,
    /** 已超时 */
    @SerialName("timeout") TIMEOUT
}

/**
 * 节点状态枚举
 */
@Serializable
enum class NodeStatus {
    /** 待执行 */
    @SerialName("pending") PENDING,
    /** 执行中 */
    @SerialName("running") RUNNING,
    /** 等待审批 */
    @SerialName("awaiting_approval") AWAITING_APPROVAL,
    /** 已跳过 */
    @SerialName("skipped") SKIPPED,
    /** 已完成 */
    @SerialName("completed") COMPLETED,
    /** 已失败 */
    @SerialName("failed") FAILED
}

/**
 * 节点类型枚举
 */
@Serializable
enum class NodeType {
    /** 开始节点 */
    @SerialName("start") START,
    /** LLM调用 */
    @SerialName("llm") LLM,
    /** 工具调用 */
    @SerialName("tool") TOOL,
    /** 条件判断 */
    @SerialName("condition") CONDITION,
    /** 人工审批 */
    @SerialName("approval") APPROVAL,
    /** 代码执行 */
    @SerialName("code") CODE,
    /** 并行分支 */
    @SerialName("parallel") PARALLEL,
    /** 结束节点 */
    @SerialName("end") END
}
