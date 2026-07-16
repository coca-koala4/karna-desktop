package com.karna.android.core.database.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.karna.android.core.database.entity.CommandOutboxEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface CommandOutboxDao {
    @Query("SELECT * FROM command_outbox WHERE status = 'pending' ORDER BY createdAt ASC")
    fun getPendingCommands(): Flow<List<CommandOutboxEntity>>

    @Query("SELECT * FROM command_outbox WHERE status IN ('pending', 'failed') AND retryCount < 5 ORDER BY createdAt ASC")
    suspend fun getPendingCommandsForRetry(): List<CommandOutboxEntity>

    @Query("SELECT * FROM command_outbox WHERE id = :id")
    suspend fun getCommandById(id: String): CommandOutboxEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCommand(command: CommandOutboxEntity)

    @Update
    suspend fun updateCommand(command: CommandOutboxEntity)

    @Delete
    suspend fun deleteCommand(command: CommandOutboxEntity)

    @Query("DELETE FROM command_outbox WHERE id = :id")
    suspend fun deleteCommandById(id: String)

    @Query("UPDATE command_outbox SET status = :status, updatedAt = :timestamp, retryCount = retryCount + 1 WHERE id = :id")
    suspend fun updateStatus(id: String, status: String, timestamp: Long = System.currentTimeMillis())

    @Query("UPDATE command_outbox SET status = 'failed', error = :error, updatedAt = :timestamp, retryCount = retryCount + 1 WHERE id = :id")
    suspend fun markFailed(id: String, error: String, timestamp: Long = System.currentTimeMillis())

    @Query("DELETE FROM command_outbox WHERE status = 'sent' AND updatedAt < :beforeTimestamp")
    suspend fun cleanupSentCommands(beforeTimestamp: Long)
}
