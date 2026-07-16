package com.karna.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class FilePreview(
    val type: String,
    val mimeType: String,
    val fileName: String,
    val fileSize: Long = 0,
    val totalChunks: Int = 1,
    val chunks: List<FilePreviewChunk> = emptyList(),
    val metadata: Map<String, String> = emptyMap()
)

@Serializable
data class FilePreviewChunk(
    val index: Int,
    val content: String,
    @SerialName("is_text") val isText: Boolean = true
)

@Serializable
data class FileDownloadProgress(
    val fileId: String,
    val bytesDownloaded: Long,
    val totalBytes: Long,
    val isComplete: Boolean = false
)
