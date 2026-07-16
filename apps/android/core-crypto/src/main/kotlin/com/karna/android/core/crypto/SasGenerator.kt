package com.karna.android.core.crypto

import java.security.SecureRandom

/**
 * SAS (Short Authentication String) 确认码生成器
 *
 * 生成6位数字确认码，用于配对时两端用户人工验证
 */
object SasGenerator {

    private const val SAS_CODE_LENGTH = 6
    private const val SAS_EXPIRY_MS = 5 * 60 * 1000L

    /**
     * 生成6位SAS确认码
     *
     * @return 6位数字字符串 (000000-999999)
     */
    fun generateSasCode(): String {
        val random = SecureRandom()
        val code = random.nextInt(1_000_000)
        return code.toString().padStart(SAS_CODE_LENGTH, '0')
    }

    /**
     * 从双方公钥材料生成SAS码（确定性）
     *
     * 使用两个设备的公钥派生相同的SAS码供用户比对
     *
     * @param ourPublicKey 我方公钥
     * @param theirPublicKey 对端公钥
     * @param nonce 交换时使用的nonce
     * @return 6位数字SAS码
     */
    fun generateSasFromKeyMaterial(
        ourPublicKey: ByteArray,
        theirPublicKey: ByteArray,
        nonce: ByteArray
    ): String {
        val sortedKeys = listOf(ourPublicKey, theirPublicKey)
            .sortedWith(compareBy({ it.size }, { it.contentToString() }))

        val combined = sortedKeys[0] + sortedKeys[1] + nonce
        val hash = HashUtils.sha256(combined)

        val code = ((hash[0].toLong() and 0xFF) shl 16 or
                ((hash[1].toLong() and 0xFF) shl 8) or
                (hash[2].toLong() and 0xFF)) % 1_000_000

        return code.toString().padStart(SAS_CODE_LENGTH, '0')
    }

    /**
     * 格式化SAS码为展示格式 (xxx-xxx)
     *
     * @param sasCode 6位SAS码
     * @return 格式化后的字符串
     */
    fun formatSas(sasCode: String): String {
        require(sasCode.length == SAS_CODE_LENGTH) { "SAS code must be 6 digits" }
        return "${sasCode.substring(0, 3)}-${sasCode.substring(3)}"
    }

    /**
     * 验证两个SAS码是否匹配
     *
     * @param sas1 第一个SAS码
     * @param sas2 第二个SAS码
     * @return 是否匹配
     */
    fun match(sas1: String, sas2: String): Boolean {
        val normalized1 = sas1.replace("-", "").trim()
        val normalized2 = sas2.replace("-", "").trim()
        return normalized1 == normalized2 && normalized1.length == SAS_CODE_LENGTH
    }

    /**
     * 获取SAS过期时间戳
     *
     * @param currentTimeMs 当前时间 (Unix毫秒)
     * @return 过期时间戳 (Unix毫秒)
     */
    fun getExpiryTime(currentTimeMs: Long = System.currentTimeMillis()): Long {
        return currentTimeMs + SAS_EXPIRY_MS
    }

    /**
     * 检查SAS是否已过期
     *
     * @param expiryTimeMs 过期时间戳
     * @param currentTimeMs 当前时间戳
     * @return 是否已过期
     */
    fun isExpired(expiryTimeMs: Long, currentTimeMs: Long = System.currentTimeMillis()): Boolean {
        return currentTimeMs > expiryTimeMs
    }
}
