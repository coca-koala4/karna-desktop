package com.karna.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 配对提议V1版本
 *
 * 桌面端发起配对时发送的握手消息
 *
 * @property schemaVersion 协议版本号
 * @property desktopDevice 桌面端设备信息
 * @property nonce 随机数，用于防止重放攻击
 * @property timestamp 发起时间戳 (Unix毫秒)
 * @property signature 桌面端对消息的签名
 */
@Serializable
data class PairingOfferV1(
    @SerialName("schema_version") val schemaVersion: Int,
    @SerialName("desktop_device") val desktopDevice: DesktopDevice,
    val nonce: String,
    val timestamp: Long,
    val signature: String
)

/**
 * 配对状态枚举
 */
@Serializable
enum class PairingState {
    /** 空闲，未开始配对 */
    @SerialName("idle") IDLE,
    /** 正在扫描/发现设备 */
    @SerialName("scanning") SCANNING,
    /** 已收到配对提议 */
    @SerialName("offer_received") OFFER_RECEIVED,
    /** 等待SAS码确认 */
    @SerialName("awaiting_sas") AWAITING_SAS,
    /** SAS码已确认，正在交换密钥 */
    @SerialName("exchanging_keys") EXCHANGING_KEYS,
    /** 配对成功 */
    @SerialName("completed") COMPLETED,
    /** 配对失败 */
    @SerialName("failed") FAILED,
    /** 配对超时 */
    @SerialName("timeout") TIMEOUT,
    /** 配对已取消 */
    @SerialName("cancelled") CANCELLED
}

/**
 * SAS确认码信息
 *
 * 用于两端用户人工核对配对的安全性
 *
 * @property sasCode 6位数字确认码
 * @property confirmed 是否已经由用户确认
 * @property expiresAt 过期时间戳 (Unix毫秒)
 */
@Serializable
data class SasConfirmation(
    @SerialName("sas_code") val sasCode: String,
    val confirmed: Boolean = false,
    @SerialName("expires_at") val expiresAt: Long
)
