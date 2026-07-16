package com.karna.android.core.database.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.karna.android.core.database.entity.RunEntity
import com.karna.android.core.database.entity.RunNodeEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface RunDao {
    @Query("SELECT * FROM runs WHERE conversationId = :conversationId ORDER BY startedAtTimestamp DESC")
    fun getRunsByConversation(conversationId: String): Flow<List<RunEntity>>

    @Query("SELECT * FROM runs WHERE status IN ('running', 'queued', 'awaiting_approval') ORDER BY startedAtTimestamp DESC")
    fun getActiveRuns(): Flow<List<RunEntity>>

    @Query("SELECT * FROM run_nodes WHERE runId = :runId ORDER BY startedAtTimestamp ASC")
    fun getNodesByRun(runId: String): Flow<List<RunNodeEntity>>

    @Query("SELECT * FROM runs WHERE id = :id")
    suspend fun getRunById(id: String): RunEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRun(run: RunEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRuns(runs: List<RunEntity>)

    @Update
    suspend fun updateRun(run: RunEntity)

    @Delete
    suspend fun deleteRun(run: RunEntity)

    @Query("UPDATE runs SET status = :status, startedAtTimestamp = :startedAt WHERE id = :id")
    suspend fun updateRunStatusStarted(id: String, status: String, startedAt: Long)

    @Query("UPDATE runs SET status = :status, completedAtTimestamp = :completedAt, errorMessage = :error WHERE id = :id")
    suspend fun updateRunStatusCompleted(id: String, status: String, completedAt: Long, error: String?)

    @Query("UPDATE runs SET inputTokens = :inputTokens, outputTokens = :outputTokens WHERE id = :id")
    suspend fun updateTokenCounts(id: String, inputTokens: Int, outputTokens: Int)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertNode(node: RunNodeEntity)

    @Update
    suspend fun updateNode(node: RunNodeEntity)
}
