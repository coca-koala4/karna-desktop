package com.karna.android.ui.interactions

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.GppBad
import androidx.compose.material.icons.filled.GppGood
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.karna.android.core.database.entity.InteractionEntity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun InteractionCard(
    interaction: InteractionEntity,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val riskLevel = estimateRiskLevel(interaction)
    val riskColor = when (riskLevel) {
        RiskLevel.LOW -> MaterialTheme.colorScheme.tertiary
        RiskLevel.MEDIUM -> MaterialTheme.colorScheme.secondary
        RiskLevel.HIGH -> MaterialTheme.colorScheme.error.copy(alpha = 0.8f)
        RiskLevel.CRITICAL -> MaterialTheme.colorScheme.error
    }
    val riskIcon = when (riskLevel) {
        RiskLevel.LOW -> Icons.Filled.GppGood
        RiskLevel.MEDIUM -> Icons.Filled.WarningAmber
        RiskLevel.HIGH -> Icons.Filled.ErrorOutline
        RiskLevel.CRITICAL -> Icons.Filled.GppBad
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(riskColor.copy(alpha = 0.1f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = riskIcon,
                        contentDescription = null,
                        tint = riskColor,
                        modifier = Modifier.size(24.dp)
                    )
                }

                Spacer(modifier = Modifier.padding(horizontal = 12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = getInteractionTypeDisplayName(interaction.type),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )

                    Spacer(modifier = Modifier.height(2.dp))

                    interaction.content?.let { content ->
                        Text(
                            text = content,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(riskColor.copy(alpha = 0.1f))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = getRiskLevelName(riskLevel),
                            style = MaterialTheme.typography.labelSmall,
                            color = riskColor
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.AccessTime,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.outline,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = formatTime(interaction.timestamp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }
        }
    }
}

fun estimateRiskLevel(interaction: InteractionEntity): RiskLevel {
    val type = interaction.type.lowercase()
    val content = interaction.content?.lowercase() ?: ""

    return when {
        type.contains("critical") ||
                content.contains("sudo") ||
                content.contains("rm -rf") ||
                content.contains("delete") ||
                content.contains("payment") ||
                content.contains("付款") ||
                content.contains("删除") -> RiskLevel.CRITICAL
        type.contains("approve") ||
                type.contains("command") -> RiskLevel.HIGH
        type.contains("confirm") ||
                type.contains("permission") -> RiskLevel.MEDIUM
        else -> RiskLevel.LOW
    }
}

fun getRiskLevelName(level: RiskLevel): String {
    return when (level) {
        RiskLevel.LOW -> "低风险"
        RiskLevel.MEDIUM -> "中风险"
        RiskLevel.HIGH -> "高风险"
        RiskLevel.CRITICAL -> "严重风险"
    }
}

private fun formatTime(timestamp: Long): String {
    return try {
        val sdf = SimpleDateFormat("HH:mm", Locale.getDefault())
        sdf.format(Date(timestamp))
    } catch (e: Exception) {
        ""
    }
}
