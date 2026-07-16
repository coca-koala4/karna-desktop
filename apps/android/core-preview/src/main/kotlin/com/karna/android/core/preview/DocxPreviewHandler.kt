package com.karna.android.core.preview

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DocxPreviewHandler @Inject constructor(
    @ApplicationContext private val context: Context,
    private val textHandler: TextPreviewHandler
) {
    fun loadHtmlContent(file: File): Result<String> {
        return runCatching {
            textHandler.loadText(file).getOrThrow()
        }
    }

    fun isHtmlContent(file: File): Boolean {
        return try {
            val content = textHandler.loadText(file).getOrNull()
            content?.trimStart()?.startsWith("<!DOCTYPE html>", ignoreCase = true) == true ||
                    content?.trimStart()?.startsWith("<html", ignoreCase = true) == true
        } catch (_: Exception) {
            false
        }
    }
}
