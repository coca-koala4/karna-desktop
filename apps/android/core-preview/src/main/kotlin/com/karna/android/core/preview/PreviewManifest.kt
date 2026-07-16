package com.karna.android.core.preview

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class PreviewManifest(
    @SerialName("file_id") val fileId: String,
    @SerialName("file_name") val fileName: String,
    @SerialName("file_size") val fileSize: Long,
    @SerialName("mime_type") val mimeType: String,
    @SerialName("preview_available") val previewAvailable: Boolean = true,
    @SerialName("preview_type") val previewType: PreviewType,
    @SerialName("total_chunks") val totalChunks: Int = 1,
    @SerialName("chunk_size") val chunkSize: Long = 0,
    @SerialName("metadata") val metadata: PreviewMetadata? = null
)

@Serializable
enum class PreviewType {
    @SerialName("markdown") MARKDOWN,
    @SerialName("pdf") PDF,
    @SerialName("docx") DOCX,
    @SerialName("diff") DIFF,
    @SerialName("text") TEXT,
    @SerialName("image") IMAGE,
    @SerialName("json") JSON,
    @SerialName("code") CODE,
    @SerialName("unsupported") UNSUPPORTED
}

@Serializable
data class PreviewMetadata(
    val lines: Int? = null,
    val width: Int? = null,
    val height: Int? = null,
    val pages: Int? = null,
    val language: String? = null,
    val encoding: String? = null
)

@Singleton
class PreviewManifestParser @Inject constructor(
    private val json: Json
) {
    fun parse(manifestJson: String): Result<PreviewManifest> {
        return runCatching {
            json.decodeFromString<PreviewManifest>(manifestJson)
        }
    }

    fun determinePreviewType(fileName: String, mimeType: String?): PreviewType {
        val extension = fileName.substringAfterLast('.', "").lowercase()
        return when {
            extension in listOf("md", "markdown") -> PreviewType.MARKDOWN
            extension == "pdf" -> PreviewType.PDF
            extension in listOf("docx", "doc") -> PreviewType.DOCX
            extension == "diff" || extension == "patch" -> PreviewType.DIFF
            extension in listOf("jpg", "jpeg", "png", "gif", "webp", "bmp", "svg") -> PreviewType.IMAGE
            extension == "json" -> PreviewType.JSON
            extension in listOf("txt", "log", "csv", "xml", "yml", "yaml", "toml", "ini", "conf") -> PreviewType.TEXT
            extension in listOf("kt", "kts", "java", "swift", "js", "ts", "tsx", "jsx", "py", "go", "rs", "c", "cpp", "h", "hpp", "cs", "rb", "php", "sh", "bash", "zsh", "fish") -> PreviewType.CODE
            mimeType?.startsWith("image/") == true -> PreviewType.IMAGE
            mimeType == "application/pdf" -> PreviewType.PDF
            mimeType == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" -> PreviewType.DOCX
            mimeType?.startsWith("text/") == true -> PreviewType.TEXT
            mimeType == "application/json" -> PreviewType.JSON
            else -> PreviewType.UNSUPPORTED
        }
    }
}
