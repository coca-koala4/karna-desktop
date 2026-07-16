package com.karna.android.core.database.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karna.android.core.database.entity.MessageStreamFragmentEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface MessageStreamFragmentDao {
    @Query("SELECT * FROM message_stream_fragments WHERE messageId = :messageId ORDER BY sequence ASC")
    fun getFragmentsByMessage(messageId: String): Flow<List<MessageStreamFragmentEntity>>

    @Query("SELECT * FROM message_stream_fragments WHERE messageId = :messageId ORDER BY sequence ASC")
    suspend fun getFragmentsByMessageOnce(messageId: String): List<MessageStreamFragmentEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFragment(fragment: MessageStreamFragmentEntity)

    @Query("DELETE FROM message_stream_fragments WHERE messageId = :messageId")
    suspend fun deleteFragmentsByMessage(messageId: String)
}
