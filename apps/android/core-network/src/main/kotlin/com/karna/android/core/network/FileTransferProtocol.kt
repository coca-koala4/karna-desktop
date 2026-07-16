package com.karna.android.core.network

import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

data class FileChunkHeader(
    val transferId: String,
    val fileId: String,
    val fileName: String,
    val mimeType: String,
    val totalSize: Long,
    val chunkSize: Int,
    val totalChunks: Int,
    val chunkIndex: Int,
    val chunkHash: String,
    val fileHash: String? = null,
    val isLastChunk: Boolean
)

data class FileChunk(
    val header: FileChunkHeader,
    val data: ByteArray
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is FileChunk) return false
        return header == other.header && data.contentEquals(other.data)
    }

    override fun hashCode(): Int {
        var result = header.hashCode()
        result = 31 * result + data.contentHashCode()
        return result
    }
}

data class TransferState(
    val transferId: String,
    val fileId: String,
    val fileName: String,
    val totalSize: Long,
    val totalChunks: Int,
    val receivedChunks: MutableSet<Int> = mutableSetOf(),
    val chunks: MutableMap<Int, ByteArray> = mutableMapOf(),
    @Volatile var status: TransferStatus = TransferStatus.IN_PROGRESS,
    val createdAt: Long = System.currentTimeMillis(),
    @Volatile var updatedAt: Long = System.currentTimeMillis()
)

enum class TransferStatus {
    PENDING,
    IN_PROGRESS,
    PAUSED,
    COMPLETED,
    FAILED,
    CANCELLED
}

data class TransferProgress(
    val transferId: String,
    val fileId: String,
    val fileName: String,
    val bytesTransferred: Long,
    val totalBytes: Long,
    val chunksReceived: Int,
    val totalChunks: Int,
    val progress: Float,
    val status: TransferStatus
)

class FileTransferProtocol(
    private val chunkSize: Int = CHUNK_SIZE,
    private val maxInMemoryChunks: Int = 100
) {
    private val activeTransfers = ConcurrentHashMap<String, TransferState>()
    private val chunkListeners = mutableListOf<(FileChunk) -> Unit>()
    private val progressListeners = mutableListOf<(TransferProgress) -> Unit>()
    private val completionListeners = mutableListOf<(TransferState, ByteArray) -> Unit>()

    fun createChunk(
        transferId: String,
        fileId: String,
        fileName: String,
        mimeType: String,
        fileData: ByteArray,
        chunkIndex: Int,
        totalChunks: Int,
        fileHash: String? = null
    ): FileChunk {
        val startPos = chunkIndex * chunkSize
        val endPos = minOf(startPos + chunkSize, fileData.size)
        val chunkData = fileData.copyOfRange(startPos, endPos)
        val chunkHash = calculateHash(chunkData)
        val isLastChunk = chunkIndex == totalChunks - 1

        return FileChunk(
            header = FileChunkHeader(
                transferId = transferId,
                fileId = fileId,
                fileName = fileName,
                mimeType = mimeType,
                totalSize = fileData.size.toLong(),
                chunkSize = chunkData.size,
                totalChunks = totalChunks,
                chunkIndex = chunkIndex,
                chunkHash = chunkHash,
                fileHash = fileHash,
                isLastChunk = isLastChunk
            ),
            data = chunkData
        )
    }

    fun splitFile(
        transferId: String,
        fileId: String,
        fileName: String,
        mimeType: String,
        fileData: ByteArray,
        fileHash: String? = null
    ): List<FileChunk> {
        val totalChunks = (fileData.size + chunkSize - 1) / chunkSize
        return (0 until totalChunks).map { index ->
            createChunk(transferId, fileId, fileName, mimeType, fileData, index, totalChunks, fileHash)
        }
    }

    @Synchronized
    fun processReceivedChunk(chunk: FileChunk): TransferProgress {
        val header = chunk.header
        val transferId = header.transferId

        var state = activeTransfers[transferId]
        if (state == null) {
            state = TransferState(
                transferId = transferId,
                fileId = header.fileId,
                fileName = header.fileName,
                totalSize = header.totalSize,
                totalChunks = header.totalChunks
            )
            activeTransfers[transferId] = state
        }

        if (state.status == TransferStatus.CANCELLED || state.status == TransferStatus.COMPLETED) {
            return createProgress(state)
        }

        if (!verifyChunkHash(chunk)) {
            state.status = TransferStatus.FAILED
            notifyProgress(createProgress(state))
            return createProgress(state)
        }

        if (!state.receivedChunks.contains(header.chunkIndex)) {
            state.receivedChunks.add(header.chunkIndex)

            if (state.chunks.size < maxInMemoryChunks) {
                state.chunks[header.chunkIndex] = chunk.data
            }

            state.updatedAt = System.currentTimeMillis()
            chunkListeners.forEach { it(chunk) }
        }

        if (state.receivedChunks.size == state.totalChunks) {
            state.status = TransferStatus.COMPLETED
            val assembledData = assembleFile(transferId)
            if (assembledData != null) {
                state.chunks.clear()
                completionListeners.forEach { it(state, assembledData) }
            } else {
                state.status = TransferStatus.FAILED
            }
        }

        val progress = createProgress(state)
        notifyProgress(progress)
        return progress
    }

    fun pauseTransfer(transferId: String) {
        activeTransfers[transferId]?.status = TransferStatus.PAUSED
    }

    fun resumeTransfer(transferId: String) {
        activeTransfers[transferId]?.status = TransferStatus.IN_PROGRESS
    }

    fun cancelTransfer(transferId: String) {
        val state = activeTransfers.remove(transferId)
        state?.status = TransferStatus.CANCELLED
    }

    fun getMissingChunks(transferId: String): List<Int> {
        val state = activeTransfers[transferId] ?: return emptyList()
        return (0 until state.totalChunks).filter { it !in state.receivedChunks }
    }

    fun getTransferState(transferId: String): TransferState? {
        return activeTransfers[transferId]
    }

    @Synchronized
    fun assembleFile(transferId: String): ByteArray? {
        val state = activeTransfers[transferId] ?: return null
        if (state.receivedChunks.size != state.totalChunks) return null

        val output = ByteArray(state.totalSize.toInt())
        var offset = 0
        for (i in 0 until state.totalChunks) {
            val chunk = state.chunks[i] ?: return null
            System.arraycopy(chunk, 0, output, offset, chunk.size)
            offset += chunk.size
        }
        return output
    }

    fun addChunkListener(listener: (FileChunk) -> Unit) {
        chunkListeners.add(listener)
    }

    fun addProgressListener(listener: (TransferProgress) -> Unit) {
        progressListeners.add(listener)
    }

    fun addCompletionListener(listener: (TransferState, ByteArray) -> Unit) {
        completionListeners.add(listener)
    }

    fun removeListeners() {
        chunkListeners.clear()
        progressListeners.clear()
        completionListeners.clear()
    }

    fun cleanup(maxAgeMs: Long = 300000) {
        val now = System.currentTimeMillis()
        activeTransfers.entries.removeIf { (_, state) ->
            now - state.updatedAt > maxAgeMs || state.status == TransferStatus.COMPLETED || state.status == TransferStatus.CANCELLED
        }
    }

    private fun verifyChunkHash(chunk: FileChunk): Boolean {
        val calculated = calculateHash(chunk.data)
        return calculated == chunk.header.chunkHash
    }

    private fun calculateHash(data: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(data)
        return hashBytes.joinToString("") { "%02x".format(it) }
    }

    private fun createProgress(state: TransferState): TransferProgress {
        val bytesTransferred = state.chunks.values.sumOf { it.size.toLong() }
        return TransferProgress(
            transferId = state.transferId,
            fileId = state.fileId,
            fileName = state.fileName,
            bytesTransferred = bytesTransferred,
            totalBytes = state.totalSize,
            chunksReceived = state.receivedChunks.size,
            totalChunks = state.totalChunks,
            progress = if (state.totalSize > 0) bytesTransferred.toFloat() / state.totalSize.toFloat() else 0f,
            status = state.status
        )
    }

    private fun notifyProgress(progress: TransferProgress) {
        progressListeners.forEach { it(progress) }
    }

    companion object {
        const val CHUNK_SIZE = 256 * 1024
    }
}
