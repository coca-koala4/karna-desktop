package com.karna.android.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.karna.android.core.database.entity.DraftEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface DraftDao {
    @Query("SELECT * FROM drafts WHERE conversationId = :conversationId")
    fun getDraftForConversation(conversationId: String): Flow<DraftEntity?>

    @Query("SELECT * FROM drafts WHERE conversationId = :conversationId")
    suspend fun getDraftByConversationId(conversationId: String): DraftEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDraft(draft: DraftEntity)

    @Update
    suspend fun updateDraft(draft: DraftEntity)

    @Query("UPDATE drafts SET content = :content, attachmentsJson = :attachments, updatedAt = :timestamp WHERE conversationId = :conversationId")
    suspend fun updateDraftContent(conversationId: String, content: String, attachments: String?, timestamp: Long = System.currentTimeMillis())

    @Query("DELETE FROM drafts WHERE conversationId = :conversationId")
    suspend fun deleteDraft(conversationId: String)
}
