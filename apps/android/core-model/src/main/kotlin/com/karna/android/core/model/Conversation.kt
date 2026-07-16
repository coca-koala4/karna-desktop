package com.karna.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 对话信息
 *
 * @property conversationId 对话唯一ID
 * @property title 对话标题
 * @property messages 消息列表
 * @property tokenUsage Token使用统计
 * @property createdAt 创建时间 (ISO 8601)
 * @property updatedAt 最后更新时间 (ISO 8601)
 */
@Serializable
data class Conversation(
    @SerialName("conversation_id") val conversationId: String,
    val title: String,
    val messages: List<Message>,
    @SerialName("token_usage") val tokenUsage: TokenUsage,
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String
)

/**
 * 对话消息
 *
 * @property messageId 消息唯一ID
 * @property role 消息角色
 * @property parts 消息内容片段
 * @property toolCalls 工具调用列表
 * @property timestamp 消息时间戳 (ISO 8601)
 */
@Serializable
data class Message(
    @SerialName("message_id") val messageId: String,
    val role: MessageRole,
    val parts: List<MessagePart>,
    @SerialName("tool_calls") val toolCalls: List<ToolCall>? = null,
    val timestamp: String
)

/**
 * 消息角色枚举
 */
@Serializable
enum class MessageRole {
    /** 系统 */
    @SerialName("system") SYSTEM,
    /** 用户 */
    @SerialName("user") USER,
    /** 助手 */
    @SerialName("assistant") ASSISTANT,
    /** 工具 */
    @SerialName("tool") TOOL
}

/**
 * 消息内容片段
 *
 * @property type 片段类型 (text/image/file)
 * @property text 文本内容
 * @property mediaUrl 媒体资源URL
 * @property mimeType MIME类型
 */
@Serializable
data class MessagePart(
    val type: String,
    val text: String? = null,
    @SerialName("media_url") val mediaUrl: String? = null,
    @SerialName("mime_type") val mimeType: String? = null
)

/**
 * 工具调用信息
 *
 * @property toolCallId 工具调用ID
 * @property toolName 工具名称
 * @property arguments 调用参数 (JSON字符串)
 */
@Serializable
data class ToolCall(
    @SerialName("tool_call_id") val toolCallId: String,
    @SerialName("tool_name") val toolName: String,
    val arguments: String
)

/**
 * Token使用统计
 *
 * @property promptTokens 提示Token数
 * @property completionTokens 完成Token数
 * @property totalTokens 总Token数
 */
@Serializable
data class TokenUsage(
    @SerialName("prompt_tokens") val promptTokens: Int,
    @SerialName("completion_tokens") val completionTokens: Int,
    @SerialName("total_tokens") val totalTokens: Int
)
