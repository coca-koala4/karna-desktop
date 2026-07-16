package com.karna.android.core.crypto

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * HKDF-SHA256密钥派生工具
 *
 * 实现RFC 5869定义的HKDF密钥派生函数，用于从共享密钥派生会话密钥
 */
object KeyDerivation {

    private const val HMAC_ALGORITHM = "HmacSHA256"
    private const val HASH_LEN = 32

    /**
     * HKDF-SHA256密钥派生
     *
     * @param ikm 输入密钥材料 (Input Keying Material)
     * @param salt 可选盐值
     * @param info 上下文信息
     * @param outputLength 输出密钥长度 (字节)
     * @return 派生的密钥
     */
    fun deriveKey(
        ikm: ByteArray,
        salt: ByteArray? = null,
        info: ByteArray? = null,
        outputLength: Int
    ): ByteArray {
        val prk = extract(ikm, salt)
        return expand(prk, info, outputLength)
    }

    /**
     * 派生会话密钥
     *
     * 从ECDH共享密钥派生加密密钥和MAC密钥
     *
     * @param sharedSecret ECDH共享密钥
     * @param salt 盐值（通常是双方公钥的组合哈希）
     * @return 密钥对：(加密密钥, MAC密钥)
     */
    fun deriveSessionKeys(sharedSecret: ByteArray, salt: ByteArray): SessionKeys {
        val encKey = deriveKey(
            ikm = sharedSecret,
            salt = salt,
            info = "karna-enc".toByteArray(Charsets.UTF_8),
            outputLength = 32
        )
        val macKey = deriveKey(
            ikm = sharedSecret,
            salt = salt,
            info = "karna-mac".toByteArray(Charsets.UTF_8),
            outputLength = 32
        )
        return SessionKeys(encKey = encKey, macKey = macKey)
    }

    /**
     * HKDF-Extract阶段
     */
    private fun extract(ikm: ByteArray, salt: ByteArray?): ByteArray {
        val actualSalt = salt ?: ByteArray(HASH_LEN)
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(SecretKeySpec(actualSalt, HMAC_ALGORITHM))
        return mac.doFinal(ikm)
    }

    /**
     * HKDF-Expand阶段
     */
    private fun expand(prk: ByteArray, info: ByteArray?, outputLength: Int): ByteArray {
        require(outputLength <= 255 * HASH_LEN) {
            "Output length too long, max is ${255 * HASH_LEN} bytes"
        }

        val actualInfo = info ?: ByteArray(0)
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(SecretKeySpec(prk, HMAC_ALGORITHM))

        val n = if (outputLength % HASH_LEN == 0) {
            outputLength / HASH_LEN
        } else {
            outputLength / HASH_LEN + 1
        }

        val t = ArrayList<ByteArray>(n)
        var tPrev = ByteArray(0)

        for (i in 1..n) {
            mac.update(tPrev)
            mac.update(actualInfo)
            mac.update(i.toByte())
            tPrev = mac.doFinal()
            t.add(tPrev)
        }

        val okm = ByteArray(outputLength)
        var offset = 0
        for (block in t) {
            val toCopy = minOf(block.size, outputLength - offset)
            System.arraycopy(block, 0, okm, offset, toCopy)
            offset += toCopy
            if (offset >= outputLength) break
        }

        return okm
    }
}

/**
 * 会话密钥对
 *
 * @property encKey AES-256加密密钥
 * @property macKey HMAC-SHA256 MAC密钥
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

    /**
     * 清除密钥数据
     */
    fun clear() {
        encKey.fill(0)
        macKey.fill(0)
    }
}
