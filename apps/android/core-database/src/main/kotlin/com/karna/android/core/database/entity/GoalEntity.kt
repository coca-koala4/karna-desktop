package com.karna.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "goals")
data class GoalEntity(
    @PrimaryKey val id: String,
    val projectId: String? = null,
    val title: String? = null,
    val description: String? = null,
    val status: String = "draft",
    val successCriteriaJson: String? = null,
    val budgetJson: String? = null,
    val blockersJson: String? = null,
    val roundsUsed: Int = 0,
    val currentRound: Int = 0,
    val maxRounds: Int? = null,
    val progressPercent: Int = 0,
    val evidenceJson: String? = null,
    val isActive: Boolean = false,
    val startedAt: Long? = null,
    val pausedAt: Long? = null,
    val completedAt: Long? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
