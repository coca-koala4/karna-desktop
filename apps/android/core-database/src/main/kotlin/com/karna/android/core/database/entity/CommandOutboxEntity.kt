package com.karna.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "command_outbox")
data class CommandOutboxEntity(
    @PrimaryKey val id: String,
    val type: String = "",
    val commandType: String = "",
    val payloadJson: String,
    val relatedRunId: String? = null,
    val relatedConversationId: String? = null,
    val status: String = "pending",
    val sequenceId: Long = 0,
    val retryCount: Int = 0,
    val error: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
