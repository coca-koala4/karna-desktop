package com.karna.android.ui.composer

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.karna.android.core.model.ModeResource

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ModeSelector(
    modes: List<ModeResource>,
    selectedModeId: String?,
    onModeSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
    onNavigateToMode: ((ComposerMode) -> Unit)? = null
) {
    if (modes.isEmpty()) return

    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        modes.forEach { mode ->
            SimpleChip(
                label = mode.name,
                selected = mode.id == selectedModeId,
                onClick = {
                    onModeSelected(mode.id)
                    val composerMode = ComposerMode.fromId(mode.id)
                    if (composerMode != ComposerMode.DIRECT) {
                        onNavigateToMode?.invoke(composerMode)
                    }
                }
            )
        }
    }
}

enum class ComposerMode(val id: String, val displayName: String, val description: String) {
    DIRECT("direct", "直接", "立即执行，快速响应"),
    PLAN("plan", "计划", "先制定计划再执行"),
    GOAL("goal", "目标", "以目标为导向自主执行"),
    LIVING_WORK("living_work", "活件", "持续运行的工作模式");

    companion object {
        fun fromId(id: String?): ComposerMode {
            return entries.find { it.id == id } ?: DIRECT
        }
    }
}
