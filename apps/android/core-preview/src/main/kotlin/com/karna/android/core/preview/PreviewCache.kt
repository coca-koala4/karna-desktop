package com.karna.android.core.preview

import android.content.Context
import android.graphics.Bitmap
import android.util.LruCache
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PreviewCache @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val maxMemory = (Runtime.getRuntime().maxMemory() / 1024).toInt()
    private val memoryCacheSize = maxMemory / 8

    private val memoryCache = object : LruCache<String, Any>(memoryCacheSize) {
        override fun sizeOf(key: String, value: Any): Int {
            return when (value) {
                is Bitmap -> value.byteCount / 1024
                is String -> value.length * 2 / 1024
                is ByteArray -> value.size / 1024
                else -> 1
            }
        }
    }

    private val cacheDir: File by lazy {
        File(context.cacheDir, "preview_cache").apply {
            if (!exists()) mkdirs()
        }
    }

    fun putMemory(key: String, value: Any) {
        synchronized(memoryCache) {
            if (getMemory<Any>(key) == null) {
                memoryCache.put(key, value)
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    fun <T> getMemory(key: String): T? {
        synchronized(memoryCache) {
            return memoryCache.get(key) as? T
        }
    }

    fun removeMemory(key: String) {
        synchronized(memoryCache) {
            memoryCache.remove(key)
        }
    }

    fun putDisk(key: String, data: ByteArray): File {
        val file = getDiskFile(key)
        file.writeBytes(data)
        return file
    }

    fun putDisk(key: String, text: String): File {
        val file = getDiskFile(key)
        file.writeText(text)
        return file
    }

    fun getDisk(key: String): File? {
        val file = getDiskFile(key)
        return if (file.exists()) file else null
    }

    fun getDiskBytes(key: String): ByteArray? {
        return getDisk(key)?.readBytes()
    }

    fun getDiskText(key: String): String? {
        return getDisk(key)?.readText()
    }

    fun removeDisk(key: String) {
        getDiskFile(key).delete()
    }

    fun getDiskFile(key: String): File {
        val sanitizedKey = key.replace(Regex("[^a-zA-Z0-9_-]"), "_")
        return File(cacheDir, sanitizedKey)
    }

    fun clearMemory() {
        synchronized(memoryCache) {
            memoryCache.evictAll()
        }
    }

    fun clearDisk() {
        cacheDir.listFiles()?.forEach { it.delete() }
    }

    fun clearAll() {
        clearMemory()
        clearDisk()
    }

    fun trimMemory(level: Int) {
        if (level >= android.content.ComponentCallbacks2.TRIM_MEMORY_MODERATE) {
            clearMemory()
        } else if (level >= android.content.ComponentCallbacks2.TRIM_MEMORY_BACKGROUND) {
            synchronized(memoryCache) {
                memoryCache.trimToSize(memoryCacheSize / 2)
            }
        }
    }
}
