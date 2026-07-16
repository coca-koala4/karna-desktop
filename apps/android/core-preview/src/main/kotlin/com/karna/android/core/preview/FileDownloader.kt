package com.karna.android.core.preview

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.RandomAccessFile
import javax.inject.Inject
import javax.inject.Singleton

sealed class DownloadProgress {
    data object NotStarted : DownloadProgress()
    data class Downloading(val downloaded: Long, val total: Long, val percentage: Int) : DownloadProgress()
    data class Completed(val file: File) : DownloadProgress()
    data class Error(val message: String, val throwable: Throwable? = null) : DownloadProgress()
}

@Singleton
class FileDownloader @Inject constructor(
    @ApplicationContext private val context: Context,
    private val okHttpClient: OkHttpClient,
    private val previewCache: PreviewCache
) {
    private val downloadDir: File by lazy {
        File(context.filesDir, "downloads").apply {
            if (!exists()) mkdirs()
        }
    }

    private val activeDownloads = mutableMapOf<String, MutableStateFlow<DownloadProgress>>()

    fun getDownloadProgress(fileId: String): Flow<DownloadProgress> {
        return activeDownloads.getOrPut(fileId) {
            MutableStateFlow(DownloadProgress.NotStarted)
        }
    }

    suspend fun downloadFile(
        url: String,
        fileId: String,
        fileName: String,
        chunkSize: Long = DEFAULT_CHUNK_SIZE
    ): Result<File> = withContext(Dispatchers.IO) {
        runCatching {
            val outputFile = File(downloadDir, "${fileId}_${fileName}")
            val progressFlow = activeDownloads.getOrPut(fileId) {
                MutableStateFlow(DownloadProgress.NotStarted)
            }

            val existingLength = if (outputFile.exists()) outputFile.length() else 0L

            val request = Request.Builder()
                .url(url)
                .apply {
                    if (existingLength > 0) {
                        header("Range", "bytes=$existingLength-")
                    }
                }
                .build()

            okHttpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful && response.code != 206) {
                    val error = Exception("Download failed: HTTP ${response.code}")
                    progressFlow.value = DownloadProgress.Error(error.message ?: "Download failed", error)
                    throw error
                }

                val body = response.body ?: throw Exception("Empty response body")
                val totalBytes = body.contentLength() + existingLength
                var downloadedBytes = existingLength

                val isResuming = response.code == 206
                val raf = RandomAccessFile(outputFile, "rw")
                if (isResuming) {
                    raf.seek(existingLength)
                } else {
                    raf.setLength(0)
                }

                body.byteStream().use { input ->
                    val buffer = ByteArray(BUFFER_SIZE)
                    var bytesRead: Int
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        raf.write(buffer, 0, bytesRead)
                        downloadedBytes += bytesRead
                        val percentage = ((downloadedBytes * 100) / totalBytes).toInt()
                        progressFlow.value = DownloadProgress.Downloading(downloadedBytes, totalBytes, percentage)
                    }
                }
                raf.close()

                progressFlow.value = DownloadProgress.Completed(outputFile)
                outputFile
            }
        }
    }

    suspend fun downloadChunk(
        url: String,
        chunkIndex: Int,
        chunkSize: Long
    ): Result<ByteArray> = withContext(Dispatchers.IO) {
        runCatching {
            val start = chunkIndex * chunkSize
            val end = start + chunkSize - 1

            val request = Request.Builder()
                .url(url)
                .header("Range", "bytes=$start-$end")
                .build()

            okHttpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful && response.code != 206) {
                    throw Exception("Chunk download failed: HTTP ${response.code}")
                }
                response.body?.bytes() ?: throw Exception("Empty response body")
            }
        }
    }

    fun getDownloadedFile(fileId: String, fileName: String): File? {
        val file = File(downloadDir, "${fileId}_${fileName}")
        return if (file.exists()) file else null
    }

    fun deleteDownloadedFile(fileId: String, fileName: String) {
        File(downloadDir, "${fileId}_${fileName}").delete()
        activeDownloads.remove(fileId)
    }

    fun cancelDownload(fileId: String) {
        activeDownloads[fileId]?.value = DownloadProgress.Error("Download cancelled")
        activeDownloads.remove(fileId)
    }

    companion object {
        private const val DEFAULT_CHUNK_SIZE = 256 * 1024L
        private const val BUFFER_SIZE = 8 * 1024
    }
}
