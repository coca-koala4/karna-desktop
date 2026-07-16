package com.karna.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "messages")
data class MessageEntity(
    @PrimaryKey val id: String,
    val conversationId: String,
    val runId: String? = null,
    val role: String,
    val content: String,
    val partsJson: String? = null,
    val toolCallsJson: String? = null,
    val isStreaming: Boolean = false,
    val isComplete: Boolean = true,
    val timestamp: Long = System.currentTimeMillis()
)
