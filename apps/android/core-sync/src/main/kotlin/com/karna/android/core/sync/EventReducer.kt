package com.karna.android.core.sync

import com.karna.android.core.database.KarnaDatabase
import com.karna.android.core.database.entity.ConversationEntity
import com.karna.android.core.database.entity.EventCursorEntity
import com.karna.android.core.database.entity.FileDescriptorEntity
import com.karna.android.core.database.entity.InteractionEntity
import com.karna.android.core.database.entity.MessageEntity
import com.karna.android.core.database.entity.ProjectEntity
import com.karna.android.core.database.entity.RunEntity
import com.karna.android.core.database.entity.RunNodeEntity
import com.karna.android.core.model.RemoteEventV1
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class EventReducer @Inject constructor(
    private val database: KarnaDatabase,
    private val json: Json
) {
    private val processedSequenceIds = mutableSetOf<Long>()

    suspend fun reduce(event: RemoteEventV1): Result<Unit> = runCatching {
        if (isDuplicate(event.sequenceId)) {
            return Result.success(Unit)
        }

        when (event.eventType) {
            "connection.ready" -> handleConnectionReady(event)
            "project.created", "project.updated" -> handleProjectEvent(event)
            "project.deleted" -> handleProjectDeleted(event)
            "conversation.created", "conversation.updated" -> handleConversationEvent(event)
            "conversation.deleted" -> handleConversationDeleted(event)
            "message.start", "message.delta", "message.complete",
            "message.created", "message.updated" -> handleMessageEvent(event)
            "message.deleted" -> handleMessageDeleted(event)
            "tool.start", "tool.complete" -> handleToolEvent(event)
            "run.created", "run.updated" -> handleRunEvent(event)
            "run.node.update" -> handleNodeUpdateEvent(event)
            "interaction.request" -> handleInteractionEvent(event)
            "file.created", "file.updated" -> handleFileEvent(event)
            "file.deleted" -> handleFileDeleted(event)
            else -> handleUnknownEvent(event)
        }

        updateEventCursor(event)
        markProcessed(event.sequenceId)
    }

    private fun isDuplicate(sequenceId: Long): Boolean {
        return processedSequenceIds.contains(sequenceId)
    }

    private fun markProcessed(sequenceId: Long) {
        processedSequenceIds.add(sequenceId)
        if (processedSequenceIds.size > MAX_CACHED_SEQUENCE_IDS) {
            val iterator = processedSequenceIds.iterator()
            if (iterator.hasNext()) {
                iterator.next()
                iterator.remove()
            }
        }
    }

    private suspend fun handleConnectionReady(event: RemoteEventV1) {
    }

    private suspend fun handleProjectEvent(event: RemoteEventV1) {
        val payload = event.payload
        val projectId = payload["project_id"]?.jsonPrimitive?.content ?: return
        val name = payload["name"]?.jsonPrimitive?.content ?: return
        val description = payload["description"]?.jsonPrimitive?.contentOrNull
        val rootPath = payload["root_path"]?.jsonPrimitive?.contentOrNull
        val workspaceName = payload["workspace_name"]?.jsonPrimitive?.contentOrNull
        val createdAt = payload["created_at"]?.jsonPrimitive?.long ?: System.currentTimeMillis()
        val updatedAt = payload["updated_at"]?.jsonPrimitive?.long ?: System.currentTimeMillis()

        val existing = database.projectDao().getProjectById(projectId)
        if (existing != null) {
            database.projectDao().updateProject(
                existing.copy(
                    name = name,
                    description = description ?: existing.description,
                    rootPath = rootPath ?: existing.rootPath,
                    workspaceName = workspaceName ?: existing.workspaceName,
                    updatedAtTimestamp = updatedAt
                )
            )
        } else {
            database.projectDao().insertProject(
                ProjectEntity(
                    id = projectId,
                    name = name,
                    description = description,
                    rootPath = rootPath,
                    createdAtTimestamp = createdAt,
                    updatedAtTimestamp = updatedAt,
                    workspaceName = workspaceName
                )
            )
        }
    }

    private suspend fun handleProjectDeleted(event: RemoteEventV1) {
        val projectId = event.payload["project_id"]?.jsonPrimitive?.content ?: return
        database.projectDao().deleteProjectById(projectId)
    }

    private suspend fun handleConversationEvent(event: RemoteEventV1) {
        val payload = event.payload
        val conversationId = payload["conversation_id"]?.jsonPrimitive?.content ?: return
        val title = payload["title"]?.jsonPrimitive?.content ?: return
        val projectId = payload["project_id"]?.jsonPrimitive?.contentOrNull
        val modelId = payload["model_id"]?.jsonPrimitive?.contentOrNull
        val createdAt = payload["created_at"]?.jsonPrimitive?.long ?: System.currentTimeMillis()
        val updatedAt = payload["updated_at"]?.jsonPrimitive?.long ?: System.currentTimeMillis()
        val lastMessagePreview = payload["last_message_preview"]?.jsonPrimitive?.contentOrNull

        val existing = database.conversationDao().getConversationById(conversationId)
        if (existing != null) {
            database.conversationDao().updateConversation(
                existing.copy(
                    title = title,
                    projectId = projectId ?: existing.projectId,
                    modelId = modelId ?: existing.modelId,
                    lastMessagePreview = lastMessagePreview ?: existing.lastMessagePreview,
                    updatedAtTimestamp = updatedAt
                )
            )
        } else {
            database.conversationDao().insertConversation(
                ConversationEntity(
                    id = conversationId,
                    projectId = projectId,
                    title = title,
                    createdAtTimestamp = createdAt,
                    updatedAtTimestamp = updatedAt,
                    lastMessagePreview = lastMessagePreview,
                    modelId = modelId
                )
            )
        }
    }

    private suspend fun handleConversationDeleted(event: RemoteEventV1) {
        val conversationId = event.payload["conversation_id"]?.jsonPrimitive?.content ?: return
        database.conversationDao().deleteConversationById(conversationId)
    }

    private suspend fun handleMessageEvent(event: RemoteEventV1) {
        val payload = event.payload
        val messageId = payload["message_id"]?.jsonPrimitive?.content ?: return
        val conversationId = payload["conversation_id"]?.jsonPrimitive?.content ?: return
        val role = payload["role"]?.jsonPrimitive?.content ?: return
        val runId = payload["run_id"]?.jsonPrimitive?.contentOrNull
        val timestamp = payload["timestamp"]?.jsonPrimitive?.long ?: System.currentTimeMillis()
        val content = payload["content"]?.jsonPrimitive?.contentOrNull ?: ""
        val toolCallsJson = payload["tool_calls"]?.toString()

        when (event.eventType) {
            "message.start" -> {
                database.messageDao().insertMessage(
                    MessageEntity(
                        id = messageId,
                        conversationId = conversationId,
                        runId = runId,
                        role = role,
                        content = content,
                        timestamp = timestamp,
                        isStreaming = true,
                        isComplete = false,
                        toolCallsJson = toolCallsJson
                    )
                )
            }
            "message.delta" -> {
                val delta = payload["delta"]?.jsonPrimitive?.content ?: return
                database.messageDao().getMessageById(messageId)?.let { existing ->
                    val newContent = existing.content + delta
                    database.messageDao().updateMessageContent(
                        messageId,
                        newContent,
                        isStreaming = true,
                        isComplete = false
                    )
                } ?: run {
                    database.messageDao().insertMessage(
                        MessageEntity(
                            id = messageId,
                            conversationId = conversationId,
                            runId = runId,
                            role = role,
                            content = content + delta,
                            timestamp = timestamp,
                            isStreaming = true,
                            isComplete = false,
                            toolCallsJson = toolCallsJson
                        )
                    )
                }
            }
            "message.complete" -> {
                database.messageDao().getMessageById(messageId)?.let { existing ->
                    val finalContent = content.ifEmpty { existing.content }
                    database.messageDao().updateMessageContent(
                        messageId,
                        finalContent,
                        isStreaming = false,
                        isComplete = true
                    )
                } ?: run {
                    database.messageDao().insertMessage(
                        MessageEntity(
                            id = messageId,
                            conversationId = conversationId,
                            runId = runId,
                            role = role,
                            content = content,
                            timestamp = timestamp,
                            isStreaming = false,
                            isComplete = true,
                            toolCallsJson = toolCallsJson
                        )
                    )
                }
                database.conversationDao().updateLastMessage(
                    conversationId,
                    content.take(100),
                    timestamp
                )
            }
            else -> {
                val existing = database.messageDao().getMessageById(messageId)
                if (existing != null) {
                    database.messageDao().updateMessage(
                        existing.copy(
                            content = content,
                            isStreaming = false,
                            isComplete = true,
                            toolCallsJson = toolCallsJson ?: existing.toolCallsJson
                        )
                    )
                } else {
                    database.messageDao().insertMessage(
                        MessageEntity(
                            id = messageId,
                            conversationId = conversationId,
                            runId = runId,
                            role = role,
                            content = content,
                            timestamp = timestamp,
                            isStreaming = false,
                            isComplete = true,
                            toolCallsJson = toolCallsJson
                        )
                    )
                }
            }
        }
    }

    private suspend fun handleMessageDeleted(event: RemoteEventV1) {
        val messageId = event.payload["message_id"]?.jsonPrimitive?.content ?: return
        database.messageDao().deleteMessageById(messageId)
    }

    private suspend fun handleToolEvent(event: RemoteEventV1) {
        val payload = event.payload
        val toolCallId = payload["tool_call_id"]?.jsonPrimitive?.content ?: return
        val runId = payload["run_id"]?.jsonPrimitive?.contentOrNull ?: return
        val toolName = payload["tool_name"]?.jsonPrimitive?.contentOrNull
        val arguments = payload["arguments"]?.toString()
        val status = when (event.eventType) {
            "tool.start" -> "running"
            "tool.complete" -> payload["status"]?.jsonPrimitive?.content ?: "completed"
            else -> "unknown"
        }
        val output = payload["output"]?.jsonPrimitive?.contentOrNull
        val error = payload["error"]?.jsonPrimitive?.contentOrNull

        val node = RunNodeEntity(
            id = toolCallId,
            runId = runId,
            type = "tool",
            state = status,
            contentJson = arguments,
            metadataJson = toolName?.let { """{"tool_name":"$it","output":${output?.let { "\"$it\"" } ?: "null"},"error":${error?.let { "\"$it\"" } ?: "null"}}""" },
            startedAtTimestamp = if (event.eventType == "tool.start") System.currentTimeMillis() else null,
            completedAtTimestamp = if (event.eventType == "tool.complete") System.currentTimeMillis() else null,
            error = error
        )

        database.runDao().insertNode(node)
    }

    private suspend fun handleRunEvent(event: RemoteEventV1) {
        val payload = event.payload
        val runId = payload["run_id"]?.jsonPrimitive?.content ?: return
        val conversationId = payload["conversation_id"]?.jsonPrimitive?.content ?: return
        val status = payload["status"]?.jsonPrimitive?.content ?: return
        val modelId = payload["model_id"]?.jsonPrimitive?.contentOrNull
        val startedAt = payload["started_at"]?.jsonPrimitive?.long
        val completedAt = payload["completed_at"]?.jsonPrimitive?.long
        val error = payload["error"]?.jsonPrimitive?.contentOrNull
        val inputTokens = payload["input_tokens"]?.jsonPrimitive?.long?.toInt() ?: 0
        val outputTokens = payload["output_tokens"]?.jsonPrimitive?.long?.toInt() ?: 0
        val parentRunId = payload["parent_run_id"]?.jsonPrimitive?.contentOrNull

        val existing = database.runDao().getRunById(runId)
        if (existing != null) {
            val updated = existing.copy(
                status = status,
                modelId = modelId ?: existing.modelId,
                startedAtTimestamp = startedAt ?: existing.startedAtTimestamp,
                completedAtTimestamp = completedAt ?: existing.completedAtTimestamp,
                errorMessage = error ?: existing.errorMessage,
                inputTokens = existing.inputTokens + inputTokens,
                outputTokens = existing.outputTokens + outputTokens,
                parentRunId = parentRunId ?: existing.parentRunId
            )
            database.runDao().updateRun(updated)
        } else {
            database.runDao().insertRun(
                RunEntity(
                    id = runId,
                    conversationId = conversationId,
                    status = status,
                    modelId = modelId,
                    createdAtTimestamp = System.currentTimeMillis(),
                    startedAtTimestamp = startedAt,
                    completedAtTimestamp = completedAt,
                    inputTokens = inputTokens,
                    outputTokens = outputTokens,
                    errorMessage = error,
                    parentRunId = parentRunId
                )
            )
        }
    }

    private suspend fun handleNodeUpdateEvent(event: RemoteEventV1) {
        val payload = event.payload
        val nodeId = payload["node_id"]?.jsonPrimitive?.content ?: return
        val runId = payload["run_id"]?.jsonPrimitive?.content ?: return
        val nodeType = payload["node_type"]?.jsonPrimitive?.content ?: "unknown"
        val state = payload["state"]?.jsonPrimitive?.content ?: return
        val parentNodeId = payload["parent_node_id"]?.jsonPrimitive?.contentOrNull
        val contentJson = payload["content"]?.toString()
        val startedAt = payload["started_at"]?.jsonPrimitive?.long
        val completedAt = payload["completed_at"]?.jsonPrimitive?.long
        val error = payload["error"]?.jsonPrimitive?.contentOrNull
        val metadataJson = payload["metadata"]?.toString()

        val node = RunNodeEntity(
            id = nodeId,
            runId = runId,
            parentNodeId = parentNodeId,
            type = nodeType,
            state = state,
            contentJson = contentJson,
            createdAtTimestamp = System.currentTimeMillis(),
            startedAtTimestamp = startedAt,
            completedAtTimestamp = completedAt,
            error = error,
            metadataJson = metadataJson
        )
        database.runDao().insertNode(node)
    }

    private suspend fun handleInteractionEvent(event: RemoteEventV1) {
        val payload = event.payload
        val interactionId = payload["interaction_id"]?.jsonPrimitive?.content ?: return
        val runId = payload["run_id"]?.jsonPrimitive?.content ?: return
        val type = payload["type"]?.jsonPrimitive?.content ?: return
        val role = payload["role"]?.jsonPrimitive?.contentOrNull
        val content = payload["content"]?.jsonPrimitive?.contentOrNull
        val timestamp = payload["timestamp"]?.jsonPrimitive?.long ?: System.currentTimeMillis()
        val dataJson = payload["data"]?.toString()
        val requiresResponse = payload["requires_response"]?.jsonPrimitive?.content?.toBoolean() ?: true

        database.interactionDao().insertInteraction(
            InteractionEntity(
                id = interactionId,
                runId = runId,
                type = type,
                role = role,
                content = content,
                timestamp = timestamp,
                dataJson = dataJson,
                requiresResponse = requiresResponse
            )
        )
    }

    private suspend fun handleFileEvent(event: RemoteEventV1) {
        val payload = event.payload
        val fileId = payload["file_id"]?.jsonPrimitive?.content ?: return
        val name = payload["file_name"]?.jsonPrimitive?.content ?: return
        val path = payload["path"]?.jsonPrimitive?.content ?: return
        val mimeType = payload["mime_type"]?.jsonPrimitive?.content ?: "application/octet-stream"
        val projectId = payload["project_id"]?.jsonPrimitive?.contentOrNull
        val sizeBytes = payload["size"]?.jsonPrimitive?.long ?: 0L
        val checksum = payload["hash"]?.jsonPrimitive?.contentOrNull
        val createdAt = payload["created_at"]?.jsonPrimitive?.long ?: System.currentTimeMillis()
        val updatedAt = payload["updated_at"]?.jsonPrimitive?.long ?: System.currentTimeMillis()

        val existing = database.fileDao().getFileById(fileId)
        if (existing != null) {
            database.fileDao().updateFile(
                existing.copy(
                    name = name,
                    path = path,
                    mimeType = mimeType,
                    projectId = projectId ?: existing.projectId,
                    sizeBytes = sizeBytes,
                    checksum = checksum ?: existing.checksum,
                    updatedAtTimestamp = updatedAt
                )
            )
        } else {
            database.fileDao().insertFile(
                FileDescriptorEntity(
                    id = fileId,
                    projectId = projectId,
                    name = name,
                    path = path,
                    mimeType = mimeType,
                    sizeBytes = sizeBytes,
                    createdAtTimestamp = createdAt,
                    updatedAtTimestamp = updatedAt,
                    checksum = checksum
                )
            )
        }
    }

    private suspend fun handleFileDeleted(event: RemoteEventV1) {
        val fileId = event.payload["file_id"]?.jsonPrimitive?.content ?: return
        database.fileDao().deleteFileById(fileId)
    }

    private fun handleUnknownEvent(event: RemoteEventV1) {
    }

    private suspend fun updateEventCursor(event: RemoteEventV1) {
        val cursor = database.eventCursorDao().getCursor()
        if (cursor != null) {
            database.eventCursorDao().updateCursor(
                cursor.id,
                event.sequenceId.toString(),
                event.timestamp
            )
        } else {
            database.eventCursorDao().insertCursor(
                EventCursorEntity(
                    id = "default",
                    lastEventId = event.sequenceId.toString(),
                    lastTimestamp = event.timestamp,
                    streamType = "default"
                )
            )
        }
    }

    fun clearCache() {
        processedSequenceIds.clear()
    }

    companion object {
        private const val MAX_CACHED_SEQUENCE_IDS = 1000
    }
}
