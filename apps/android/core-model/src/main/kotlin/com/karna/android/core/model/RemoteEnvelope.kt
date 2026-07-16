package com.karna.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
enum class CommandType {
    @SerialName("pair_init") PAIR_INIT,
    @SerialName("pair_confirm") PAIR_CONFIRM,
    @SerialName("sas_confirm") SAS_CONFIRM,
    @SerialName("key_exchange") KEY_EXCHANGE,
    @SerialName("ping") PING,
    @SerialName("pong") PONG,
    @SerialName("event") EVENT,
    @SerialName("command") COMMAND,
    @SerialName("file_chunk") FILE_CHUNK,
    @SerialName("disconnect") DISCONNECT,
    @SerialName("exec_terminal") EXEC_TERMINAL,
    @SerialName("cancel_workflow") CANCEL_WORKFLOW,
    @SerialName("approval_action") APPROVAL_ACTION
}

@Serializable
data class RemoteEventV1(
    @SerialName("sequence_id") val sequenceId: Long,
    @SerialName("event_type") val eventType: String,
    val timestamp: Long = System.currentTimeMillis(),
    val payload: JsonObject = JsonObject(emptyMap()),
    val source: String? = null,
    val version: Int = 1,
    @SerialName("sender_id") val senderId: String? = null,
    val signature: String? = null
)

@Serializable
data class RemoteCommandEnvelopeV1(
    val version: Int = 1,
    @SerialName("command_type") val commandType: CommandType,
    @SerialName("sequence_id") val sequenceId: Long,
    @SerialName("idempotency_key") val idempotencyKey: String,
    @SerialName("sender_id") val senderId: String,
    @SerialName("recipient_id") val recipientId: String,
    val timestamp: Long = System.currentTimeMillis(),
    val payload: JsonObject = JsonObject(emptyMap()),
    val mac: String? = null
)

@Serializable
data class RemoteEnvelopeV1(
    val id: String? = null,
    val type: String,
    val timestamp: Long = System.currentTimeMillis(),
    val payload: JsonObject? = null
)

@Serializable
data class CommandEnvelope(
    @SerialName("command_id") val commandId: String,
    val type: String,
    val payload: JsonObject = JsonObject(emptyMap()),
    val timestamp: Long = System.currentTimeMillis()
)
