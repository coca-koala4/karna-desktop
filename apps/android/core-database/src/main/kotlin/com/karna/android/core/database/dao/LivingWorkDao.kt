package com.karna.android.core.database.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.karna.android.core.database.entity.LivingWorkEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface LivingWorkDao {
    @Query("SELECT * FROM living_works ORDER BY updatedAt DESC")
    fun getAllLivingWorks(): Flow<List<LivingWorkEntity>>

    @Query("SELECT * FROM living_works WHERE isActive = 1 LIMIT 1")
    fun getActiveLivingWork(): Flow<LivingWorkEntity?>

    @Query("SELECT * FROM living_works WHERE projectId = :projectId LIMIT 1")
    fun getLivingWorkByProject(projectId: String): Flow<LivingWorkEntity?>

    @Query("SELECT * FROM living_works WHERE id = :id")
    suspend fun getLivingWorkById(id: String): LivingWorkEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLivingWork(work: LivingWorkEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLivingWorks(works: List<LivingWorkEntity>)

    @Update
    suspend fun updateLivingWork(work: LivingWorkEntity)

    @Query("DELETE FROM living_works WHERE id = :id")
    suspend fun deleteLivingWorkById(id: String)

    @Query("UPDATE living_works SET isActive = 0")
    suspend fun clearActiveLivingWorks()

    @Query("UPDATE living_works SET isActive = 1 WHERE id = :id")
    suspend fun setActiveLivingWork(id: String)

    @Query("UPDATE living_works SET updatedAt = :timestamp WHERE id = :id")
    suspend fun updateTimestamp(id: String, timestamp: Long)
}
