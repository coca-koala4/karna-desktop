package com.karna.android.core.preview

import java.io.File
import java.util.regex.Pattern
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DiffPreviewHandler @Inject constructor(
    private val textHandler: TextPreviewHandler
) {
    private val hunkHeaderPattern = Pattern.compile(
        "^@@ -(\\d+)(?:,(\\d+))? \\+(\\d+)(?:,(\\d+))? @@(.*)$"
    )

    fun parseDiff(file: File): Result<FileVersionDiff> {
        return runCatching {
            val content = textHandler.loadText(file).getOrThrow()
            parseDiffContent(content)
        }
    }

    fun parseDiffContent(content: String): FileVersionDiff {
        val lines = content.lines()
        val hunks = mutableListOf<DiffHunk>()
        var currentHunk: MutableList<DiffLine>? = null
        var oldStart = 0
        var oldCount = 0
        var newStart = 0
        var newCount = 0
        var addedLines = 0
        var removedLines = 0
        var currentOldLine = 0
        var currentNewLine = 0

        for (line in lines) {
            val hunkMatcher = hunkHeaderPattern.matcher(line)
            when {
                hunkMatcher.matches() -> {
                    currentHunk?.let { hunkLines ->
                        hunks.add(
                            DiffHunk(
                                oldStart = oldStart,
                                oldCount = oldCount,
                                newStart = newStart,
                                newCount = newCount,
                                lines = hunkLines.toList()
                            )
                        )
                    }
                    oldStart = hunkMatcher.group(1)?.toIntOrNull() ?: 0
                    oldCount = hunkMatcher.group(2)?.toIntOrNull() ?: 1
                    newStart = hunkMatcher.group(3)?.toIntOrNull() ?: 0
                    newCount = hunkMatcher.group(4)?.toIntOrNull() ?: 1
                    currentOldLine = oldStart
                    currentNewLine = newStart
                    currentHunk = mutableListOf(
                        DiffLine(
                            type = DiffLineType.HEADER,
                            content = line,
                            oldLineNumber = null,
                            newLineNumber = null
                        )
                    )
                }
                currentHunk != null && line.startsWith("+") && !line.startsWith("+++") -> {
                    currentHunk.add(
                        DiffLine(
                            type = DiffLineType.ADD,
                            content = line.removePrefix("+"),
                            oldLineNumber = null,
                            newLineNumber = currentNewLine
                        )
                    )
                    currentNewLine++
                    addedLines++
                }
                currentHunk != null && line.startsWith("-") && !line.startsWith("---") -> {
                    currentHunk.add(
                        DiffLine(
                            type = DiffLineType.REMOVE,
                            content = line.removePrefix("-"),
                            oldLineNumber = currentOldLine,
                            newLineNumber = null
                        )
                    )
                    currentOldLine++
                    removedLines++
                }
                currentHunk != null && (line.startsWith(" ") || line.isEmpty()) -> {
                    currentHunk.add(
                        DiffLine(
                            type = DiffLineType.CONTEXT,
                            content = line.removePrefix(" "),
                            oldLineNumber = currentOldLine,
                            newLineNumber = currentNewLine
                        )
                    )
                    currentOldLine++
                    currentNewLine++
                }
            }
        }

        currentHunk?.let { hunkLines ->
            hunks.add(
                DiffHunk(
                    oldStart = oldStart,
                    oldCount = oldCount,
                    newStart = newStart,
                    newCount = newCount,
                    lines = hunkLines.toList()
                )
            )
        }

        val dummyVersion = FileVersion(
            versionId = "",
            versionNumber = 0,
            createdAt = "",
            author = null,
            message = null,
            size = 0,
            hash = ""
        )

        return FileVersionDiff(
            oldVersion = dummyVersion,
            newVersion = dummyVersion,
            hunks = hunks,
            addedLines = addedLines,
            removedLines = removedLines
        )
    }
}
