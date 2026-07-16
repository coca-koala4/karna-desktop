package com.karna.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "living_works")
data class LivingWorkEntity(
    @PrimaryKey val id: String,
    val projectId: String? = null,
    val title: String? = null,
    val summary: String? = null,
    val status: String = "draft",
    val contractJson: String? = null,
    val candidateStepsJson: String? = null,
    val impactAnalysesJson: String? = null,
    val decisionsJson: String? = null,
    val selectedStepId: String? = null,
    val currentIteration: Int = 0,
    val isActive: Boolean = false,
    val startedAt: Long? = null,
    val pausedAt: Long? = null,
    val completedAt: Long? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
