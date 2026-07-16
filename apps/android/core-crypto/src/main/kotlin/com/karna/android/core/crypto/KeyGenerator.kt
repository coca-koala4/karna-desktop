package com.karna.android.core.crypto

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.SecureRandom

/**
 * P-256密钥对生成器
 *
 * 使用Android Keystore系统生成不可导出的EC密钥对
 */
object KeyGenerator {

    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val EC_CURVE = "secp256r1"

    /**
     * 在Android Keystore中生成新的P-256密钥对
     *
     * @param alias 密钥别名
     * @param userAuthenticationRequired 是否需要用户认证才能使用密钥
     * @param invalidatedByBiometricEnrollment 生物识别变更时密钥是否失效
     * @return 生成的密钥对（私钥在Keystore中，不可导出）
     */
    fun generateKeyPair(
        alias: String,
        userAuthenticationRequired: Boolean = false,
        invalidatedByBiometricEnrollment: Boolean = true
    ): KeyPair {
        val keyPairGenerator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            KEYSTORE_PROVIDER
        )

        val parameterSpecBuilder = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY or KeyProperties.PURPOSE_AGREE_KEY
        )
            .setAlgorithmParameterSpec(
                java.security.spec.ECGenParameterSpec(EC_CURVE)
            )
            .setDigests(
                KeyProperties.DIGEST_SHA256,
                KeyProperties.DIGEST_SHA512
            )
            .setUserAuthenticationRequired(userAuthenticationRequired)
            .setInvalidatedByBiometricEnrollment(invalidatedByBiometricEnrollment)

        keyPairGenerator.initialize(parameterSpecBuilder.build())
        return keyPairGenerator.generateKeyPair()
    }

    /**
     * 生成随机字节数组
     *
     * @param length 字节长度
     * @return 随机字节数组
     */
    fun generateRandomBytes(length: Int): ByteArray {
        val random = SecureRandom()
        val bytes = ByteArray(length)
        random.nextBytes(bytes)
        return bytes
    }

    /**
     * 生成密码学安全的随机nonce
     *
     * @return Base64编码的nonce字符串
     */
    fun generateNonce(): String {
        val nonceBytes = generateRandomBytes(32)
        return android.util.Base64.encodeToString(nonceBytes, android.util.Base64.NO_WRAP)
    }

    /**
     * 从Keystore中获取已有密钥对
     *
     * @param alias 密钥别名
     * @return 密钥对，如果不存在返回null
     */
    fun getKeyPair(alias: String): KeyPair? {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        val entry = keyStore.getEntry(alias, null) as? KeyStore.PrivateKeyEntry
            ?: return null
        return KeyPair(entry.certificate.publicKey, entry.privateKey)
    }

    /**
     * 检查Keystore中是否存在指定别名的密钥
     *
     * @param alias 密钥别名
     * @return 是否存在
     */
    fun keyExists(alias: String): Boolean {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        return keyStore.containsAlias(alias)
    }

    /**
     * 从Keystore中删除密钥
     *
     * @param alias 密钥别名
     */
    fun deleteKey(alias: String) {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        keyStore.deleteEntry(alias)
    }
}
