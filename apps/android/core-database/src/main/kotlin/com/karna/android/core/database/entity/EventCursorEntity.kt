package com.karna.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "event_cursors")
data class EventCursorEntity(
    @PrimaryKey val id: String = "default",
    val streamType: String = "default",
    val lastEventId: String? = null,
    val lastSequence: Long = 0,
    val lastTimestamp: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
