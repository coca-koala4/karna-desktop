package com.karna.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "message_stream_fragments")
data class MessageStreamFragmentEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val messageId: String,
    val sequence: Int,
    val content: String,
    val timestamp: Long = System.currentTimeMillis()
)
