package com.karna.android.core.protocol

import com.karna.android.core.crypto.CryptoOperations
import com.karna.android.core.crypto.HashUtils
import com.karna.android.core.crypto.HmacSigner
import com.karna.android.core.crypto.KeyDerivation
import com.karna.android.core.crypto.KeyStoreManager
import com.karna.android.core.model.ConnectionState
import java.security.KeyPair
import java.security.PrivateKey
import java.security.PublicKey
import java.util.concurrent.ConcurrentHashMap

/**
 * 会话协议实现
 *
 * 负责会话建立、密钥交换和消息签名验证
 */
class SessionProtocol(
    private val keyStoreManager: KeyStoreManager,
    private val sequenceTracker: SequenceTracker
) {

    /**
     * 会话状态
     */
    data class SessionState(
        val peerId: String,
        val peerPublicKey: PublicKey,
        val ourKeyPair: KeyPair,
        var encKey: ByteArray,
        var macKey: ByteArray,
        var establishedAt: Long = 0,
        var lastActivityAt: Long = 0,
        var state: ConnectionState = ConnectionState.AUTHENTICATING
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is SessionState) return false
            return peerId == other.peerId
        }

        override fun hashCode(): Int {
            return peerId.hashCode()
        }

        fun clear() {
            encKey.fill(0)
            macKey.fill(0)
        }
    }

    private val sessions = ConcurrentHashMap<String, SessionState>()

    /**
     * 发起会话，生成我方临时密钥对
     *
     * @param peerId 对端设备ID
     * @param peerPublicKey 对端公钥
     * @return 我方公钥（用于发送给对端）
     */
    fun initiateSession(peerId: String, peerPublicKey: PublicKey): PublicKey {
        val ephemeralKeyPair = keyStoreManager.createPairingKey(peerId)
        sessions[peerId] = SessionState(
            peerId = peerId,
            peerPublicKey = peerPublicKey,
            ourKeyPair = ephemeralKeyPair,
            encKey = ByteArray(0),
            macKey = ByteArray(0),
            state = ConnectionState.AUTHENTICATING
        )
        return ephemeralKeyPair.public
    }

    /**
     * 接收对端公钥，完成密钥交换
     *
     * @param peerId 对端设备ID
     * @param peerEphemeralPublicKey 对端临时公钥
     * @param ourEphemeralKeyPair 我方临时密钥对
     * @return 会话密钥对
     * @throws KeyExchangeFailedException 密钥交换失败
     */
    @Throws(ProtocolException::class)
    fun completeKeyExchange(
        peerId: String,
        peerEphemeralPublicKey: PublicKey,
        ourEphemeralKeyPair: KeyPair
    ): Pair<ByteArray, ByteArray> {
        val sharedSecret = try {
            CryptoOperations.performKeyAgreement(
                ourEphemeralKeyPair.private,
                peerEphemeralPublicKey
            )
        } catch (e: Exception) {
            throw KeyExchangeFailedException("ECDH key agreement failed", e)
        }

        val ourPubBytes = ourEphemeralKeyPair.public.encoded
        val theirPubBytes = peerEphemeralPublicKey.encoded
        val salt = HashUtils.sha256(ourPubBytes + theirPubBytes)

        val sessionKeys = KeyDerivation.deriveSessionKeys(sharedSecret, salt)

        val state = sessions[peerId]
        if (state != null) {
            state.encKey = sessionKeys.encKey
            state.macKey = sessionKeys.macKey
            state.establishedAt = System.currentTimeMillis()
            state.lastActivityAt = state.establishedAt
            state.state = ConnectionState.CONNECTED_LAN
        }

        return Pair(sessionKeys.encKey, sessionKeys.macKey)
    }

    /**
     * 验证命令MAC
     *
     * @param peerId 对端设备ID
     * @param mac 消息MAC
     * @param content 原始内容
     * @return 验证是否通过
     * @throws SessionNotEstablishedException 会话未建立
     * @throws MacInvalidException MAC验证失败
     */
    @Throws(ProtocolException::class)
    fun verifyMac(peerId: String, mac: String, content: String): Boolean {
        val session = sessions[peerId]
            ?: throw SessionNotEstablishedException("No session for peer $peerId")

        val valid = HmacSigner.verifyString(session.macKey, content, mac)
        if (!valid) {
            throw MacInvalidException()
        }

        session.lastActivityAt = System.currentTimeMillis()
        return true
    }

    /**
     * 验证命令签名（配对阶段使用）
     *
     * @param publicKey 签名公钥
     * @param signature 签名
     * @param content 原始内容
     * @return 验证是否通过
     */
    fun verifySignature(publicKey: PublicKey, signature: String, content: String): Boolean {
        return CryptoOperations.verifyString(publicKey, content, signature)
    }

    /**
     * 获取会话状态
     *
     * @param peerId 对端设备ID
     * @return 会话状态，不存在返回null
     */
    fun getSession(peerId: String): SessionState? {
        return sessions[peerId]
    }

    /**
     * 获取会话加密密钥
     *
     * @param peerId 对端设备ID
     * @return 加密密钥
     */
    fun getEncKey(peerId: String): ByteArray? {
        return sessions[peerId]?.encKey
    }

    /**
     * 获取会话MAC密钥
     *
     * @param peerId 对端设备ID
     * @return MAC密钥
     */
    fun getMacKey(peerId: String): ByteArray? {
        return sessions[peerId]?.macKey
    }

    /**
     * 更新会话连接状态
     *
     * @param peerId 对端设备ID
     * @param state 新状态
     */
    fun updateConnectionState(peerId: String, state: ConnectionState) {
        sessions[peerId]?.state = state
    }

    /**
     * 检查会话是否已建立
     *
     * @param peerId 对端设备ID
     * @return 是否已建立
     */
    fun isSessionEstablished(peerId: String): Boolean {
        val session = sessions[peerId] ?: return false
        return session.state == ConnectionState.CONNECTED_LAN
                || session.state == ConnectionState.CONNECTED_PEER
                || session.state == ConnectionState.CONNECTED_RELAY
    }

    /**
     * 关闭会话
     *
     * @param peerId 对端设备ID
     */
    fun closeSession(peerId: String) {
        sessions.remove(peerId)?.clear()
        keyStoreManager.deletePairingKey(peerId)
        sequenceTracker.resetPeer(peerId)
    }

    /**
     * 关闭所有会话
     */
    fun closeAllSessions() {
        sessions.values.forEach { it.clear() }
        sessions.clear()
        sequenceTracker.resetAll()
    }

    /**
     * 获取所有已建立会话的对端ID列表
     */
    fun getConnectedPeers(): List<String> {
        return sessions.values
            .filter {
                it.state == ConnectionState.CONNECTED_LAN
                        || it.state == ConnectionState.CONNECTED_PEER
                        || it.state == ConnectionState.CONNECTED_RELAY
            }
            .map { it.peerId }
    }
}
