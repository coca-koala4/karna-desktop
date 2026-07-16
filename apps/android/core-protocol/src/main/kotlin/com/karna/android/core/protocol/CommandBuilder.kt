package com.karna.android.core.protocol

import com.karna.android.core.crypto.AesGcmCipher
import com.karna.android.core.crypto.CryptoOperations
import com.karna.android.core.crypto.HmacSigner
import com.karna.android.core.crypto.KeyDerivation
import com.karna.android.core.model.CommandType
import com.karna.android.core.model.RemoteCommandEnvelopeV1
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.security.PrivateKey
import java.util.UUID

/**
 * 命令构建器
 *
 * 负责构建远程命令信封，处理序列号、MAC生成和幂等键
 */
class CommandBuilder(
    private val senderDeviceId: String,
    private val privateKey: PrivateKey,
    private val sequenceTracker: SequenceTracker,
    private val json: Json = Json { ignoreUnknownKeys = true }
) {

    /**
     * 会话密钥信息
     */
    data class SessionKeys(
        val encKey: ByteArray,
        val macKey: ByteArray
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is SessionKeys) return false
            return encKey.contentEquals(other.encKey) && macKey.contentEquals(other.macKey)
        }

        override fun hashCode(): Int {
            var result = encKey.contentHashCode()
            result = 31 * result + macKey.contentHashCode()
            return result
        }
    }

    private val peerSessionKeys = mutableMapOf<String, SessionKeys>()

    /**
     * 设置对端会话密钥
     *
     * @param peerId 对端设备ID
     * @param encKey 加密密钥
     * @param macKey MAC密钥
     */
    fun setSessionKeys(peerId: String, encKey: ByteArray, macKey: ByteArray) {
        peerSessionKeys[peerId] = SessionKeys(encKey, macKey)
    }

    /**
     * 从共享密钥派生并设置会话密钥
     *
     * @param peerId 对端设备ID
     * @param sharedSecret ECDH共享密钥
     * @param salt 盐值
     */
    fun deriveAndSetSessionKeys(peerId: String, sharedSecret: ByteArray, salt: ByteArray) {
        val keys = KeyDerivation.deriveSessionKeys(sharedSecret, salt)
        setSessionKeys(peerId, keys.encKey, keys.macKey)
    }

    /**
     * 构建命令信封
     *
     * @param recipientId 接收方设备ID
     * @param commandType 命令类型
     * @param payload 命令负载
     * @param idempotencyKey 幂等键（不传则自动生成）
     * @return 构建好的命令信封
     */
    fun buildCommand(
        recipientId: String,
        commandType: CommandType,
        payload: JsonObject,
        idempotencyKey: String? = null
    ): RemoteCommandEnvelopeV1 {
        val sequenceId = sequenceTracker.nextSendSequence(recipientId)
        val actualIdempotencyKey = idempotencyKey ?: generateIdempotencyKey()
        val timestamp = System.currentTimeMillis()

        val sessionKeys = peerSessionKeys[recipientId]
        val mac = if (sessionKeys != null) {
            generateMac(
                macKey = sessionKeys.macKey,
                version = ProtocolVersion.MAJOR,
                commandType = commandType,
                sequenceId = sequenceId,
                idempotencyKey = actualIdempotencyKey,
                senderId = senderDeviceId,
                recipientId = recipientId,
                timestamp = timestamp,
                payload = payload
            )
        } else {
            generateSignature(
                commandType = commandType,
                sequenceId = sequenceId,
                idempotencyKey = actualIdempotencyKey,
                recipientId = recipientId,
                timestamp = timestamp,
                payload = payload
            )
        }

        return RemoteCommandEnvelopeV1(
            version = ProtocolVersion.MAJOR,
            commandType = commandType,
            sequenceId = sequenceId,
            idempotencyKey = actualIdempotencyKey,
            senderId = senderDeviceId,
            recipientId = recipientId,
            timestamp = timestamp,
            payload = payload,
            mac = mac
        )
    }

    /**
     * 将命令信封序列化为JSON字符串
     *
     * @param command 命令信封
     * @return JSON字符串
     */
    fun serializeCommand(command: RemoteCommandEnvelopeV1): String {
        return json.encodeToString(RemoteCommandEnvelopeV1.serializer(), command)
    }

    /**
     * 构建并序列化命令
     *
     * @param recipientId 接收方设备ID
     * @param commandType 命令类型
     * @param payload 命令负载
     * @return JSON字符串
     */
    fun buildAndSerialize(
        recipientId: String,
        commandType: CommandType,
        payload: JsonObject
    ): String {
        val command = buildCommand(recipientId, commandType, payload)
        return serializeCommand(command)
    }

    /**
     * 生成幂等键
     */
    private fun generateIdempotencyKey(): String {
        return UUID.randomUUID().toString()
    }

    /**
     * 生成MAC
     */
    private fun generateMac(
        macKey: ByteArray,
        version: Int,
        commandType: CommandType,
        sequenceId: Long,
        idempotencyKey: String,
        senderId: String,
        recipientId: String,
        timestamp: Long,
        payload: JsonObject
    ): String {
        val payloadJson = json.encodeToString(JsonObject.serializer(), payload)
        val macContent = "$version:$commandType:$sequenceId:$idempotencyKey:$senderId:$recipientId:$timestamp:$payloadJson"
        return HmacSigner.signString(macKey, macContent)
    }

    /**
     * 生成签名（未建立会话时使用）
     */
    private fun generateSignature(
        commandType: CommandType,
        sequenceId: Long,
        idempotencyKey: String,
        recipientId: String,
        timestamp: Long,
        payload: JsonObject
    ): String {
        val payloadJson = json.encodeToString(JsonObject.serializer(), payload)
        val signContent = "$commandType|$sequenceId|$idempotencyKey|$senderDeviceId|$recipientId|$timestamp|$payloadJson"
        return CryptoOperations.signString(privateKey, signContent)
    }

    /**
     * 清除对端会话密钥
     */
    fun clearSessionKeys(peerId: String) {
        peerSessionKeys.remove(peerId)
    }

    /**
     * 清除所有会话密钥
     */
    fun clearAllSessionKeys() {
        peerSessionKeys.values.forEach { keys ->
            keys.encKey.fill(0)
            keys.macKey.fill(0)
        }
        peerSessionKeys.clear()
    }
}
