package com.karna.android.core.crypto

import java.security.MessageDigest

/**
 * 哈希工具类
 *
 * 提供SHA-256等哈希算法
 */
object HashUtils {

    private const val SHA256 = "SHA-256"

    /**
     * 计算SHA-256哈希
     *
     * @param data 输入数据
     * @return 哈希字节数组 (32字节)
     */
    fun sha256(data: ByteArray): ByteArray {
        val digest = MessageDigest.getInstance(SHA256)
        return digest.digest(data)
    }

    /**
     * 计算字符串的SHA-256哈希
     *
     * @param input 输入字符串
     * @return 十六进制哈希字符串
     */
    fun sha256Hex(input: String): String {
        val hashBytes = sha256(input.toByteArray(Charsets.UTF_8))
        return bytesToHex(hashBytes)
    }

    /**
     * 计算字节数组的SHA-256哈希并返回Base64
     *
     * @param data 输入数据
     * @return Base64编码的哈希字符串
     */
    fun sha256Base64(data: ByteArray): String {
        val hashBytes = sha256(data)
        return android.util.Base64.encodeToString(hashBytes, android.util.Base64.NO_WRAP)
    }

    /**
     * 计算文件的SHA-256哈希
     *
     * @param data 文件数据字节数组
     * @return 十六进制哈希字符串
     */
    fun fileHash(data: ByteArray): String {
        return sha256Hex(String(data, Charsets.ISO_8859_1))
    }

    /**
     * 字节数组转十六进制字符串
     *
     * @param bytes 字节数组
     * @return 十六进制字符串
     */
    fun bytesToHex(bytes: ByteArray): String {
        val hexChars = CharArray(bytes.size * 2)
        for (i in bytes.indices) {
            val v = bytes[i].toInt() and 0xFF
            hexChars[i * 2] = "0123456789abcdef"[v ushr 4]
            hexChars[i * 2 + 1] = "0123456789abcdef"[v and 0x0F]
        }
        return String(hexChars)
    }

    /**
     * 十六进制字符串转字节数组
     *
     * @param hex 十六进制字符串
     * @return 字节数组
     */
    fun hexToBytes(hex: String): ByteArray {
        require(hex.length % 2 == 0) { "Hex string must have even length" }
        return ByteArray(hex.length / 2) { i ->
            val index = i * 2
            ((hexCharToInt(hex[index]) shl 4) or hexCharToInt(hex[index + 1])).toByte()
        }
    }

    /**
     * 十六进制字符转整数
     */
    private fun hexCharToInt(c: Char): Int {
        return when (c) {
            in '0'..'9' -> c - '0'
            in 'a'..'f' -> c - 'a' + 10
            in 'A'..'F' -> c - 'A' + 10
            else -> throw IllegalArgumentException("Invalid hex character: $c")
        }
    }
}
