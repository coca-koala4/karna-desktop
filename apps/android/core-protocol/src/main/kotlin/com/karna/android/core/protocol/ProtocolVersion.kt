package com.karna.android.core.protocol

/**
 * 协议版本信息
 *
 * 用于配对握手时的版本兼容性检查
 */
object ProtocolVersion {
    /**
     * 主版本号
     *
     * 不兼容的协议变更时递增
     */
    const val MAJOR: Int = 1

    /**
     * 次版本号
     *
     * 向后兼容的功能新增时递增
     */
    const val MINOR: Int = 0

    /**
     * 完整版本字符串
     */
    const val VERSION_STRING: String = "$MAJOR.$MINOR"

    /**
     * 检查远端版本是否兼容
     *
     * @param remoteMajor 远端主版本号
     * @param remoteMinor 远端次版本号
     * @return 是否兼容
     */
    fun isCompatible(remoteMajor: Int, remoteMinor: Int): Boolean {
        if (remoteMajor != MAJOR) return false
        return remoteMinor >= MINOR
    }

    /**
     * 检查远端版本字符串是否兼容
     *
     * @param versionString 版本字符串，格式 "major.minor"
     * @return 是否兼容
     */
    fun isCompatible(versionString: String): Boolean {
        return try {
            val parts = versionString.split(".")
            if (parts.size != 2) return false
            val remoteMajor = parts[0].toInt()
            val remoteMinor = parts[1].toInt()
            isCompatible(remoteMajor, remoteMinor)
        } catch (e: NumberFormatException) {
            false
        }
    }
}
