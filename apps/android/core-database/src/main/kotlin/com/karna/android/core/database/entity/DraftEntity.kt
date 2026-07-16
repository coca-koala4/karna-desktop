package com.karna.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "drafts")
data class DraftEntity(
    @PrimaryKey val conversationId: String,
    val content: String,
    val attachmentsJson: String? = null,
    val updatedAt: Long = System.currentTimeMillis()
)
