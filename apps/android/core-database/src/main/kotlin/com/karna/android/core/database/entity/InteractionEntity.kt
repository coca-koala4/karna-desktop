package com.karna.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "interactions")
data class InteractionEntity(
    @PrimaryKey val id: String,
    val runId: String? = null,
    val nodeId: String? = null,
    val type: String,
    val role: String? = null,
    val content: String? = null,
    val status: String = "pending",
    val approvalLevel: String = "confirm",
    val title: String = "",
    val description: String = "",
    val dataJson: String? = null,
    val requestData: String? = null,
    val responseData: String? = null,
    val requiresResponse: Boolean = true,
    val createdAt: Long = System.currentTimeMillis(),
    val timestamp: Long = System.currentTimeMillis(),
    val expiresAt: Long? = null,
    val respondedAt: Long? = null
)
