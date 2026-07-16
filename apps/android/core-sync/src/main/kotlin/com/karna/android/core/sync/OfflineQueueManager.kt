package com.karna.android.core.sync

import com.karna.android.core.database.KarnaDatabase
import com.karna.android.core.database.entity.CommandOutboxEntity
import com.karna.android.core.database.entity.DraftEntity
import com.karna.android.core.model.CommandType
import kotlinx.coroutines.flow.Flow
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OfflineQueueManager @Inject constructor(
    private val database: KarnaDatabase
) {
    private val highRiskCommands = setOf(
        CommandType.EXEC_TERMINAL,
        CommandType.CANCEL_WORKFLOW,
        CommandType.APPROVAL_ACTION
    )

    fun getPendingCommands(): Flow<List<CommandOutboxEntity>> {
        return database.commandOutboxDao().getPendingCommands()
    }

    fun getDraftForConversation(conversationId: String): Flow<DraftEntity?> {
        return database.draftDao().getDraftForConversation(conversationId)
    }

    suspend fun saveDraft(conversationId: String, content: String, attachmentsJson: String? = null) {
        val existingDraft = database.draftDao().getDraftByConversationId(conversationId)
        if (existingDraft != null) {
            database.draftDao().updateDraftContent(conversationId, content, attachmentsJson)
        } else {
            database.draftDao().insertDraft(
                DraftEntity(
                    conversationId = conversationId,
                    content = content,
                    attachmentsJson = attachmentsJson
                )
            )
        }
    }

    suspend fun clearDraft(conversationId: String) {
        database.draftDao().deleteDraft(conversationId)
    }

    suspend fun enqueueCommand(
        type: CommandType,
        payloadJson: String,
        relatedRunId: String? = null,
        relatedConversationId: String? = null,
        idempotencyKey: String = UUID.randomUUID().toString()
    ): Result<String> {
        if (highRiskCommands.contains(type)) {
            return Result.failure(
                IllegalStateException("High-risk commands cannot be auto-queued offline: ${type.name}")
            )
        }

        val command = CommandOutboxEntity(
            id = idempotencyKey,
            type = type.name,
            payloadJson = payloadJson,
            status = "pending",
            relatedRunId = relatedRunId,
            relatedConversationId = relatedConversationId
        )

        return runCatching {
            database.commandOutboxDao().insertCommand(command)
            command.id
        }
    }

    suspend fun markCommandSent(id: String) {
        database.commandOutboxDao().updateStatus(id, "sent")
    }

    suspend fun markCommandFailed(id: String, error: String) {
        database.commandOutboxDao().markFailed(id, error)
    }

    suspend fun getPendingCommandsForRetry(): List<CommandOutboxEntity> {
        return database.commandOutboxDao().getPendingCommandsForRetry()
    }

    suspend fun cleanupOldSentCommands(olderThanMs: Long = 7 * 24 * 60 * 60 * 1000L) {
        val cutoffTime = System.currentTimeMillis() - olderThanMs
        database.commandOutboxDao().cleanupSentCommands(cutoffTime)
    }
}
