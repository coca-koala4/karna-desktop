package com.karna.android.core.database.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.karna.android.core.database.entity.InteractionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface InteractionDao {
    @Query("SELECT * FROM interactions WHERE runId = :runId ORDER BY createdAt DESC")
    fun getInteractionsByRun(runId: String): Flow<List<InteractionEntity>>

    @Query("SELECT * FROM interactions WHERE id = :id")
    suspend fun getInteractionById(id: String): InteractionEntity?

    @Query("SELECT * FROM interactions WHERE runId = :runId AND status = 'pending' LIMIT 1")
    suspend fun getPendingInteraction(runId: String): InteractionEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertInteraction(interaction: InteractionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertInteractions(interactions: List<InteractionEntity>)

    @Update
    suspend fun updateInteraction(interaction: InteractionEntity)

    @Delete
    suspend fun deleteInteraction(interaction: InteractionEntity)
}
