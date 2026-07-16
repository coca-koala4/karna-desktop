package com.karna.android.core.preview

import android.content.Context
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PdfPreviewHandler @Inject constructor(
    @ApplicationContext private val context: Context,
    private val previewCache: PreviewCache
) {
    class PdfDocument(
        private val fileDescriptor: ParcelFileDescriptor,
        private val renderer: PdfRenderer
    ) {
        val pageCount: Int get() = renderer.pageCount

        fun openPage(pageIndex: Int): PdfRenderer.Page {
            return renderer.openPage(pageIndex)
        }

        fun close() {
            renderer.close()
            fileDescriptor.close()
        }
    }

    fun openDocument(file: File): Result<PdfDocument> {
        return runCatching {
            val fileDescriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
            val renderer = PdfRenderer(fileDescriptor)
            PdfDocument(fileDescriptor, renderer)
        }
    }

    fun renderPage(
        document: PdfDocument,
        pageIndex: Int,
        cacheKey: String,
        width: Int? = null,
        height: Int? = null
    ): Result<Bitmap> {
        previewCache.getMemory<Bitmap>(cacheKey)?.let {
            return Result.success(it)
        }

        return runCatching {
            val page = document.openPage(pageIndex)
            val pageWidth = width ?: (page.width * 2)
            val pageHeight = height ?: (page.height * 2)

            val bitmap = Bitmap.createBitmap(pageWidth, pageHeight, Bitmap.Config.ARGB_8888)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            page.close()

            previewCache.putMemory(cacheKey, bitmap)
            bitmap
        }
    }

    fun renderPage(
        file: File,
        pageIndex: Int,
        width: Int? = null,
        height: Int? = null
    ): Result<Bitmap> {
        val cacheKey = "pdf_page_${file.absolutePath}_${pageIndex}_${width}_${height}"
        return openDocument(file).fold(
            onSuccess = { doc ->
                try {
                    renderPage(doc, pageIndex, cacheKey, width, height)
                } finally {
                    doc.close()
                }
            },
            onFailure = { Result.failure(it) }
        )
    }

    fun getPageCount(file: File): Result<Int> {
        return openDocument(file).fold(
            onSuccess = { doc ->
                val count = doc.pageCount
                doc.close()
                Result.success(count)
            },
            onFailure = { Result.failure(it) }
        )
    }
}
