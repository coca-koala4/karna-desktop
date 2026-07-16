package com.karna.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 网络连接状态枚举
 */
@Serializable
enum class ConnectionState {
    /** 未配对 */
    @SerialName("unpaired") UNPAIRED,
    /** 正在配对 */
    @SerialName("pairing") PAIRING,
    /** 正在认证 */
    @SerialName("authenticating") AUTHENTICATING,
    /** 已连接 (局域网) */
    @SerialName("connected_lan") CONNECTED_LAN,
    /** 已连接 (P2P直连) */
    @SerialName("connected_peer") CONNECTED_PEER,
    /** 已连接 (中继服务器) */
    @SerialName("connected_relay") CONNECTED_RELAY,
    /** 连接降级 */
    @SerialName("degraded") DEGRADED,
    /** 正在重连 */
    @SerialName("reconnecting") RECONNECTING,
    /** 连接已撤销 */
    @SerialName("revoked") REVOKED,
    /** 协议不兼容 */
    @SerialName("protocol_incompatible") PROTOCOL_INCOMPATIBLE
}

/**
 * WebSocket连接状态枚举
 */
enum class WebSocketState {
    CONNECTED,
    CONNECTING,
    DISCONNECTED,
    FAILED,
    RECONNECTING,
    CLOSED
}

/**
 * 流式响应状态枚举
 */
enum class StreamingState {
    IDLE,
    STREAMING,
    INTERRUPTED
}
