package com.karna.android.core.database.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.karna.android.core.database.entity.MessageEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface MessageDao {
    @Query("SELECT * FROM messages WHERE conversationId = :conversationId ORDER BY timestamp ASC")
    fun getMessagesByConversation(conversationId: String): Flow<List<MessageEntity>>

    @Query("SELECT * FROM messages WHERE runId = :runId ORDER BY timestamp ASC")
    fun getMessagesByRun(runId: String): Flow<List<MessageEntity>>

    @Query("SELECT * FROM messages WHERE id = :id")
    suspend fun getMessageById(id: String): MessageEntity?

    @Query("SELECT * FROM messages WHERE conversationId = :conversationId AND isStreaming = 1 LIMIT 1")
    suspend fun getStreamingMessage(conversationId: String): MessageEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessage(message: MessageEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessages(messages: List<MessageEntity>)

    @Update
    suspend fun updateMessage(message: MessageEntity)

    @Delete
    suspend fun deleteMessage(message: MessageEntity)

    @Query("DELETE FROM messages WHERE id = :id")
    suspend fun deleteMessageById(id: String)

    @Query("UPDATE messages SET content = :content, isStreaming = :isStreaming, isComplete = :isComplete WHERE id = :id")
    suspend fun updateMessageContent(id: String, content: String, isStreaming: Boolean, isComplete: Boolean)

    @Query("UPDATE messages SET isStreaming = 0, isComplete = 1 WHERE conversationId = :conversationId AND isStreaming = 1")
    suspend fun markAllComplete(conversationId: String)
}
