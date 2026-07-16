package com.karna.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "runs")
data class RunEntity(
    @PrimaryKey val id: String,
    val conversationId: String? = null,
    val workflowId: String = "",
    val workflowName: String = "",
    val modelId: String? = null,
    val parentRunId: String? = null,
    val status: String,
    val inputTokens: Int = 0,
    val outputTokens: Int = 0,
    val errorMessage: String? = null,
    val createdAtTimestamp: Long = System.currentTimeMillis(),
    val startedAtTimestamp: Long? = null,
    val completedAtTimestamp: Long? = null
)
