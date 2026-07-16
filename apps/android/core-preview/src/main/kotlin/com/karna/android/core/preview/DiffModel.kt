package com.karna.android.core.preview

data class DiffHunk(
    val oldStart: Int,
    val oldCount: Int,
    val newStart: Int,
    val newCount: Int,
    val lines: List<DiffLine>
)

data class DiffLine(
    val type: DiffLineType,
    val content: String,
    val oldLineNumber: Int? = null,
    val newLineNumber: Int? = null
)

enum class DiffLineType {
    CONTEXT,
    ADD,
    REMOVE,
    HEADER
}

data class FileVersion(
    val versionId: String,
    val versionNumber: Int,
    val createdAt: String,
    val author: String?,
    val message: String?,
    val size: Long,
    val hash: String
)

data class FileVersionDiff(
    val oldVersion: FileVersion,
    val newVersion: FileVersion,
    val hunks: List<DiffHunk>,
    val addedLines: Int,
    val removedLines: Int
)
