package com.karna.android.core.crypto

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * AES-256-GCM加解密工具
 *
 * 提供认证加密，确保数据的机密性和完整性
 */
object AesGcmCipher {

    private const val ALGORITHM = "AES/GCM/NoPadding"
    private const val KEY_ALGORITHM = "AES"
    private const val GCM_IV_LENGTH = 12
    private const val GCM_TAG_LENGTH = 128

    /**
     * 使用AES-256-GCM加密数据
     *
     * @param plainText 明文数据
     * @param key 密钥 (32字节 = 256位)
     * @return IV + 密文字节数组
     */
    fun encrypt(plainText: ByteArray, key: ByteArray): ByteArray {
        require(key.size == 32) { "Key must be 32 bytes (256 bits) for AES-256" }

        val iv = ByteArray(GCM_IV_LENGTH)
        SecureRandom().nextBytes(iv)

        val cipher = Cipher.getInstance(ALGORITHM)
        val keySpec = SecretKeySpec(key, KEY_ALGORITHM)
        val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
        cipher.init(Cipher.ENCRYPT_MODE, keySpec, gcmSpec)

        val cipherText = cipher.doFinal(plainText)

        return iv + cipherText
    }

    /**
     * 使用AES-256-GCM解密数据
     *
     * @param encryptedData IV + 密文字节数组
     * @param key 密钥 (32字节 = 256位)
     * @return 明文字节数组
     * @throws IllegalArgumentException 如果认证失败或数据格式错误
     */
    fun decrypt(encryptedData: ByteArray, key: ByteArray): ByteArray {
        require(key.size == 32) { "Key must be 32 bytes (256 bits) for AES-256" }
        require(encryptedData.size >= GCM_IV_LENGTH + 16) { "Invalid encrypted data" }

        val iv = encryptedData.sliceArray(0 until GCM_IV_LENGTH)
        val cipherText = encryptedData.sliceArray(GCM_IV_LENGTH until encryptedData.size)

        val cipher = Cipher.getInstance(ALGORITHM)
        val keySpec = SecretKeySpec(key, KEY_ALGORITHM)
        val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
        cipher.init(Cipher.DECRYPT_MODE, keySpec, gcmSpec)

        return cipher.doFinal(cipherText)
    }

    /**
     * 加密字符串
     *
     * @param plainText 明文字符串
     * @param key 密钥
     * @return Base64编码的加密数据
     */
    fun encryptString(plainText: String, key: ByteArray): String {
        val encrypted = encrypt(plainText.toByteArray(Charsets.UTF_8), key)
        return android.util.Base64.encodeToString(encrypted, android.util.Base64.NO_WRAP)
    }

    /**
     * 解密字符串
     *
     * @param encryptedBase64 Base64编码的加密数据
     * @param key 密钥
     * @return 明文字符串
     */
    fun decryptString(encryptedBase64: String, key: ByteArray): String {
        val encrypted = android.util.Base64.decode(encryptedBase64, android.util.Base64.NO_WRAP)
        val decrypted = decrypt(encrypted, key)
        return String(decrypted, Charsets.UTF_8)
    }

    /**
     * 生成随机AES-256密钥
     *
     * @return 32字节随机密钥
     */
    fun generateKey(): ByteArray {
        return KeyGenerator.generateRandomBytes(32)
    }
}
