package com.karna.android.ui.runs

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.dp
import com.karna.android.core.database.entity.RunNodeEntity

@Composable
fun RunTimeline(
    nodes: List<RunNodeEntity>,
    modifier: Modifier = Modifier
) {
    val listState = rememberLazyListState()

    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        state = listState,
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(0.dp)
    ) {
        items(nodes, key = { it.id }) { node ->
            TimelineNodeItem(
                node = node,
                isFirst = nodes.firstOrNull()?.id == node.id,
                isLast = nodes.lastOrNull()?.id == node.id
            )
        }
    }
}

@Composable
private fun TimelineNodeItem(
    node: RunNodeEntity,
    isFirst: Boolean,
    isLast: Boolean,
    modifier: Modifier = Modifier
) {
    val lineColor = MaterialTheme.colorScheme.outlineVariant

    Row(
        modifier = modifier
            .fillMaxWidth()
            .drawBehind {
                val strokeWidth = 2.dp.toPx()
                val centerX = 24.dp.toPx()
                val lineTop = if (isFirst) size.height / 2 else 0f
                val lineBottom = if (isLast) size.height / 2 else size.height

                drawLine(
                    color = lineColor,
                    start = Offset(centerX, lineTop),
                    end = Offset(centerX, lineBottom),
                    strokeWidth = strokeWidth
                )
            }
            .padding(vertical = 8.dp)
    ) {
        Spacer(modifier = Modifier.width(48.dp))

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(bottom = if (isLast) 0.dp else 8.dp)
        ) {
            RunNodeCard(node = node)
        }
    }
}
