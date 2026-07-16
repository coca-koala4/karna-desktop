package com.karna.android.core.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.ui.graphics.vector.ImageVector
import com.karna.android.core.designsystem.component.NavigationItem
import com.karna.android.core.designsystem.component.RailItem

enum class TopLevelDestination(
    val route: String,
    val label: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector
) {
    PROJECTS(
        route = NavRoutes.PROJECTS,
        label = "项目",
        selectedIcon = Icons.Filled.FolderOpen,
        unselectedIcon = Icons.Filled.FolderOpen
    ),
    CONVERSATIONS(
        route = NavRoutes.CONVERSATIONS,
        label = "对话",
        selectedIcon = Icons.Filled.ChatBubbleOutline,
        unselectedIcon = Icons.Filled.ChatBubbleOutline
    ),
    RUNS(
        route = NavRoutes.RUNS,
        label = "运行",
        selectedIcon = Icons.Filled.PlayArrow,
        unselectedIcon = Icons.Filled.PlayArrow
    ),
    FILES(
        route = NavRoutes.FILES,
        label = "文件",
        selectedIcon = Icons.Filled.Description,
        unselectedIcon = Icons.Filled.Description
    ),
    DEVICES(
        route = NavRoutes.DEVICES,
        label = "设备",
        selectedIcon = Icons.Filled.Computer,
        unselectedIcon = Icons.Filled.Computer
    );

    fun toNavigationItem(): NavigationItem = NavigationItem(
        label = label,
        icon = unselectedIcon,
        selectedIcon = selectedIcon,
        route = route
    )

    fun toRailItem(): RailItem = RailItem(
        label = label,
        icon = unselectedIcon,
        selectedIcon = selectedIcon,
        route = route
    )

    companion object {
        fun fromRoute(route: String?): TopLevelDestination? {
            return entries.find { it.route == route }
        }

        fun allItems(): List<TopLevelDestination> = entries.toList()
    }
}
