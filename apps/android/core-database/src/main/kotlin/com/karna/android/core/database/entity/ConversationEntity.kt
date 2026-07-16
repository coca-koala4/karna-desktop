package com.karna.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "conversations")
data class ConversationEntity(
    @PrimaryKey val id: String,
    val projectId: String? = null,
    val title: String,
    val modelId: String? = null,
    val lastMessagePreview: String? = null,
    val tokenPrompt: Int = 0,
    val tokenCompletion: Int = 0,
    val tokenTotal: Int = 0,
    val isArchived: Boolean = false,
    val createdAtTimestamp: Long = System.currentTimeMillis(),
    val updatedAtTimestamp: Long = System.currentTimeMillis()
)
