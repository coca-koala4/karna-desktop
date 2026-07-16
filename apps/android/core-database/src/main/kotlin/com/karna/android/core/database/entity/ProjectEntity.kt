package com.karna.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "projects")
data class ProjectEntity(
    @PrimaryKey val id: String,
    val name: String,
    val description: String? = null,
    val rootPath: String? = null,
    val workspaceName: String? = null,
    val status: String = "draft",
    val wordCount: Int = 0,
    val chapterCount: Int = 0,
    val completedTasks: Int = 0,
    val totalTasks: Int = 0,
    val progressPercent: Float = 0f,
    val isActive: Boolean = false,
    val createdAtTimestamp: Long = System.currentTimeMillis(),
    val updatedAtTimestamp: Long = System.currentTimeMillis()
)
