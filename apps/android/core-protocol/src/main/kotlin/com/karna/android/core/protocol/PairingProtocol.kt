package com.karna.android.core.protocol

import com.karna.android.core.crypto.CryptoOperations
import com.karna.android.core.crypto.KeyGenerator
import com.karna.android.core.crypto.KeyStoreManager
import com.karna.android.core.crypto.SasGenerator
import com.karna.android.core.model.MobileDeviceInfo
import com.karna.android.core.model.PairingOfferV1
import com.karna.android.core.model.PairingState
import com.karna.android.core.model.SasConfirmation
import kotlinx.serialization.json.Json
import java.security.PublicKey

/**
 * 配对协议实现
 *
 * 处理设备配对握手流程，包括提议、SAS验证和密钥交换
 */
class PairingProtocol(
    private val localDeviceInfo: MobileDeviceInfo,
    private val keyStoreManager: KeyStoreManager,
    private val sessionProtocol: SessionProtocol,
    private val json: Json = Json { ignoreUnknownKeys = true }
) {

    /**
     * 配对会话状态
     */
    data class PairingSession(
        var state: PairingState = PairingState.IDLE,
        var offer: PairingOfferV1? = null,
        var sas: SasConfirmation? = null,
        var nonce: String? = null,
        var desktopPublicKey: PublicKey? = null,
        var desktopDeviceId: String? = null,
        var ourEphemeralPublicKey: PublicKey? = null,
        var theirEphemeralPublicKey: PublicKey? = null
    )

    private val pairingSessions = mutableMapOf<String, PairingSession>()

    /**
     * 接收并验证配对提议
     *
     * @param offerJson 配对提议JSON字符串
     * @return 验证后的PairingOfferV1和SasConfirmation
     * @throws PairingFailedException 配对提议无效
     * @throws VersionMismatchException 版本不兼容
     * @throws SignatureInvalidException 签名无效
     */
    @Throws(ProtocolException::class)
    fun receiveOffer(offerJson: String): Pair<PairingOfferV1, SasConfirmation> {
        val offer = try {
            json.decodeFromString<PairingOfferV1>(offerJson)
        } catch (e: Exception) {
            throw InvalidFormatException("Invalid pairing offer format", e)
        }

        if (offer.schemaVersion != ProtocolVersion.MAJOR) {
            throw VersionMismatchException("Schema version ${offer.schemaVersion} not supported")
        }

        val desktopPublicKey = keyStoreManager.publicKeyFromBase64(offer.desktopDevice.publicKey)

        val signContent = buildOfferSignContent(offer)
        val signatureValid = CryptoOperations.verifyString(
            desktopPublicKey,
            signContent,
            offer.signature
        )

        if (!signatureValid) {
            throw SignatureInvalidException("Pairing offer signature invalid")
        }

        val session = PairingSession(
            state = PairingState.OFFER_RECEIVED,
            offer = offer,
            nonce = offer.nonce,
            desktopPublicKey = desktopPublicKey,
            desktopDeviceId = offer.desktopDevice.deviceId
        )

        val ourEphemeralPubKey = sessionProtocol.initiateSession(
            offer.desktopDevice.deviceId,
            desktopPublicKey
        )
        session.ourEphemeralPublicKey = ourEphemeralPubKey

        val nonceBytes = android.util.Base64.decode(offer.nonce, android.util.Base64.NO_WRAP)
        val sasCode = SasGenerator.generateSasFromKeyMaterial(
            ourPublicKey = ourEphemeralPubKey.encoded,
            theirPublicKey = desktopPublicKey.encoded,
            nonce = nonceBytes
        )

        val sasConfirmation = SasConfirmation(
            sasCode = sasCode,
            confirmed = false,
            expiresAt = SasGenerator.getExpiryTime(offer.timestamp)
        )
        session.sas = sasConfirmation
        session.state = PairingState.AWAITING_SAS

        pairingSessions[offer.desktopDevice.deviceId] = session

        return Pair(offer, sasConfirmation)
    }

    /**
     * 确认SAS码
     *
     * @param desktopDeviceId 桌面设备ID
     * @param userConfirmed 用户是否确认SAS码匹配
     * @return 配对响应JSON（包含我方公钥等信息）
     * @throws PairingFailedException 配对状态错误
     * @throws SasMismatchException SAS码已过期
     */
    @Throws(ProtocolException::class)
    fun confirmSas(desktopDeviceId: String, userConfirmed: Boolean): String {
        val session = pairingSessions[desktopDeviceId]
            ?: throw PairingFailedException("No pairing session for device $desktopDeviceId")

        if (session.state != PairingState.AWAITING_SAS) {
            throw PairingFailedException("Invalid state for SAS confirmation: ${session.state}")
        }

        if (!userConfirmed) {
            session.state = PairingState.FAILED
            throw SasMismatchException("User rejected SAS confirmation")
        }

        if (SasGenerator.isExpired(session.sas!!.expiresAt)) {
            session.state = PairingState.TIMEOUT
            throw MessageExpiredException("SAS code expired")
        }

        session.sas = session.sas!!.copy(confirmed = true)
        session.state = PairingState.EXCHANGING_KEYS

        val response = buildJsonObject(
            "schemaVersion" to ProtocolVersion.MAJOR,
            "mobileDevice" to localDeviceInfo,
            "nonce" to KeyGenerator.generateNonce(),
            "ephemeralPublicKey" to keyStoreManager.publicKeyToBase64(session.ourEphemeralPublicKey!!),
            "timestamp" to System.currentTimeMillis()
        )

        return json.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), response)
    }

    /**
     * 接收对端临时公钥，完成配对
     *
     * @param desktopDeviceId 桌面设备ID
     * @param peerEphemeralPubKeyBase64 对端临时公钥(Base64)
     * @return 配对成功后的会话密钥对
     */
    @Throws(ProtocolException::class)
    fun completePairing(
        desktopDeviceId: String,
        peerEphemeralPubKeyBase64: String
    ) {
        val session = pairingSessions[desktopDeviceId]
            ?: throw PairingFailedException("No pairing session for device $desktopDeviceId")

        if (session.state != PairingState.EXCHANGING_KEYS) {
            throw PairingFailedException("Invalid state for key exchange: ${session.state}")
        }

        val peerEphemeralPubKey = keyStoreManager.publicKeyFromBase64(peerEphemeralPubKeyBase64)
        val ourKeyPair = keyStoreManager.getPairingKey(desktopDeviceId)
            ?: throw PairingFailedException("Ephemeral key not found")

        sessionProtocol.completeKeyExchange(
            peerId = desktopDeviceId,
            peerEphemeralPublicKey = peerEphemeralPubKey,
            ourEphemeralKeyPair = ourKeyPair
        )

        session.state = PairingState.COMPLETED
    }

    /**
     * 获取配对会话状态
     *
     * @param desktopDeviceId 桌面设备ID
     * @return 配对状态
     */
    fun getPairingState(desktopDeviceId: String): PairingState {
        return pairingSessions[desktopDeviceId]?.state ?: PairingState.IDLE
    }

    /**
     * 取消配对
     *
     * @param desktopDeviceId 桌面设备ID
     */
    fun cancelPairing(desktopDeviceId: String) {
        pairingSessions[desktopDeviceId]?.state = PairingState.CANCELLED
        sessionProtocol.closeSession(desktopDeviceId)
    }

    /**
     * 清理过期的配对会话
     */
    fun cleanupExpiredSessions() {
        val now = System.currentTimeMillis()
        val iterator = pairingSessions.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            val session = entry.value
            if (session.sas != null && SasGenerator.isExpired(session.sas!!.expiresAt, now)) {
                if (session.state == PairingState.AWAITING_SAS) {
                    session.state = PairingState.TIMEOUT
                }
            }
        }
    }

    /**
     * 构建待签名字符串
     */
    private fun buildOfferSignContent(offer: PairingOfferV1): String {
        val device = offer.desktopDevice
        return "${offer.schemaVersion}|${device.deviceId}|${device.publicKey}|${offer.nonce}|${offer.timestamp}"
    }

    /**
     * 构建JsonObject工具方法
     */
    private fun buildJsonObject(vararg pairs: Pair<String, Any?>): kotlinx.serialization.json.JsonObject {
        val map = mutableMapOf<String, kotlinx.serialization.json.JsonElement>()
        for ((key, value) in pairs) {
            when (value) {
                is String -> map[key] = kotlinx.serialization.json.JsonPrimitive(value)
                is Number -> map[key] = kotlinx.serialization.json.JsonPrimitive(value)
                is Boolean -> map[key] = kotlinx.serialization.json.JsonPrimitive(value)
                is MobileDeviceInfo -> map[key] = json.encodeToJsonElement(
                    MobileDeviceInfo.serializer(),
                    value
                )
                null -> Unit
            }
        }
        return kotlinx.serialization.json.JsonObject(map)
    }
}
