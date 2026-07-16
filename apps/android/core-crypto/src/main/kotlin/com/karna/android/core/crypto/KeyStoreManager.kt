package com.karna.android.core.crypto

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPair
import java.security.KeyStore
import java.security.PrivateKey
import java.security.PublicKey
import java.security.interfaces.ECPublicKey
import java.security.spec.X509EncodedKeySpec

/**
 * Android Keystore密钥存储管理器
 *
 * 负责管理不可导出的私钥，提供密钥的安全存储和访问
 */
class KeyStoreManager(
    private val context: Context
) {

    private val keyStore: KeyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply {
        load(null)
    }

    companion object {
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val DEVICE_KEY_ALIAS = "karna_device_identity_key"
        private const val PAIRING_KEY_PREFIX = "karna_pairing_"
    }

    /**
     * 获取或创建设备身份密钥对
     *
     * @return 设备密钥对（私钥不可导出）
     */
    fun getOrCreateDeviceKeyPair(): KeyPair {
        return KeyGenerator.getKeyPair(DEVICE_KEY_ALIAS)
            ?: KeyGenerator.generateKeyPair(DEVICE_KEY_ALIAS)
    }

    /**
     * 获取设备公钥
     *
     * @return 设备公钥
     */
    fun getDevicePublicKey(): PublicKey {
        return getOrCreateDeviceKeyPair().public
    }

    /**
     * 获取设备私钥
     *
     * 注意：私钥不可导出，仅能在Keystore内部使用
     *
     * @return 设备私钥
     */
    fun getDevicePrivateKey(): PrivateKey {
        return getOrCreateDeviceKeyPair().private
    }

    /**
     * 创建设备配对密钥
     *
     * @param peerDeviceId 对端设备ID
     * @return 密钥对
     */
    fun createPairingKey(peerDeviceId: String): KeyPair {
        val alias = PAIRING_KEY_PREFIX + peerDeviceId
        return KeyGenerator.getKeyPair(alias)
            ?: KeyGenerator.generateKeyPair(alias)
    }

    /**
     * 获取配对密钥对
     *
     * @param peerDeviceId 对端设备ID
     * @return 密钥对，不存在返回null
     */
    fun getPairingKey(peerDeviceId: String): KeyPair? {
        val alias = PAIRING_KEY_PREFIX + peerDeviceId
        return KeyGenerator.getKeyPair(alias)
    }

    /**
     * 删除配对密钥
     *
     * @param peerDeviceId 对端设备ID
     */
    fun deletePairingKey(peerDeviceId: String) {
        val alias = PAIRING_KEY_PREFIX + peerDeviceId
        KeyGenerator.deleteKey(alias)
    }

    /**
     * 获取公钥的X.509编码
     *
     * @param publicKey 公钥
     * @return X.509编码的字节数组
     */
    fun encodePublicKey(publicKey: PublicKey): ByteArray {
        return publicKey.encoded
    }

    /**
     * 从X.509编码字节数组恢复公钥
     *
     * @param encoded X.509编码的公钥
     * @return PublicKey对象
     */
    fun decodePublicKey(encoded: ByteArray): PublicKey {
        val keyFactory = java.security.KeyFactory.getInstance(KeyProperties.KEY_ALGORITHM_EC)
        val keySpec = X509EncodedKeySpec(encoded)
        return keyFactory.generatePublic(keySpec)
    }

    /**
     * 获取公钥的Base64编码字符串
     *
     * @param publicKey 公钥
     * @return Base64编码字符串
     */
    fun publicKeyToBase64(publicKey: PublicKey): String {
        return android.util.Base64.encodeToString(
            encodePublicKey(publicKey),
            android.util.Base64.NO_WRAP
        )
    }

    /**
     * 从Base64字符串恢复公钥
     *
     * @param base64 Base64编码的公钥
     * @return PublicKey对象
     */
    fun publicKeyFromBase64(base64: String): PublicKey {
        val bytes = android.util.Base64.decode(base64, android.util.Base64.NO_WRAP)
        return decodePublicKey(bytes)
    }

    /**
     * 删除所有密钥（慎用）
     */
    fun clearAllKeys() {
        val aliases = keyStore.aliases()
        while (aliases.hasMoreElements()) {
            val alias = aliases.nextElement()
            if (alias.startsWith(PAIRING_KEY_PREFIX) || alias == DEVICE_KEY_ALIAS) {
                keyStore.deleteEntry(alias)
            }
        }
    }
}
