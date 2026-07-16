package com.karna.android.core.preview

import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.nio.charset.Charset
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TextPreviewHandler @Inject constructor() {
    companion object {
        private const val MAX_PREVIEW_LINES = 1000
        private const val MAX_FILE_SIZE = 5L * 1024 * 1024
        private const val CHUNK_SIZE = 64 * 1024
    }

    fun loadText(file: File, maxLines: Int = MAX_PREVIEW_LINES, maxSize: Long = MAX_FILE_SIZE): Result<String> {
        return runCatching {
            if (file.length() > maxSize) {
                return loadLargeFilePreview(file, maxLines, maxSize)
            }

            file.bufferedReader().use { reader ->
                buildString {
                    var lineCount = 0
                    var line: String? = reader.readLine()
                    while (line != null && lineCount < maxLines) {
                        append(line)
                        append('\n')
                        lineCount++
                        line = reader.readLine()
                    }
                    if (line != null) {
                        append("\n... (file truncated after $maxLines lines)")
                    }
                }
            }
        }
    }

    private fun loadLargeFilePreview(file: File, maxLines: Int, maxSize: Long): Result<String> {
        return runCatching {
            file.inputStream().use { input ->
                val buffer = ByteArray(CHUNK_SIZE)
                var totalRead = 0
                val sb = StringBuilder()
                var lineCount = 0
                var currentLine = StringBuilder()

                while (totalRead < maxSize) {
                    val bytesToRead = minOf(CHUNK_SIZE.toLong(), maxSize - totalRead).toInt()
                    val read = input.read(buffer, 0, bytesToRead)
                    if (read == -1) break

                    for (i in 0 until read) {
                        val char = buffer[i].toInt().toChar()
                        when (char) {
                            '\n' -> {
                                sb.append(currentLine)
                                sb.append('\n')
                                currentLine = StringBuilder()
                                lineCount++
                                if (lineCount >= maxLines) {
                                    sb.append("\n... (file truncated after $maxLines lines)")
                                    return@use sb.toString()
                                }
                            }
                            '\r' -> {}
                            else -> currentLine.append(char)
                        }
                    }
                    totalRead += read
                }

                if (currentLine.isNotEmpty() && lineCount < maxLines) {
                    sb.append(currentLine)
                }

                sb.append("\n... (file size exceeds $maxSize bytes, showing partial content)")
                sb.toString()
            }
        }
    }

    fun countLines(file: File): Result<Int> {
        return runCatching {
            var count = 0
            file.bufferedReader().use { reader ->
                while (reader.readLine() != null) count++
            }
            count
        }
    }

    fun readRange(file: File, startLine: Int, endLine: Int): Result<String> {
        return runCatching {
            file.bufferedReader().use { reader ->
                buildString {
                    var currentLine = 0
                    var line: String? = reader.readLine()
                    while (line != null) {
                        if (currentLine in startLine until endLine) {
                            append(line)
                            append('\n')
                        }
                        if (currentLine >= endLine) break
                        currentLine++
                        line = reader.readLine()
                    }
                }
            }
        }
    }
}
