package com.karna.android.ui.modes

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.karna.android.R

@Composable
fun ModeStatusBar(
    onModeClick: (WorkMode) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ModeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    ModeStatusBarContent(
        currentMode = uiState.currentMode,
        plan = uiState.plan,
        goal = uiState.goal,
        livingWork = uiState.livingWork,
        onModeClick = onModeClick,
        modifier = modifier
    )
}

@Composable
private fun ModeStatusBarContent(
    currentMode: WorkMode,
    plan: com.karna.android.core.model.Plan?,
    goal: com.karna.android.core.model.Goal?,
    livingWork: com.karna.android.core.model.LivingWork?,
    onModeClick: (WorkMode) -> Unit,
    modifier: Modifier = Modifier
) {
    var modeLabel: String = stringResource(R.string.mode_direct)
    var modeIcon: ImageVector = Icons.Filled.PlayArrow
    var progress: Float? = null
    var statusText: String = stringResource(R.string.mode_direct_desc)

    when (currentMode) {
        WorkMode.DIRECT -> {
            modeLabel = stringResource(R.string.mode_direct)
            modeIcon = Icons.Filled.PlayArrow
            progress = null
            statusText = stringResource(R.string.mode_direct_desc)
        }
        WorkMode.PLAN -> {
            modeLabel = stringResource(R.string.mode_plan)
            modeIcon = Icons.Filled.Route
            val completedSteps = plan?.steps?.count { it.status == com.karna.android.core.model.PlanStepStatus.COMPLETED } ?: 0
            val totalSteps = plan?.steps?.size ?: 0
            progress = if (totalSteps > 0) completedSteps.toFloat() / totalSteps else 0f
            statusText = plan?.status?.name?.let { planStatusToString(it) } ?: stringResource(R.string.plan_no_active)
        }
        WorkMode.GOAL -> {
            modeLabel = stringResource(R.string.mode_goal)
            modeIcon = Icons.Filled.Flag
            progress = goal?.progressPercent?.div(100f) ?: 0f
            statusText = goal?.status?.name?.let { goalStatusToString(it) } ?: stringResource(R.string.goal_no_active)
        }
        WorkMode.LIVING_WORK -> {
            modeLabel = stringResource(R.string.mode_living_work)
            modeIcon = Icons.Filled.Work
            progress = livingWork?.currentIteration?.let { it.toFloat() / (it + 5).coerceAtLeast(1) } ?: 0f
            statusText = livingWork?.status?.name?.let { livingWorkStatusToString(it) } ?: stringResource(R.string.living_work_no_active)
        }
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable { onModeClick(currentMode) }
            .semantics { contentDescription = modeLabel },
        color = MaterialTheme.colorScheme.secondaryContainer,
        tonalElevation = 2.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = modeIcon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSecondaryContainer,
                modifier = Modifier.size(20.dp)
            )

            Box(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = modeLabel,
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = statusText,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f)
                    )
                }
            }

            if (progress != null) {
                Box(
                    modifier = Modifier
                        .width(80.dp)
                        .padding(vertical = 4.dp)
                ) {
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(4.dp)),
                        color = MaterialTheme.colorScheme.primary,
                        trackColor = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.2f),
                    )
                }
            }

            Icon(
                imageVector = Icons.Filled.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.5f),
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

@Composable
fun planStatusToString(status: String): String {
    return when (status.uppercase()) {
        "DRAFT", "DRAFTING" -> stringResource(R.string.plan_status_drafting)
        "PENDING_APPROVAL", "APPROVED" -> stringResource(R.string.plan_status_pending_approval)
        "ACTIVE", "IN_PROGRESS" -> stringResource(R.string.plan_status_active)
        "PAUSED" -> stringResource(R.string.plan_status_paused)
        "COMPLETED" -> stringResource(R.string.plan_status_completed)
        "ABANDONED", "REJECTED", "CANCELLED" -> stringResource(R.string.plan_status_abandoned)
        else -> status
    }
}

@Composable
fun goalStatusToString(status: String): String {
    return when (status.uppercase()) {
        "DRAFT" -> stringResource(R.string.goal_status_draft)
        "ACTIVE" -> stringResource(R.string.goal_status_active)
        "PAUSED" -> stringResource(R.string.goal_status_paused)
        "COMPLETED" -> stringResource(R.string.goal_status_completed)
        "ABANDONED", "FAILED" -> stringResource(R.string.goal_status_abandoned)
        else -> status
    }
}

@Composable
fun livingWorkStatusToString(status: String): String {
    return when (status.uppercase()) {
        "DRAFT" -> stringResource(R.string.living_work_status_draft)
        "ACTIVE" -> stringResource(R.string.living_work_status_active)
        "AWAITING_DECISION" -> stringResource(R.string.living_work_status_awaiting_decision)
        "PAUSED" -> stringResource(R.string.living_work_status_paused)
        "COMPLETED" -> stringResource(R.string.living_work_status_completed)
        "TERMINATED" -> stringResource(R.string.living_work_status_terminated)
        else -> status
    }
}
