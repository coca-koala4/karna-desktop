package com.karna.android.core.protocol

/**
 * 协议异常基类
 *
 * @param errorCode 错误码
 * @param message 错误消息
 * @param cause 原始异常
 */
open class ProtocolException(
    val errorCode: ProtocolErrorCode,
    message: String,
    cause: Throwable? = null
) : Exception(message, cause)

/**
 * 协议错误码枚举
 */
enum class ProtocolErrorCode {
    /** 版本不兼容 */
    VERSION_MISMATCH,
    /** 签名验证失败 */
    SIGNATURE_INVALID,
    /** MAC验证失败 */
    MAC_INVALID,
    /** 消息序列号无效 */
    SEQUENCE_INVALID,
    /** 消息重放 */
    REPLAY_DETECTED,
    /** 消息过期 */
    MESSAGE_EXPIRED,
    /** 无效的消息格式 */
    INVALID_FORMAT,
    /** 不支持的命令类型 */
    UNSUPPORTED_COMMAND,
    /** 会话未建立 */
    SESSION_NOT_ESTABLISHED,
    /** 配对失败 */
    PAIRING_FAILED,
    /** SAS码不匹配 */
    SAS_MISMATCH,
    /** 密钥交换失败 */
    KEY_EXCHANGE_FAILED,
    /** 内部错误 */
    INTERNAL_ERROR
}

/**
 * 版本不兼容异常
 */
class VersionMismatchException(
    message: String = "Protocol version mismatch",
    cause: Throwable? = null
) : ProtocolException(ProtocolErrorCode.VERSION_MISMATCH, message, cause)

/**
 * 签名验证失败异常
 */
class SignatureInvalidException(
    message: String = "Signature verification failed",
    cause: Throwable? = null
) : ProtocolException(ProtocolErrorCode.SIGNATURE_INVALID, message, cause)

/**
 * MAC验证失败异常
 */
class MacInvalidException(
    message: String = "MAC verification failed",
    cause: Throwable? = null
) : ProtocolException(ProtocolErrorCode.MAC_INVALID, message, cause)

/**
 * 序列号无效异常
 */
class SequenceInvalidException(
    message: String = "Invalid sequence number",
    cause: Throwable? = null
) : ProtocolException(ProtocolErrorCode.SEQUENCE_INVALID, message, cause)

/**
 * 重放攻击检测异常
 */
class ReplayDetectedException(
    message: String = "Message replay detected",
    cause: Throwable? = null
) : ProtocolException(ProtocolErrorCode.REPLAY_DETECTED, message, cause)

/**
 * 消息过期异常
 */
class MessageExpiredException(
    message: String = "Message has expired",
    cause: Throwable? = null
) : ProtocolException(ProtocolErrorCode.MESSAGE_EXPIRED, message, cause)

/**
 * 无效消息格式异常
 */
class InvalidFormatException(
    message: String = "Invalid message format",
    cause: Throwable? = null
) : ProtocolException(ProtocolErrorCode.INVALID_FORMAT, message, cause)

/**
 * 会话未建立异常
 */
class SessionNotEstablishedException(
    message: String = "Session not established",
    cause: Throwable? = null
) : ProtocolException(ProtocolErrorCode.SESSION_NOT_ESTABLISHED, message, cause)

/**
 * 配对失败异常
 */
class PairingFailedException(
    message: String = "Pairing failed",
    cause: Throwable? = null
) : ProtocolException(ProtocolErrorCode.PAIRING_FAILED, message, cause)

/**
 * SAS码不匹配异常
 */
class SasMismatchException(
    message: String = "SAS code mismatch",
    cause: Throwable? = null
) : ProtocolException(ProtocolErrorCode.SAS_MISMATCH, message, cause)

/**
 * 密钥交换失败异常
 */
class KeyExchangeFailedException(
    message: String = "Key exchange failed",
    cause: Throwable? = null
) : ProtocolException(ProtocolErrorCode.KEY_EXCHANGE_FAILED, message, cause)
