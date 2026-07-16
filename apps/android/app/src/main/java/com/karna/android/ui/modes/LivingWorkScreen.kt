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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.Balance
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.karna.android.R
import com.karna.android.core.model.AuthorDecision
import com.karna.android.core.model.AuthorDecisionType
import com.karna.android.core.model.CandidateNextStep
import com.karna.android.core.model.CreativeContract
import com.karna.android.core.model.ImpactAnalysis
import com.karna.android.core.model.LivingWork
import com.karna.android.core.model.LivingWorkStatus

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LivingWorkScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ModeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    var modifyingStepId by remember { mutableStateOf<String?>(null) }
    var modifyText by remember { mutableStateOf("") }
    var rejectingStepId by remember { mutableStateOf<String?>(null) }
    var rejectReason by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        viewModel.setMode(WorkMode.LIVING_WORK)
    }

    LaunchedEffect(uiState.errorMessage) {
        uiState.errorMessage?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            viewModel.clearError()
        }
    }

    if (modifyingStepId != null) {
        AlertDialog(
            onDismissRequest = { modifyingStepId = null },
            title = { Text(text = stringResource(R.string.modify_candidate_step)) },
            text = {
                OutlinedTextField(
                    value = modifyText,
                    onValueChange = { modifyText = it },
                    label = { Text(text = stringResource(R.string.modified_to)) },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        modifyingStepId?.let { stepId ->
                            viewModel.modifyCandidateStep(stepId, modifyText)
                        }
                        modifyingStepId = null
                        modifyText = ""
                    },
                    enabled = modifyText.isNotBlank()
                ) {
                    Text(text = stringResource(R.string.confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    modifyingStepId = null
                    modifyText = ""
                }) {
                    Text(text = stringResource(R.string.cancel))
                }
            }
        )
    }

    if (rejectingStepId != null) {
        AlertDialog(
            onDismissRequest = { rejectingStepId = null },
            title = { Text(text = stringResource(R.string.reject_candidate_step)) },
            text = {
                OutlinedTextField(
                    value = rejectReason,
                    onValueChange = { rejectReason = it },
                    label = { Text(text = stringResource(R.string.reject_reason)) },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        rejectingStepId?.let { stepId ->
                            viewModel.rejectCandidateStep(stepId, rejectReason)
                        }
                        rejectingStepId = null
                        rejectReason = ""
                    },
                    enabled = rejectReason.isNotBlank()
                ) {
                    Text(text = stringResource(R.string.confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    rejectingStepId = null
                    rejectReason = ""
                }) {
                    Text(text = stringResource(R.string.cancel))
                }
            }
        )
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.living_work_title),
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
        if (uiState.isLoading && uiState.livingWork == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else if (uiState.livingWork == null) {
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
                        imageVector = Icons.Filled.Work,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = stringResource(R.string.living_work_no_active),
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = stringResource(R.string.living_work_no_active_desc),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }
        } else {
            LivingWorkContent(
                work = uiState.livingWork!!,
                isLoading = uiState.isLoading,
                onSelectStep = { stepId -> viewModel.selectCandidateStep(stepId) },
                onApproveStep = { stepId -> viewModel.approveCandidateStep(stepId) },
                onRejectStep = { stepId ->
                    rejectingStepId = stepId
                },
                onDeferStep = { stepId -> viewModel.deferCandidateStep(stepId) },
                onModifyStep = { stepId ->
                    modifyingStepId = stepId
                    modifyText = ""
                },
                modifier = Modifier.padding(innerPadding)
            )
        }
    }
}

@Composable
private fun LivingWorkContent(
    work: LivingWork,
    isLoading: Boolean,
    onSelectStep: (String) -> Unit,
    onApproveStep: (String) -> Unit,
    onRejectStep: (String) -> Unit,
    onDeferStep: (String) -> Unit,
    onModifyStep: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val contract = work.creativeContract ?: work.contract
    val candidates = if (work.candidateNextSteps.isNotEmpty()) work.candidateNextSteps else work.candidateSteps
    val impact = work.impactAnalysis ?: work.impactAnalyses.firstOrNull()
    val decisions = if (work.authorDecisions.isNotEmpty()) work.authorDecisions else work.decisions

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .fillMaxWidth(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                work.title?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                work.summary?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.secondaryContainer
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.iteration_count, work.currentIteration),
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSecondaryContainer
                        )
                    }
                }
            }
        }

        contract?.let { cc ->
            item {
                CreativeContractSection(contract = cc)
            }
        }

        if (candidates.isNotEmpty()) {
            item {
                Text(
                    text = stringResource(R.string.candidate_next_steps),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            items(candidates, key = { it.id }) { candidate ->
                CandidateStepCard(
                    candidate = candidate,
                    isSelected = candidate.id == work.selectedStepId || candidate.isSelected,
                    onSelect = { onSelectStep(candidate.id) },
                    onApprove = { onApproveStep(candidate.id) },
                    onReject = { onRejectStep(candidate.id) },
                    onDefer = { onDeferStep(candidate.id) },
                    onModify = { onModifyStep(candidate.id) }
                )
            }
        }

        impact?.let { ia ->
            item {
                ImpactAnalysisSection(impact = ia)
            }
        }

        if (decisions.isNotEmpty()) {
            item {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.History,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                        Text(
                            text = stringResource(R.string.author_decisions),
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }

            items(decisions.takeLast(10).reversed()) { decision ->
                AuthorDecisionItem(decision = decision)
            }
        }

        item { Spacer(modifier = Modifier.height(16.dp)) }
    }
}

@Composable
private fun CreativeContractSection(
    contract: CreativeContract,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.3f)
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.Assignment,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.tertiary,
                    modifier = Modifier.size(20.dp)
                )
                Text(
                    text = stringResource(R.string.creative_contract),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onTertiaryContainer
                )
                Spacer(modifier = Modifier.weight(1f))
                val riskColor = getRiskLevelColor(contract.riskLevel)
                val riskLabel = getRiskLevelLabel(contract.riskLevel)
                Box(
                    modifier = Modifier
                        .padding(4.dp)
                ) {
                    Text(
                        text = riskLabel,
                        style = MaterialTheme.typography.labelSmall,
                        color = riskColor
                    )
                }
            }

            contract.scope?.let { scope ->
                Text(
                    text = stringResource(R.string.contract_scope),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onTertiaryContainer
                )
                Text(
                    text = scope,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onTertiaryContainer
                )
            }

            contract.vision?.let { vision ->
                if (contract.scope == null) {
                    Text(
                        text = stringResource(R.string.contract_vision),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onTertiaryContainer
                    )
                    Text(
                        text = vision,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onTertiaryContainer
                    )
                }
            }

            val doNotDo = if (contract.doNotDo.isNotEmpty()) {
                contract.doNotDo
            } else {
                contract.nonGoals
            }

            if (doNotDo.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.contract_do_not_do),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onTertiaryContainer
                )
                doNotDo.forEach { item ->
                    Text(
                        text = "- $item",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onTertiaryContainer.copy(alpha = 0.8f),
                        modifier = Modifier.padding(start = 8.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun ImpactAnalysisSection(
    impact: ImpactAnalysis,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.Balance,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier.size(20.dp)
                )
                Text(
                    text = stringResource(R.string.impact_analysis),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (impact.affectedFiles.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.affected_files),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                impact.affectedFiles.forEach { file ->
                    Text(
                        text = "- $file",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                        modifier = Modifier.padding(start = 8.dp)
                    )
                }
            }

            if (impact.affectedSystems.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.affected_systems),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                impact.affectedSystems.forEach { system ->
                    Text(
                        text = "- $system",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                        modifier = Modifier.padding(start = 8.dp)
                    )
                }
            }

            if (impact.rollbackSteps.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.rollback_steps),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.error
                )
                impact.rollbackSteps.forEachIndexed { idx, step ->
                    Text(
                        text = "${idx + 1}. $step",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.8f),
                        modifier = Modifier.padding(start = 8.dp)
                    )
                }
            }

            if (impact.risks.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.risks),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.error
                )
                impact.risks.forEach { risk ->
                    Text(
                        text = "- $risk",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.8f),
                        modifier = Modifier.padding(start = 8.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun AuthorDecisionItem(
    decision: AuthorDecision,
    modifier: Modifier = Modifier
) {
    val decisionType = decision.decisionType ?: when (decision.decision.uppercase()) {
        "APPROVE" -> AuthorDecisionType.APPROVE
        "REJECT" -> AuthorDecisionType.REJECT
        "DEFER" -> AuthorDecisionType.DEFER
        "MODIFY" -> AuthorDecisionType.MODIFY
        else -> null
    }

    val (icon, color, label) = when (decisionType) {
        AuthorDecisionType.APPROVE -> Triple(
            Icons.Filled.CheckCircle,
            Color(0xFF2E7D32),
            stringResource(R.string.decision_approve)
        )
        AuthorDecisionType.REJECT -> Triple(
            Icons.Filled.Block,
            MaterialTheme.colorScheme.error,
            stringResource(R.string.decision_reject)
        )
        AuthorDecisionType.DEFER -> Triple(
            Icons.Filled.Schedule,
            MaterialTheme.colorScheme.tertiary,
            stringResource(R.string.decision_defer)
        )
        AuthorDecisionType.MODIFY -> Triple(
            Icons.Filled.Edit,
            MaterialTheme.colorScheme.primary,
            stringResource(R.string.decision_modify)
        )
        null -> Triple(
            Icons.Filled.CheckCircle,
            MaterialTheme.colorScheme.outline,
            decision.decision
        )
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        shape = RoundedCornerShape(8.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = color,
                modifier = Modifier
                    .padding(top = 2.dp)
                    .size(20.dp)
            )
            Column(
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.titleSmall,
                    color = color
                )
                val reasonText = decision.reason ?: decision.reasoning ?: decision.feedback
                reasonText?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                decision.modifiedTo?.let {
                    Text(
                        text = stringResource(R.string.modified_to) + ": " + it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}
