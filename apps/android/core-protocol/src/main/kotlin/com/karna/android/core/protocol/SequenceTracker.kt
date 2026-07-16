package com.karna.android.core.protocol

import java.util.Collections
import java.util.LinkedList
import java.util.concurrent.ConcurrentHashMap

/**
 * 消息序列号追踪器
 *
 * 负责追踪消息序列号，防止重放攻击，保证消息有序性
 */
class SequenceTracker(
    private val windowSize: Int = DEFAULT_WINDOW_SIZE,
    private val maxAgeMs: Long = DEFAULT_MAX_AGE_MS
) {

    private val peerSequences = ConcurrentHashMap<String, PeerSequenceState>()

    /**
     * 对端序列号状态
     */
    private data class PeerSequenceState(
        var lastSequence: Long = 0,
        val recentSequences: LinkedList<RecentMessage> = LinkedList()
    )

    /**
     * 最近消息记录
     */
    private data class RecentMessage(
        val sequence: Long,
        val timestampMs: Long
    )

    companion object {
        private const val DEFAULT_WINDOW_SIZE = 100
        private const val DEFAULT_MAX_AGE_MS = 5 * 60 * 1000L
    }

    /**
     * 获取并递增下一个发送序列号
     *
     * @param peerId 对端设备ID
     * @return 下一个序列号
     */
    @Synchronized
    fun nextSendSequence(peerId: String): Long {
        val state = peerSequences.getOrPut(peerId) { PeerSequenceState() }
        state.lastSequence += 1
        return state.lastSequence
    }

    /**
     * 验证接收到的消息序列号
     *
     * @param peerId 对端设备ID
     * @param sequence 接收到的序列号
     * @param timestampMs 消息时间戳
     * @return 验证是否通过
     * @throws SequenceInvalidException 序列号无效
     * @throws ReplayDetectedException 检测到重放
     * @throws MessageExpiredException 消息过期
     */
    @Synchronized
    @Throws(ProtocolException::class)
    fun validateIncomingSequence(peerId: String, sequence: Long, timestampMs: Long) {
        val state = peerSequences.getOrPut(peerId) { PeerSequenceState() }

        val now = System.currentTimeMillis()
        if (timestampMs < now - maxAgeMs || timestampMs > now + 30_000L) {
            throw MessageExpiredException()
        }

        if (sequence <= 0) {
            throw SequenceInvalidException("Sequence number must be positive")
        }

        if (sequence <= state.lastSequence - windowSize) {
            throw SequenceInvalidException("Sequence number too old")
        }

        val iterator = state.recentSequences.iterator()
        while (iterator.hasNext()) {
            val msg = iterator.next()
            if (now - msg.timestampMs > maxAgeMs) {
                iterator.remove()
            } else if (msg.sequence == sequence) {
                throw ReplayDetectedException()
            }
        }

        if (sequence > state.lastSequence) {
            state.lastSequence = sequence
        }

        state.recentSequences.add(RecentMessage(sequence, timestampMs))
        if (state.recentSequences.size > windowSize) {
            state.recentSequences.removeFirst()
        }
    }

    /**
     * 获取对端最后接收的序列号
     *
     * @param peerId 对端设备ID
     * @return 最后序列号，无记录返回0
     */
    fun getLastSequence(peerId: String): Long {
        return peerSequences[peerId]?.lastSequence ?: 0L
    }

    /**
     * 重置对端序列号状态
     *
     * @param peerId 对端设备ID
     */
    fun resetPeer(peerId: String) {
        peerSequences.remove(peerId)
    }

    /**
     * 重置所有状态
     */
    fun resetAll() {
        peerSequences.clear()
    }
}
