package com.karna.android.ui.modes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.karna.android.R
import com.karna.android.core.model.Plan
import com.karna.android.core.model.PlanStatus

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ModeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        viewModel.setMode(WorkMode.PLAN)
    }

    LaunchedEffect(uiState.errorMessage) {
        uiState.errorMessage?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            viewModel.clearError()
        }
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.plan_title),
                        style = MaterialTheme.typography.titleLarge
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.back)
                        )
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { innerPadding ->
        if (uiState.isLoading && uiState.plan == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else if (uiState.plan == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                    modifier = Modifier.padding(32.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.Route,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = stringResource(R.string.plan_no_active),
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = stringResource(R.string.plan_no_active_desc),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }
        } else {
            val defaultRejectReason = stringResource(R.string.plan_reject_reason_default)
            PlanContent(
                plan = uiState.plan!!,
                isLoading = uiState.isLoading,
                onApprove = { viewModel.approvePlan() },
                onReject = { viewModel.rejectPlan(defaultRejectReason) },
                onPause = { viewModel.pausePlan() },
                onResume = { viewModel.resumePlan() },
                modifier = Modifier.padding(innerPadding)
            )
        }
    }
}

@Composable
private fun PlanContent(
    plan: Plan,
    isLoading: Boolean,
    onApprove: () -> Unit,
    onReject: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
    ) {
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = plan.title,
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    plan.summary?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    val completedCount = plan.steps.count {
                        it.status == com.karna.android.core.model.PlanStepStatus.COMPLETED
                    }
                    Text(
                        text = stringResource(R.string.plan_progress, completedCount, plan.steps.size),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (plan.riskDescriptions.isNotEmpty() || plan.risks.isNotEmpty()) {
                item {
                    Column(
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Filled.WarningAmber,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(20.dp)
                            )
                            Text(
                                text = stringResource(R.string.plan_risks),
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }

                        val risksToShow = if (plan.riskDescriptions.isNotEmpty()) {
                            plan.riskDescriptions
                        } else {
                            plan.risks.map { it.description }
                        }

                        risksToShow.forEach { risk ->
                            Text(
                                text = "- $risk",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 28.dp)
                            )
                        }
                    }
                }
            }

            if (plan.confirmations.isNotEmpty()) {
                item {
                    Column(
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.plan_confirmations),
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        plan.confirmations.forEach { confirmation ->
                            Text(
                                text = "- $confirmation",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 8.dp)
                            )
                        }
                    }
                }
            }

            item {
                Text(
                    text = stringResource(R.string.plan_steps),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            itemsIndexed(plan.steps.sortedBy { it.order }, key = { _, step -> step.id }) { index, step ->
                PlanStepCard(
                    step = step,
                    index = index
                )
            }
        }

        PlanActionBar(
            status = plan.status,
            isLoading = isLoading,
            onApprove = onApprove,
            onReject = onReject,
            onPause = onPause,
            onResume = onResume
        )
    }
}

@Composable
private fun PlanActionBar(
    status: PlanStatus,
    isLoading: Boolean,
    onApprove: () -> Unit,
    onReject: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shadowElevation = 8.dp,
        color = MaterialTheme.colorScheme.surface
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            when (status) {
                PlanStatus.DRAFT, PlanStatus.DRAFTING, PlanStatus.PENDING_APPROVAL -> {
                    OutlinedButton(
                        onClick = onReject,
                        enabled = !isLoading,
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                    ) {
                        Text(text = stringResource(R.string.plan_reject))
                    }
                    Button(
                        onClick = onApprove,
                        enabled = !isLoading,
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                    ) {
                        Text(text = stringResource(R.string.plan_approve))
                    }
                }
                PlanStatus.APPROVED, PlanStatus.ACTIVE, PlanStatus.IN_PROGRESS -> {
                    OutlinedButton(
                        onClick = onPause,
                        enabled = !isLoading,
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Pause,
                            contentDescription = null,
                            modifier = Modifier.padding(end = 8.dp)
                        )
                        Text(text = stringResource(R.string.plan_pause))
                    }
                }
                PlanStatus.PAUSED -> {
                    Button(
                        onClick = onResume,
                        enabled = !isLoading,
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.PlayArrow,
                            contentDescription = null,
                            modifier = Modifier.padding(end = 8.dp)
                        )
                        Text(text = stringResource(R.string.plan_resume))
                    }
                }
                else -> {
                    Text(
                        text = planStatusToString(status),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
fun planStatusToString(status: PlanStatus): String {
    return when (status) {
        PlanStatus.DRAFT -> stringResource(R.string.plan_status_drafting)
        PlanStatus.DRAFTING -> stringResource(R.string.plan_status_drafting)
        PlanStatus.PENDING_APPROVAL -> stringResource(R.string.plan_status_pending_approval)
        PlanStatus.APPROVED -> stringResource(R.string.plan_status_active)
        PlanStatus.ACTIVE -> stringResource(R.string.plan_status_active)
        PlanStatus.IN_PROGRESS -> stringResource(R.string.plan_status_active)
        PlanStatus.PAUSED -> stringResource(R.string.plan_status_paused)
        PlanStatus.COMPLETED -> stringResource(R.string.plan_status_completed)
        PlanStatus.ABANDONED -> stringResource(R.string.plan_status_abandoned)
        PlanStatus.REJECTED -> stringResource(R.string.plan_status_abandoned)
        PlanStatus.CANCELLED -> stringResource(R.string.plan_status_abandoned)
    }
}
