package com.karna.android.core.crypto

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * HMAC-SHA256消息认证工具
 *
 * 提供消息完整性和来源认证
 */
object HmacSigner {

    private const val ALGORITHM = "HmacSHA256"

    /**
     * 计算HMAC-SHA256
     *
     * @param key 密钥
     * @param data 待认证数据
     * @return HMAC字节数组
     */
    fun sign(key: ByteArray, data: ByteArray): ByteArray {
        val mac = Mac.getInstance(ALGORITHM)
        val keySpec = SecretKeySpec(key, ALGORITHM)
        mac.init(keySpec)
        return mac.doFinal(data)
    }

    /**
     * 计算字符串的HMAC-SHA256
     *
     * @param key 密钥
     * @param data 待认证字符串
     * @return Base64编码的HMAC
     */
    fun signString(key: ByteArray, data: String): String {
        val hmacBytes = sign(key, data.toByteArray(Charsets.UTF_8))
        return android.util.Base64.encodeToString(hmacBytes, android.util.Base64.NO_WRAP)
    }

    /**
     * 验证HMAC
     *
     * 使用恒定时间比较防止时序攻击
     *
     * @param key 密钥
     * @param data 原始数据
     * @param expectedHmac 期望的HMAC
     * @return 是否验证通过
     */
    fun verify(key: ByteArray, data: ByteArray, expectedHmac: ByteArray): Boolean {
        val actualHmac = sign(key, data)
        return constantTimeEquals(actualHmac, expectedHmac)
    }

    /**
     * 验证Base64编码的字符串HMAC
     *
     * @param key 密钥
     * @param data 原始字符串
     * @param expectedHmacBase64 Base64编码的期望HMAC
     * @return 是否验证通过
     */
    fun verifyString(key: ByteArray, data: String, expectedHmacBase64: String): Boolean {
        val expectedHmac = android.util.Base64.decode(
            expectedHmacBase64,
            android.util.Base64.NO_WRAP
        )
        return verify(key, data.toByteArray(Charsets.UTF_8), expectedHmac)
    }

    /**
     * 恒定时间字节数组比较
     *
     * 防止时序攻击
     *
     * @param a 字节数组A
     * @param b 字节数组B
     * @return 是否相等
     */
    private fun constantTimeEquals(a: ByteArray, b: ByteArray): Boolean {
        if (a.size != b.size) return false
        var result = 0
        for (i in a.indices) {
            result = result or (a[i].toInt() xor b[i].toInt())
        }
        return result == 0
    }
}
