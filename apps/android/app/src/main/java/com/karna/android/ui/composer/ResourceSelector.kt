package com.karna.android.ui.composer

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.karna.android.core.model.McpResource
import com.karna.android.core.model.SkillResource
import com.karna.android.core.model.SoulResource
import com.karna.android.core.model.WorkflowResource

enum class ResourceCategory(val displayName: String) {
    SKILLS("技能"),
    MCPS("MCP服务"),
    SOULS("灵魂"),
    WORKFLOWS("工作流")
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun ResourceSelector(
    skills: List<SkillResource>,
    mcps: List<McpResource>,
    souls: List<SoulResource>,
    workflows: List<WorkflowResource>,
    selectedSkills: Set<String>,
    selectedMcps: Set<String>,
    selectedSoulId: String?,
    selectedWorkflowId: String?,
    onToggleSkill: (String) -> Unit,
    onToggleMcp: (String) -> Unit,
    onSelectSoul: (String?) -> Unit,
    onSelectWorkflow: (String?) -> Unit,
    onClearAll: () -> Unit,
    modifier: Modifier = Modifier
) {
    var showSheet by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState()
    var expandedCategory by remember { mutableStateOf<ResourceCategory?>(null) }

    val hasSelection = selectedSkills.isNotEmpty() || selectedMcps.isNotEmpty() ||
            selectedSoulId != null || selectedWorkflowId != null

    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            FlowRow(
                modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                selectedSkills.forEach { skillId ->
                    skills.find { it.id == skillId }?.let { skill ->
                        ResourceChip(
                            label = skill.name,
                            onRemove = { onToggleSkill(skillId) }
                        )
                    }
                }
                selectedMcps.forEach { mcpId ->
                    mcps.find { it.id == mcpId }?.let { mcp ->
                        ResourceChip(
                            label = mcp.name,
                            onRemove = { onToggleMcp(mcpId) }
                        )
                    }
                }
                selectedSoulId?.let { soulId ->
                    souls.find { it.id == soulId }?.let { soul ->
                        ResourceChip(
                            label = soul.name,
                            onRemove = { onSelectSoul(null) }
                        )
                    }
                }
                selectedWorkflowId?.let { workflowId ->
                    workflows.find { it.id == workflowId }?.let { workflow ->
                        ResourceChip(
                            label = workflow.name,
                            onRemove = { onSelectWorkflow(null) }
                        )
                    }
                }
            }

            Surface(
                modifier = Modifier
                    .size(48.dp)
                    .clip(MaterialTheme.shapes.small)
                    .clickable { showSheet = true },
                color = if (hasSelection) {
                    MaterialTheme.colorScheme.primaryContainer
                } else {
                    MaterialTheme.colorScheme.surfaceVariant
                },
                shape = MaterialTheme.shapes.small
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = if (hasSelection) "+" else "+",
                        style = MaterialTheme.typography.titleMedium,
                        color = if (hasSelection) {
                            MaterialTheme.colorScheme.onPrimaryContainer
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        }
                    )
                }
            }
        }

        if (hasSelection) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "清除全部",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.clickable(onClick = onClearAll)
            )
        }
    }

    if (showSheet) {
        ModalBottomSheet(
            onDismissRequest = { showSheet = false },
            sheetState = sheetState
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
            ) {
                Text(
                    text = "选择资源",
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.padding(bottom = 16.dp)
                )

                LazyColumn(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    item {
                        ResourceCategorySection(
                            title = ResourceCategory.SKILLS.displayName,
                            isExpanded = expandedCategory == ResourceCategory.SKILLS,
                            onExpand = {
                                expandedCategory = if (expandedCategory == ResourceCategory.SKILLS) null
                                else ResourceCategory.SKILLS
                            }
                        ) {
                            if (expandedCategory == ResourceCategory.SKILLS) {
                                skills.forEach { skill ->
                                    ResourceSelectItem(
                                        name = skill.name,
                                        description = skill.description,
                                        isSelected = skill.id in selectedSkills,
                                        onToggle = { onToggleSkill(skill.id) }
                                    )
                                }
                            }
                        }
                    }

                    item {
                        ResourceCategorySection(
                            title = ResourceCategory.MCPS.displayName,
                            isExpanded = expandedCategory == ResourceCategory.MCPS,
                            onExpand = {
                                expandedCategory = if (expandedCategory == ResourceCategory.MCPS) null
                                else ResourceCategory.MCPS
                            }
                        ) {
                            if (expandedCategory == ResourceCategory.MCPS) {
                                mcps.forEach { mcp ->
                                    ResourceSelectItem(
                                        name = mcp.name,
                                        description = mcp.description,
                                        isSelected = mcp.id in selectedMcps,
                                        onToggle = { onToggleMcp(mcp.id) }
                                    )
                                }
                            }
                        }
                    }

                    item {
                        ResourceCategorySection(
                            title = ResourceCategory.SOULS.displayName,
                            isExpanded = expandedCategory == ResourceCategory.SOULS,
                            onExpand = {
                                expandedCategory = if (expandedCategory == ResourceCategory.SOULS) null
                                else ResourceCategory.SOULS
                            }
                        ) {
                            if (expandedCategory == ResourceCategory.SOULS) {
                                souls.forEach { soul ->
                                    ResourceSelectItem(
                                        name = soul.name,
                                        description = soul.description,
                                        isSelected = soul.id == selectedSoulId,
                                        onToggle = {
                                            onSelectSoul(if (soul.id == selectedSoulId) null else soul.id)
                                        }
                                    )
                                }
                            }
                        }
                    }

                    item {
                        ResourceCategorySection(
                            title = ResourceCategory.WORKFLOWS.displayName,
                            isExpanded = expandedCategory == ResourceCategory.WORKFLOWS,
                            onExpand = {
                                expandedCategory = if (expandedCategory == ResourceCategory.WORKFLOWS) null
                                else ResourceCategory.WORKFLOWS
                            }
                        ) {
                            if (expandedCategory == ResourceCategory.WORKFLOWS) {
                                workflows.forEach { workflow ->
                                    ResourceSelectItem(
                                        name = workflow.name,
                                        description = workflow.description,
                                        isSelected = workflow.id == selectedWorkflowId,
                                        onToggle = {
                                            onSelectWorkflow(if (workflow.id == selectedWorkflowId) null else workflow.id)
                                        }
                                    )
                                }
                            }
                        }
                    }

                    item {
                        Spacer(modifier = Modifier.height(32.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun ResourceCategorySection(
    title: String,
    isExpanded: Boolean,
    onExpand: () -> Unit,
    content: @Composable () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onExpand)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f)
                )
                Icon(
                    imageVector = if (isExpanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                    contentDescription = if (isExpanded) "收起" else "展开"
                )
            }

            if (isExpanded) {
                Divider()
                Column(
                    modifier = Modifier.padding(vertical = 8.dp)
                ) {
                    content()
                }
            }
        }
    }
}

@Composable
private fun ResourceSelectItem(
    name: String,
    description: String,
    isSelected: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onToggle)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface
            )
            if (description.isNotBlank()) {
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        Spacer(modifier = Modifier.width(12.dp))

        Box(
            modifier = Modifier
                .size(24.dp)
                .clip(MaterialTheme.shapes.small)
                .then(
                    if (isSelected) {
                        Modifier
                    } else {
                        Modifier.border(
                            2.dp,
                            MaterialTheme.colorScheme.outline,
                            MaterialTheme.shapes.small
                        )
                    }
                )
                .background(
                    if (isSelected) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.surface
                ),
            contentAlignment = Alignment.Center
        ) {
            if (isSelected) {
                Icon(
                    imageVector = Icons.Filled.Check,
                    contentDescription = "已选中",
                    tint = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}
