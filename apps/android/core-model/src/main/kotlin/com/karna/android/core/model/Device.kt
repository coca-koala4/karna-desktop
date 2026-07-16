package com.karna.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 桌面端设备信息
 *
 * @property deviceId 设备唯一标识符
 * @property deviceName 用户设置的设备名称
 * @property osName 操作系统名称 (Windows/macOS/Linux)
 * @property osVersion 操作系统版本
 * @property appVersion Karna应用版本
 * @property capabilities 设备支持的功能列表
 * @property publicKey 设备公钥 (P-256)
 * @property lastSeen 最后在线时间 (ISO 8601)
 */
@Serializable
data class DesktopDevice(
    @SerialName("device_id") val deviceId: String,
    @SerialName("device_name") val deviceName: String,
    @SerialName("os_name") val osName: String,
    @SerialName("os_version") val osVersion: String,
    @SerialName("app_version") val appVersion: String,
    val capabilities: List<DeviceCapability>,
    @SerialName("public_key") val publicKey: String,
    @SerialName("last_seen") val lastSeen: String? = null
)

/**
 * 移动端设备信息
 *
 * @property deviceId 设备唯一标识符
 * @property deviceName 设备型号名称
 * @property osName 操作系统名称 (Android/iOS)
 * @property osVersion 操作系统版本
 * @property appVersion Karna应用版本
 * @property publicKey 设备公钥 (P-256)
 */
@Serializable
data class MobileDeviceInfo(
    @SerialName("device_id") val deviceId: String,
    @SerialName("device_name") val deviceName: String,
    @SerialName("os_name") val osName: String,
    @SerialName("os_version") val osVersion: String,
    @SerialName("app_version") val appVersion: String,
    @SerialName("public_key") val publicKey: String
)

/**
 * 设备功能枚举
 */
@Serializable
enum class DeviceCapability {
    /** 文件传输 */
    @SerialName("file_transfer") FILE_TRANSFER,
    /** 终端控制 */
    @SerialName("terminal") TERMINAL,
    /** 屏幕镜像 */
    @SerialName("screen_mirror") SCREEN_MIRROR,
    /** 通知同步 */
    @SerialName("notifications") NOTIFICATIONS,
    /** 剪贴板同步 */
    @SerialName("clipboard") CLIPBOARD,
    /** AI工作流执行 */
    @SerialName("workflow") WORKFLOW,
    /** 语音输入 */
    @SerialName("voice") VOICE
}

/**
 * 设备权限枚举
 */
@Serializable
enum class DevicePermission {
    /** 已授权 */
    @SerialName("granted") GRANTED,
    /** 已拒绝 */
    @SerialName("denied") DENIED,
    /** 未确定 */
    @SerialName("undetermined") UNDETERMINED
}
