package com.karna.android.ui.modes

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.PauseCircle
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.karna.android.R
import com.karna.android.core.model.PlanStep
import com.karna.android.core.model.PlanStepStatus

@Composable
fun PlanStepCard(
    step: PlanStep,
    index: Int,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    val statusInfo = getStepStatusInfo(step.status)

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        onClick = onClick ?: {}
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(statusInfo.color.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = statusInfo.icon,
                    contentDescription = statusInfo.label,
                    tint = statusInfo.color,
                    modifier = Modifier.size(24.dp)
                )
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "${index + 1}.",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = step.title,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                step.description?.takeIf { it.isNotBlank() }?.let { desc ->
                    Text(
                        text = desc,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(statusInfo.color.copy(alpha = 0.12f))
                            .padding(horizontal = 8.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = statusInfo.label,
                            style = MaterialTheme.typography.labelSmall,
                            color = statusInfo.color
                        )
                    }

                    if (step.dependsOn.isNotEmpty()) {
                        Text(
                            text = stringResource(R.string.plan_step_depends_on, step.dependsOn.size),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                }
            }
        }
    }
}

data class StepStatusInfo(
    val icon: ImageVector,
    val color: Color,
    val label: String
)

@Composable
fun getStepStatusInfo(status: PlanStepStatus): StepStatusInfo {
    return when (status) {
        PlanStepStatus.PENDING -> StepStatusInfo(
            icon = Icons.Filled.RadioButtonUnchecked,
            color = MaterialTheme.colorScheme.outline,
            label = stringResource(R.string.step_status_pending)
        )
        PlanStepStatus.IN_PROGRESS -> StepStatusInfo(
            icon = Icons.Filled.PlayCircle,
            color = MaterialTheme.colorScheme.primary,
            label = stringResource(R.string.step_status_in_progress)
        )
        PlanStepStatus.COMPLETED -> StepStatusInfo(
            icon = Icons.Filled.CheckCircle,
            color = Color(0xFF2E7D32),
            label = stringResource(R.string.step_status_completed)
        )
        PlanStepStatus.BLOCKED -> StepStatusInfo(
            icon = Icons.Filled.Block,
            color = MaterialTheme.colorScheme.error,
            label = stringResource(R.string.step_status_blocked)
        )
        PlanStepStatus.SKIPPED -> StepStatusInfo(
            icon = Icons.Filled.SkipNext,
            color = MaterialTheme.colorScheme.tertiary,
            label = stringResource(R.string.step_status_skipped)
        )
    }
}
