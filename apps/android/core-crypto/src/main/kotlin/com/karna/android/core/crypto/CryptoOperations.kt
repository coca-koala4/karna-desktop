package com.karna.android.core.crypto

import java.security.KeyFactory
import java.security.PrivateKey
import java.security.PublicKey
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.X509EncodedKeySpec
import javax.crypto.KeyAgreement

/**
 * 密码学操作类
 *
 * 提供ECDSA签名/验证、ECDH密钥交换等核心密码学操作
 */
object CryptoOperations {

    private const val SIGNATURE_ALGORITHM = "SHA256withECDSA"
    private const val KEY_AGREEMENT_ALGORITHM = "ECDH"

    /**
     * 使用私钥对数据进行ECDSA签名
     *
     * @param privateKey 私钥
     * @param data 待签名数据
     * @return 签名字节数组
     */
    fun sign(privateKey: PrivateKey, data: ByteArray): ByteArray {
        val signature = Signature.getInstance(SIGNATURE_ALGORITHM)
        signature.initSign(privateKey)
        signature.update(data)
        return signature.sign()
    }

    /**
     * 使用公钥验证ECDSA签名
     *
     * @param publicKey 公钥
     * @param data 原始数据
     * @param signatureBytes 签名数据
     * @return 签名是否有效
     */
    fun verify(publicKey: PublicKey, data: ByteArray, signatureBytes: ByteArray): Boolean {
        return try {
            val signature = Signature.getInstance(SIGNATURE_ALGORITHM)
            signature.initVerify(publicKey)
            signature.update(data)
            signature.verify(signatureBytes)
        } catch (e: Exception) {
            false
        }
    }

    /**
     * 使用Base64编码的公钥验证签名
     *
     * @param publicKeyBase64 Base64编码的公钥
     * @param data 原始数据
     * @param signatureBase64 Base64编码的签名
     * @return 签名是否有效
     */
    fun verify(publicKeyBase64: String, data: ByteArray, signatureBase64: String): Boolean {
        return try {
            val publicKeyBytes = android.util.Base64.decode(
                publicKeyBase64,
                android.util.Base64.NO_WRAP
            )
            val signatureBytes = android.util.Base64.decode(
                signatureBase64,
                android.util.Base64.NO_WRAP
            )
            val keyFactory = KeyFactory.getInstance("EC")
            val publicKey = keyFactory.generatePublic(X509EncodedKeySpec(publicKeyBytes))
            verify(publicKey, data, signatureBytes)
        } catch (e: Exception) {
            false
        }
    }

    /**
     * 执行ECDH密钥交换，生成共享密钥
     *
     * @param privateKey 我方私钥
     * @param peerPublicKey 对端公钥
     * @return 共享密钥字节数组
     */
    fun performKeyAgreement(privateKey: PrivateKey, peerPublicKey: PublicKey): ByteArray {
        val keyAgreement = KeyAgreement.getInstance(KEY_AGREEMENT_ALGORITHM)
        keyAgreement.init(privateKey)
        keyAgreement.doPhase(peerPublicKey, true)
        return keyAgreement.generateSecret()
    }

    /**
     * 对字符串数据签名并返回Base64编码
     *
     * @param privateKey 私钥
     * @param data 待签名字符串
     * @return Base64编码的签名
     */
    fun signString(privateKey: PrivateKey, data: String): String {
        val signatureBytes = sign(privateKey, data.toByteArray(Charsets.UTF_8))
        return android.util.Base64.encodeToString(signatureBytes, android.util.Base64.NO_WRAP)
    }

    /**
     * 验证Base64编码的字符串签名
     *
     * @param publicKey 公钥
     * @param data 原始字符串
     * @param signatureBase64 Base64编码的签名
     * @return 签名是否有效
     */
    fun verifyString(publicKey: PublicKey, data: String, signatureBase64: String): Boolean {
        val signatureBytes = android.util.Base64.decode(
            signatureBase64,
            android.util.Base64.NO_WRAP
        )
        return verify(publicKey, data.toByteArray(Charsets.UTF_8), signatureBytes)
    }
}
