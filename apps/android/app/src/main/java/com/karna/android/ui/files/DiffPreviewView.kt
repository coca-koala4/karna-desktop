package com.karna.android.ui.files

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.karna.android.core.preview.DiffHunk
import com.karna.android.core.preview.DiffLine
import com.karna.android.core.preview.DiffLineType
import com.karna.android.core.preview.FileVersionDiff

@Composable
fun DiffPreviewView(
    diff: FileVersionDiff,
    modifier: Modifier = Modifier
) {
    val listState = rememberLazyListState()

    Column(
        modifier = modifier.fillMaxSize()
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            tonalElevation = 2.dp,
            color = MaterialTheme.colorScheme.surfaceVariant
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row {
                    Text(
                        text = "+${diff.addedLines}",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.tertiary
                    )
                    Spacer(modifier = Modifier.width(16.dp))
                    Text(
                        text = "-${diff.removedLines}",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.error
                    )
                }
                Text(
                    text = "版本对比",
                    style = MaterialTheme.typography.titleMedium
                )
            }
        }

        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .horizontalScroll(rememberScrollState())
        ) {
            items(diff.hunks) { hunk ->
                DiffHunkView(hunk = hunk)
            }
        }
    }
}

@Composable
private fun DiffHunkView(
    hunk: DiffHunk,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        ) {
            Text(
                text = hunk.lines.firstOrNull()?.content ?: "",
                style = MaterialTheme.typography.labelMedium,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
            )
        }

        hunk.lines.drop(1).forEach { line ->
            DiffLineView(line = line)
        }
    }
}

@Composable
private fun DiffLineView(
    line: DiffLine,
    modifier: Modifier = Modifier
) {
    val backgroundColor = when (line.type) {
        DiffLineType.ADD -> MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.4f)
        DiffLineType.REMOVE -> MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.4f)
        DiffLineType.CONTEXT -> MaterialTheme.colorScheme.surface
        DiffLineType.HEADER -> MaterialTheme.colorScheme.surfaceVariant
    }

    val textColor = when (line.type) {
        DiffLineType.ADD -> MaterialTheme.colorScheme.onTertiaryContainer
        DiffLineType.REMOVE -> MaterialTheme.colorScheme.onErrorContainer
        else -> MaterialTheme.colorScheme.onSurface
    }

    val prefix = when (line.type) {
        DiffLineType.ADD -> "+"
        DiffLineType.REMOVE -> "-"
        DiffLineType.CONTEXT -> " "
        DiffLineType.HEADER -> "@"
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(backgroundColor)
            .padding(horizontal = 4.dp, vertical = 1.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = line.oldLineNumber?.toString()?.padStart(4, ' ') ?: "    ",
            style = MaterialTheme.typography.bodySmall,
            fontFamily = FontFamily.Monospace,
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
            modifier = Modifier.width(40.dp)
        )

        Text(
            text = line.newLineNumber?.toString()?.padStart(4, ' ') ?: "    ",
            style = MaterialTheme.typography.bodySmall,
            fontFamily = FontFamily.Monospace,
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
            modifier = Modifier.width(40.dp)
        )

        Text(
            text = prefix,
            style = MaterialTheme.typography.bodySmall,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
            color = textColor,
            modifier = Modifier.width(16.dp)
        )

        Text(
            text = line.content,
            style = MaterialTheme.typography.bodySmall,
            fontFamily = FontFamily.Monospace,
            fontSize = 12.sp,
            color = textColor
        )
    }
}
