package com.karna.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 资源快照
 *
 * 聚合所有可用资源的快照信息
 *
 * @property skills 技能资源列表
 * @property mcps MCP资源列表
 * @property souls 灵魂资源列表
 * @property workflows 工作流资源列表
 * @property modes 模式资源列表
 * @property timestamp 快照时间戳 (Unix毫秒)
 */
@Serializable
data class ResourceSnapshot(
    val skills: List<SkillResource>,
    val mcps: List<McpResource>,
    val souls: List<SoulResource>,
    val workflows: List<WorkflowResource>,
    val modes: List<ModeResource>,
    val timestamp: Long
)

/**
 * 技能资源
 *
 * @property id 技能ID
 * @property name 技能名称
 * @property description 技能描述
 * @property version 技能版本
 * @property icon 图标标识
 * @property enabled 是否启用
 */
@Serializable
data class SkillResource(
    val id: String,
    val name: String,
    val description: String,
    val version: String,
    val icon: String? = null,
    val enabled: Boolean = true
)

/**
 * MCP资源
 *
 * @property id MCP服务ID
 * @property name MCP服务名称
 * @property description 服务描述
 * @property tools 提供的工具列表
 * @property status 服务状态 (connected/disconnected/error)
 */
@Serializable
data class McpResource(
    val id: String,
    val name: String,
    val description: String,
    val tools: List<String>,
    val status: String
)

/**
 * 灵魂资源 (AI人格)
 *
 * @property id 灵魂ID
 * @property name 灵魂名称
 * @property description 描述
 * @property avatar 头像URL
 * @property isActive 是否当前激活
 */
@Serializable
data class SoulResource(
    val id: String,
    val name: String,
    val description: String,
    val avatar: String? = null,
    @SerialName("is_active") val isActive: Boolean = false
)

/**
 * 工作流资源
 *
 * @property id 工作流ID
 * @property name 工作流名称
 * @property description 描述
 * @property category 分类
 * @property triggerType 触发类型
 */
@Serializable
data class WorkflowResource(
    val id: String,
    val name: String,
    val description: String,
    val category: String? = null,
    @SerialName("trigger_type") val triggerType: String? = null
)

/**
 * 模式资源
 *
 * @property id 模式ID
 * @property name 模式名称
 * @property description 描述
 * @property icon 图标标识
 * @property isActive 是否当前激活
 */
@Serializable
data class ModeResource(
    val id: String,
    val name: String,
    val description: String,
    val icon: String? = null,
    @SerialName("is_active") val isActive: Boolean = false
)
