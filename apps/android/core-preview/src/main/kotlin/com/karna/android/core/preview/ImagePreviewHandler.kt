package com.karna.android.core.preview

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ImagePreviewHandler @Inject constructor(
    @ApplicationContext private val context: Context,
    private val previewCache: PreviewCache
) {
    companion object {
        private const val MAX_DIMENSION = 2048
        private const val MAX_PREVIEW_SIZE = 2 * 1024 * 1024
    }

    fun loadImage(file: File, maxWidth: Int = MAX_DIMENSION, maxHeight: Int = MAX_DIMENSION): Result<Bitmap> {
        val cacheKey = "img_${file.absolutePath}_${maxWidth}x${maxHeight}"
        previewCache.getMemory<Bitmap>(cacheKey)?.let {
            return Result.success(it)
        }

        return runCatching {
            val options = BitmapFactory.Options()
            options.inJustDecodeBounds = true
            BitmapFactory.decodeFile(file.absolutePath, options)

            options.inSampleSize = calculateInSampleSize(options.outWidth, options.outHeight, maxWidth, maxHeight)
            options.inJustDecodeBounds = false

            val bitmap = BitmapFactory.decodeFile(file.absolutePath, options)
                ?: throw IllegalStateException("Failed to decode image")

            previewCache.putMemory(cacheKey, bitmap)
            bitmap
        }
    }

    private fun calculateInSampleSize(width: Int, height: Int, reqWidth: Int, reqHeight: Int): Int {
        var inSampleSize = 1
        if (height > reqHeight || width > reqWidth) {
            val halfHeight = height / 2
            val halfWidth = width / 2
            while (halfHeight / inSampleSize >= reqHeight && halfWidth / inSampleSize >= reqWidth) {
                inSampleSize *= 2
            }
        }
        return inSampleSize
    }

    fun getImageDimensions(file: File): Result<Pair<Int, Int>> {
        return runCatching {
            val options = BitmapFactory.Options()
            options.inJustDecodeBounds = true
            BitmapFactory.decodeFile(file.absolutePath, options)
            Pair(options.outWidth, options.outHeight)
        }
    }
}
