package com.karna.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "plans")
data class PlanEntity(
    @PrimaryKey val id: String,
    val projectId: String? = null,
    val title: String,
    val summary: String? = null,
    val status: String = "draft",
    val stepsJson: String? = null,
    val risksJson: String? = null,
    val openQuestionsJson: String? = null,
    val totalEstimatedMinutes: Int? = null,
    val isActive: Boolean = false,
    val approvedAt: Long? = null,
    val approvedBy: String? = null,
    val rejectedReason: String? = null,
    val completedAt: Long? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
