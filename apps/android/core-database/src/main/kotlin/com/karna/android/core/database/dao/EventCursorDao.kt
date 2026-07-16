package com.karna.android.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.karna.android.core.database.entity.EventCursorEntity

@Dao
interface EventCursorDao {
    @Query("SELECT * FROM event_cursors WHERE id = :id")
    suspend fun getCursor(id: String = "default"): EventCursorEntity?

    @Query("SELECT * FROM event_cursors WHERE streamType = :streamType LIMIT 1")
    suspend fun getCursorByStreamType(streamType: String): EventCursorEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCursor(cursor: EventCursorEntity)

    @Update
    suspend fun updateCursor(cursor: EventCursorEntity)

    @Query("UPDATE event_cursors SET lastEventId = :eventId, lastTimestamp = :timestamp, updatedAt = :timestamp WHERE id = :id")
    suspend fun updateCursor(id: String, eventId: String?, timestamp: Long = System.currentTimeMillis())
}
