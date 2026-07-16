package com.karna.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 写作项目信息
 *
 * @property projectId 项目唯一ID
 * @property name 项目名称
 * @property description 项目描述
 * @property status 项目状态
 * @property stats 项目统计信息
 * @property createdAt 创建时间 (ISO 8601)
 * @property updatedAt 最后更新时间 (ISO 8601)
 */
@Serializable
data class WriterProject(
    @SerialName("project_id") val projectId: String,
    val name: String,
    val description: String? = null,
    val status: ProjectStatus,
    val stats: ProjectStats,
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String
)

/**
 * 项目统计信息
 *
 * @property wordCount 总字数
 * @property chapterCount 章节数
 * @property completedTasks 已完成任务数
 * @property totalTasks 总任务数
 * @property progressPercent 完成进度百分比 (0-100)
 */
@Serializable
data class ProjectStats(
    @SerialName("word_count") val wordCount: Int,
    @SerialName("chapter_count") val chapterCount: Int,
    @SerialName("completed_tasks") val completedTasks: Int,
    @SerialName("total_tasks") val totalTasks: Int,
    @SerialName("progress_percent") val progressPercent: Float
)

/**
 * 项目状态枚举
 */
@Serializable
enum class ProjectStatus {
    /** 草稿 */
    @SerialName("draft") DRAFT,
    /** 进行中 */
    @SerialName("in_progress") IN_PROGRESS,
    /** 已完成 */
    @SerialName("completed") COMPLETED,
    /** 已归档 */
    @SerialName("archived") ARCHIVED
}
