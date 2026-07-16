package com.karna.android.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp

enum class ConnectionStatus {
    CONNECTED,
    CONNECTING,
    DISCONNECTED,
    ERROR
}

@Composable
fun ConnectionStatusBadge(
    status: ConnectionStatus,
    modifier: Modifier = Modifier,
    showText: Boolean = true
) {
    val (color, text) = when (status) {
        ConnectionStatus.CONNECTED -> Pair(
            MaterialTheme.colorScheme.primary,
            "已连接"
        )
        ConnectionStatus.CONNECTING -> Pair(
            MaterialTheme.colorScheme.tertiary,
            "连接中"
        )
        ConnectionStatus.DISCONNECTED -> Pair(
            MaterialTheme.colorScheme.outline,
            "未连接"
        )
        ConnectionStatus.ERROR -> Pair(
            MaterialTheme.colorScheme.error,
            "连接错误"
        )
    }

    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(color)
        )
        if (showText) {
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium,
                color = color
            )
        }
    }
}
