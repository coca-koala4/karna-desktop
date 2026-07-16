package com.karna.android.core.preview

import android.content.Context
import android.graphics.Bitmap
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

sealed class PreviewResult {
    data object Loading : PreviewResult()
    data class MarkdownContent(val content: CharSequence, val raw: String) : PreviewResult()
    data class TextContent(val text: String, val truncated: Boolean = false, val totalLines: Int? = null) : PreviewResult()
    data class PdfPage(val bitmap: Bitmap, val pageIndex: Int, val totalPages: Int) : PreviewResult()
    data class ImageContent(val bitmap: Bitmap) : PreviewResult()
    data class JsonTree(val root: JsonTreeNode) : PreviewResult()
    data class CodeContent(val text: String, val language: String? = null) : PreviewResult()
    data class DocxHtmlContent(val html: String) : PreviewResult()
    data class DiffContent(val diff: FileVersionDiff) : PreviewResult()
    data class Unsupported(val fileName: String) : PreviewResult()
    data class Error(val message: String, val throwable: Throwable? = null) : PreviewResult()
}

@Singleton
class PreviewLoader @Inject constructor(
    @ApplicationContext private val context: Context,
    private val previewManifestParser: PreviewManifestParser,
    private val previewCache: PreviewCache,
    private val fileDownloader: FileDownloader,
    private val markdownHandler: MarkdownPreviewHandler,
    private val pdfHandler: PdfPreviewHandler,
    private val textHandler: TextPreviewHandler,
    private val imageHandler: ImagePreviewHandler,
    private val jsonHandler: JsonPreviewHandler,
    private val docxHandler: DocxPreviewHandler,
    private val diffHandler: DiffPreviewHandler
) {
    private val _previewState = MutableStateFlow<PreviewResult>(PreviewResult.Loading)
    val previewState: Flow<PreviewResult> = _previewState

    suspend fun loadPreview(
        fileId: String,
        fileName: String,
        fileUrl: String,
        mimeType: String? = null,
        page: Int = 0
    ): Flow<PreviewResult> {
        val cacheKey = "preview_${fileId}_${page}"

        val cached = previewCache.getMemory<PreviewResult>(cacheKey)
        if (cached != null) {
            _previewState.value = cached
            return previewState
        }

        _previewState.value = PreviewResult.Loading

        withContext(Dispatchers.IO) {
            try {
                val localFile = fileDownloader.getDownloadedFile(fileId, fileName)
                    ?: fileDownloader.downloadFile(fileUrl, fileId, fileName).getOrThrow()

                val previewType = previewManifestParser.determinePreviewType(fileName, mimeType)

                val result = when (previewType) {
                    PreviewType.MARKDOWN -> loadMarkdownPreview(localFile)
                    PreviewType.PDF -> loadPdfPreview(localFile, page)
                    PreviewType.DOCX -> loadDocxPreview(localFile)
                    PreviewType.DIFF -> loadDiffPreview(localFile)
                    PreviewType.TEXT -> loadTextPreview(localFile)
                    PreviewType.CODE -> loadCodePreview(localFile, fileName)
                    PreviewType.IMAGE -> loadImagePreview(localFile)
                    PreviewType.JSON -> loadJsonPreview(localFile)
                    PreviewType.UNSUPPORTED -> PreviewResult.Unsupported(fileName)
                }

                if (result !is PreviewResult.Error) {
                    previewCache.putMemory(cacheKey, result)
                }
                _previewState.value = result
            } catch (e: Exception) {
                _previewState.value = PreviewResult.Error(e.message ?: "Preview failed", e)
            }
        }

        return previewState
    }

    private fun loadMarkdownPreview(file: File): PreviewResult {
        return try {
            val raw = textHandler.loadText(file).getOrThrow()
            val rendered = markdownHandler.parse(raw)
            PreviewResult.MarkdownContent(rendered, raw)
        } catch (e: Exception) {
            PreviewResult.Error("Failed to load markdown", e)
        }
    }

    private fun loadPdfPreview(file: File, page: Int): PreviewResult {
        return try {
            val pageCount = pdfHandler.getPageCount(file).getOrThrow()
            val bitmap = pdfHandler.renderPage(file, page).getOrThrow()
            PreviewResult.PdfPage(bitmap, page, pageCount)
        } catch (e: Exception) {
            PreviewResult.Error("Failed to load PDF", e)
        }
    }

    private fun loadTextPreview(file: File): PreviewResult {
        return try {
            val totalLines = textHandler.countLines(file).getOrNull()
            val text = textHandler.loadText(file).getOrThrow()
            val truncated = totalLines != null && totalLines > 1000
            PreviewResult.TextContent(text, truncated, totalLines)
        } catch (e: Exception) {
            PreviewResult.Error("Failed to load text", e)
        }
    }

    private fun loadCodePreview(file: File, fileName: String): PreviewResult {
        return try {
            val text = textHandler.loadText(file).getOrThrow()
            val extension = fileName.substringAfterLast('.', "")
            PreviewResult.CodeContent(text, extension)
        } catch (e: Exception) {
            PreviewResult.Error("Failed to load code", e)
        }
    }

    private fun loadImagePreview(file: File): PreviewResult {
        return try {
            val bitmap = imageHandler.loadImage(file).getOrThrow()
            PreviewResult.ImageContent(bitmap)
        } catch (e: Exception) {
            PreviewResult.Error("Failed to load image", e)
        }
    }

    private fun loadJsonPreview(file: File): PreviewResult {
        return try {
            val element = jsonHandler.parseFile(file).getOrThrow()
            val tree = jsonHandler.buildTree(element)
            PreviewResult.JsonTree(tree)
        } catch (e: Exception) {
            PreviewResult.Error("Failed to load JSON", e)
        }
    }

    private fun loadDocxPreview(file: File): PreviewResult {
        return try {
            if (docxHandler.isHtmlContent(file)) {
                val html = docxHandler.loadHtmlContent(file).getOrThrow()
                PreviewResult.DocxHtmlContent(html)
            } else {
                loadPdfPreview(file, 0)
            }
        } catch (e: Exception) {
            PreviewResult.Error("Failed to load DOCX", e)
        }
    }

    private fun loadDiffPreview(file: File): PreviewResult {
        return try {
            val diff = diffHandler.parseDiff(file).getOrThrow()
            PreviewResult.DiffContent(diff)
        } catch (e: Exception) {
            PreviewResult.Error("Failed to load diff", e)
        }
    }

    suspend fun loadPdfPage(fileId: String, fileName: String, fileUrl: String, page: Int): PreviewResult {
        return try {
            val localFile = fileDownloader.getDownloadedFile(fileId, fileName)
                ?: fileDownloader.downloadFile(fileUrl, fileId, fileName).getOrThrow()

            val pageCount = pdfHandler.getPageCount(localFile).getOrThrow()
            val bitmap = pdfHandler.renderPage(localFile, page).getOrThrow()
            PreviewResult.PdfPage(bitmap, page, pageCount)
        } catch (e: Exception) {
            PreviewResult.Error("Failed to load PDF page", e)
        }
    }

    fun clearCache() {
        previewCache.clearAll()
    }

    fun invalidateCache(fileId: String) {
        previewCache.removeMemory("preview_${fileId}_0")
    }
}
