package com.karna.android.core.protocol

import com.karna.android.core.crypto.CryptoOperations
import com.karna.android.core.crypto.HmacSigner
import com.karna.android.core.crypto.KeyStoreManager
import com.karna.android.core.model.RemoteEventV1
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.security.PublicKey

/**
 * 事件反序列化器
 *
 * 负责将接收到的JSON事件数据反序列化为类型化对象，并进行签名验证
 */
class EventDeserializer(
    private val keyStoreManager: KeyStoreManager,
    private val json: Json = Json { ignoreUnknownKeys = true }
) {

    /**
     * 反序列化并验证远程事件
     *
     * @param jsonString JSON字符串
     * @param peerPublicKey 对端公钥（用于验证签名）
     * @return 验证通过的RemoteEventV1对象
     * @throws InvalidFormatException JSON格式错误
     * @throws SignatureInvalidException 签名验证失败
     * @throws VersionMismatchException 版本不兼容
     */
    @Throws(ProtocolException::class)
    fun deserializeAndVerify(jsonString: String, peerPublicKey: PublicKey): RemoteEventV1 {
        val event = try {
            json.decodeFromString<RemoteEventV1>(jsonString)
        } catch (e: Exception) {
            throw InvalidFormatException("Failed to parse event: ${e.message}", e)
        }

        if (event.version != ProtocolVersion.MAJOR) {
            throw VersionMismatchException("Event version ${event.version} not supported")
        }

        val senderId = event.senderId ?: throw InvalidFormatException("Missing senderId", null)
        val signature = event.signature ?: throw SignatureInvalidException("Missing signature")

        val signContent = buildSignContent(
            version = event.version,
            eventType = event.eventType,
            sequenceId = event.sequenceId,
            senderId = senderId,
            timestamp = event.timestamp,
            payload = event.payload
        )

        val signatureValid = CryptoOperations.verifyString(
            peerPublicKey,
            signContent,
            signature
        )

        if (!signatureValid) {
            throw SignatureInvalidException("Event signature verification failed")
        }

        return event
    }

    /**
     * 仅反序列化，不验证签名（用于调试）
     *
     * @param jsonString JSON字符串
     * @return RemoteEventV1对象
     */
    fun deserialize(jsonString: String): RemoteEventV1 {
        return try {
            json.decodeFromString<RemoteEventV1>(jsonString)
        } catch (e: Exception) {
            throw InvalidFormatException("Failed to parse event: ${e.message}", e)
        }
    }

    /**
     * 验证事件MAC
     *
     * @param event 事件对象
     * @param macKey MAC密钥
     * @return 验证是否通过
     */
    fun verifyMac(event: RemoteEventV1, macKey: ByteArray): Boolean {
        val senderId = event.senderId ?: return false
        val signature = event.signature ?: return false
        val macContent = buildMacContent(
            version = event.version,
            eventType = event.eventType,
            sequenceId = event.sequenceId,
            senderId = senderId,
            timestamp = event.timestamp,
            payload = event.payload
        )
        return HmacSigner.verifyString(macKey, macContent, signature)
    }

    /**
     * 构建签名字符串
     */
    private fun buildSignContent(
        version: Int,
        eventType: String,
        sequenceId: Long,
        senderId: String,
        timestamp: Long,
        payload: JsonObject
    ): String {
        val payloadJson = json.encodeToString(JsonObject.serializer(), payload)
        return "$version|$eventType|$sequenceId|$senderId|$timestamp|$payloadJson"
    }

    /**
     * 构建MAC字符串
     */
    private fun buildMacContent(
        version: Int,
        eventType: String,
        sequenceId: Long,
        senderId: String,
        timestamp: Long,
        payload: JsonObject
    ): String {
        val payloadJson = json.encodeToString(JsonObject.serializer(), payload)
        return "$version:$eventType:$sequenceId:$senderId:$timestamp:$payloadJson"
    }
}
