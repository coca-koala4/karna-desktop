package com.karna.android.ui.runs

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun RunControlBar(
    status: String,
    isActionInProgress: Boolean,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onCancel: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isRunning = status.equals("running", ignoreCase = true) ||
            status.equals("queued", ignoreCase = true)
    val isPaused = status.equals("paused", ignoreCase = true) ||
            status.equals("awaiting_approval", ignoreCase = true)
    val isEnded = status.equals("completed", ignoreCase = true) ||
            status.equals("failed", ignoreCase = true) ||
            status.equals("cancelled", ignoreCase = true) ||
            status.equals("timeout", ignoreCase = true)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (isRunning) {
            OutlinedButton(
                onClick = onPause,
                enabled = !isActionInProgress,
                modifier = Modifier.padding(end = 8.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.Pause,
                    contentDescription = null,
                    modifier = Modifier.padding(end = 4.dp)
                )
                Text("暂停")
            }

            Button(
                onClick = onCancel,
                enabled = !isActionInProgress,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error
                )
            ) {
                Icon(
                    imageVector = Icons.Filled.Cancel,
                    contentDescription = null,
                    modifier = Modifier.padding(end = 4.dp)
                )
                Text("取消")
            }
        }

        if (isPaused) {
            Button(
                onClick = onResume,
                enabled = !isActionInProgress,
                modifier = Modifier.padding(end = 8.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.PlayArrow,
                    contentDescription = null,
                    modifier = Modifier.padding(end = 4.dp)
                )
                Text("继续")
            }

            Button(
                onClick = onCancel,
                enabled = !isActionInProgress,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error
                )
            ) {
                Icon(
                    imageVector = Icons.Filled.Cancel,
                    contentDescription = null,
                    modifier = Modifier.padding(end = 4.dp)
                )
                Text("取消")
            }
        }

        if (isEnded) {
            Button(
                onClick = onRetry,
                enabled = !isActionInProgress
            ) {
                Icon(
                    imageVector = Icons.Filled.Refresh,
                    contentDescription = null,
                    modifier = Modifier.padding(end = 4.dp)
                )
                Text("重试")
            }
        }
    }
}
