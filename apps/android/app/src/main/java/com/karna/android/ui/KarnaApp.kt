package com.karna.android.ui

import android.app.Activity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.PermanentNavigationDrawer
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.karna.android.R
import com.karna.android.core.designsystem.KarnaTheme
import com.karna.android.core.navigation.NavRoutes
import com.karna.android.ui.conversations.ConversationDetailScreen
import com.karna.android.ui.conversations.ConversationsScreen
import com.karna.android.ui.devices.DevicesScreen
import com.karna.android.ui.files.FilePreviewScreen
import com.karna.android.ui.files.FilesScreen
import com.karna.android.ui.interactions.InteractionDetailScreen
import com.karna.android.ui.interactions.InteractionsScreen
import com.karna.android.ui.modes.GoalScreen
import com.karna.android.ui.modes.LivingWorkScreen
import com.karna.android.ui.modes.PlanScreen
import com.karna.android.ui.pair.PairQrScanScreen
import com.karna.android.ui.pair.PairingViewModel
import com.karna.android.ui.pair.SasConfirmScreen
import com.karna.android.ui.pair.WelcomeScreen
import com.karna.android.ui.projects.ProjectsScreen
import com.karna.android.ui.runs.RunDetailScreen
import com.karna.android.ui.runs.RunsScreen

enum class AppTopLevelDestination(
    val route: String,
    val labelRes: Int,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector
) {
    PROJECTS(
        route = NavRoutes.PROJECTS,
        labelRes = R.string.nav_projects,
        selectedIcon = Icons.Filled.FolderOpen,
        unselectedIcon = Icons.Outlined.FolderOpen
    ),
    CONVERSATIONS(
        route = NavRoutes.conversations(),
        labelRes = R.string.nav_conversations,
        selectedIcon = Icons.Filled.ChatBubbleOutline,
        unselectedIcon = Icons.Outlined.ChatBubbleOutline
    ),
    RUNS(
        route = NavRoutes.RUNS,
        labelRes = R.string.nav_runs,
        selectedIcon = Icons.Filled.PlayArrow,
        unselectedIcon = Icons.Outlined.PlayArrow
    ),
    FILES(
        route = NavRoutes.FILES,
        labelRes = R.string.nav_files,
        selectedIcon = Icons.Filled.Description,
        unselectedIcon = Icons.Outlined.Description
    ),
    INTERACTIONS(
        route = NavRoutes.INTERACTIONS,
        labelRes = R.string.nav_interactions,
        selectedIcon = Icons.Filled.Notifications,
        unselectedIcon = Icons.Outlined.Notifications
    ),
    DEVICES(
        route = NavRoutes.DEVICES,
        labelRes = R.string.nav_devices,
        selectedIcon = Icons.Filled.Computer,
        unselectedIcon = Icons.Outlined.Computer
    );

    companion object {
        fun fromRoute(route: String?): AppTopLevelDestination? {
            return entries.find { dest ->
                route?.startsWith(dest.route.substringBefore("?")) == true
            }
        }

        fun isTopLevelRoute(route: String?): Boolean {
            return entries.any { dest ->
                route?.startsWith(dest.route.substringBefore("?")) == true
            }
        }

        fun allItems(): List<AppTopLevelDestination> = entries.toList()
    }
}

@OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
@Composable
fun KarnaApp(
    isPaired: Boolean = false
) {
    KarnaTheme {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            val activity = LocalContext.current as? Activity
            val navController = rememberNavController()
            val navBackStackEntry by navController.currentBackStackEntryAsState()
            val currentRoute = navBackStackEntry?.destination?.route
            val windowSizeClass = if (activity != null) {
                calculateWindowSizeClass(activity)
            } else {
                null
            }

            val useNavigationRail = windowSizeClass?.widthSizeClass == WindowWidthSizeClass.Medium
            val usePermanentDrawer = windowSizeClass?.widthSizeClass?.let { it >= WindowWidthSizeClass.Expanded } == true
            val useTwoPane = windowSizeClass?.widthSizeClass?.let { it >= WindowWidthSizeClass.Medium } == true

            var selectedProjectId by rememberSaveable { mutableStateOf<String?>(null) }

            LaunchedEffect(isPaired) {
                if (isPaired && currentRoute == NavRoutes.WELCOME) {
                    navController.navigate(NavRoutes.PROJECTS) {
                        popUpTo(NavRoutes.WELCOME) { inclusive = true }
                    }
                }
            }

            val navigateToTopLevel: (AppTopLevelDestination) -> Unit = { destination ->
                navController.navigate(destination.route) {
                    popUpTo(navController.graph.findStartDestination().id) {
                        saveState = true
                    }
                    launchSingleTop = true
                    restoreState = true
                }
            }

            val showBottomNav = AppTopLevelDestination.isTopLevelRoute(currentRoute) &&
                !currentRoute?.startsWith("conversation/").let { it ?: false } &&
                !currentRoute?.startsWith("run/").let { it ?: false } &&
                !currentRoute?.startsWith("file/").let { it ?: false } &&
                !currentRoute?.startsWith("interaction/").let { it ?: false } &&
                windowSizeClass?.widthSizeClass == WindowWidthSizeClass.Compact

            val content: @Composable () -> Unit = {
                AppNavHost(
                    navController = navController,
                    startDestination = if (isPaired) NavRoutes.PROJECTS else NavRoutes.WELCOME,
                    useTwoPane = useTwoPane,
                    selectedProjectId = selectedProjectId,
                    onProjectSelected = { selectedProjectId = it }
                )
            }

            when {
                usePermanentDrawer -> {
                    PermanentNavigationDrawer(
                        drawerContent = {
                            NavigationDrawerContent(
                                currentRoute = currentRoute,
                                onNavigateToTopLevel = navigateToTopLevel
                            )
                        }
                    ) {
                        Box(modifier = Modifier.fillMaxSize()) {
                            content()
                        }
                    }
                }
                useNavigationRail && AppTopLevelDestination.isTopLevelRoute(currentRoute) -> {
                    Row(modifier = Modifier.fillMaxSize()) {
                        NavigationRail {
                            AppTopLevelDestination.allItems().forEach { destination ->
                                val isSelected = AppTopLevelDestination.fromRoute(currentRoute) == destination
                                val label = stringResource(destination.labelRes)
                                NavigationRailItem(
                                    icon = {
                                        Icon(
                                            imageVector = if (isSelected) destination.selectedIcon else destination.unselectedIcon,
                                            contentDescription = label
                                        )
                                    },
                                    label = { Text(label) },
                                    selected = isSelected,
                                    onClick = { navigateToTopLevel(destination) },
                                    modifier = Modifier.semantics { contentDescription = label }
                                )
                            }
                        }
                        Box(modifier = Modifier.fillMaxSize()) {
                            content()
                        }
                    }
                }
                else -> {
                    Scaffold(
                        bottomBar = {
                            if (showBottomNav) {
                                NavigationBar {
                                    AppTopLevelDestination.allItems().forEach { destination ->
                                        val isSelected = AppTopLevelDestination.fromRoute(currentRoute) == destination
                                        val label = stringResource(destination.labelRes)
                                        NavigationBarItem(
                                            icon = {
                                                Icon(
                                                    imageVector = if (isSelected) destination.selectedIcon else destination.unselectedIcon,
                                                    contentDescription = label
                                                )
                                            },
                                            label = { Text(label) },
                                            selected = isSelected,
                                            onClick = { navigateToTopLevel(destination) },
                                            modifier = Modifier.semantics { contentDescription = label }
                                        )
                                    }
                                }
                            }
                        }
                    ) { innerPadding ->
                        Box(modifier = Modifier.padding(innerPadding)) {
                            content()
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NavigationDrawerContent(
    currentRoute: String?,
    onNavigateToTopLevel: (AppTopLevelDestination) -> Unit
) {
    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = stringResource(R.string.app_name),
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(vertical = 24.dp)
            )
            AppTopLevelDestination.allItems().forEach { destination ->
                val isSelected = AppTopLevelDestination.fromRoute(currentRoute) == destination
                val label = stringResource(destination.labelRes)
                NavigationRailItem(
                    icon = {
                        Icon(
                            imageVector = if (isSelected) destination.selectedIcon else destination.unselectedIcon,
                            contentDescription = label
                        )
                    },
                    label = { Text(label) },
                    selected = isSelected,
                    onClick = { onNavigateToTopLevel(destination) },
                    modifier = Modifier.semantics { contentDescription = label }
                )
            }
        }
    }
}

@Composable
private fun AppNavHost(
    navController: androidx.navigation.NavHostController,
    startDestination: String,
    useTwoPane: Boolean,
    selectedProjectId: String?,
    onProjectSelected: (String?) -> Unit
) {
    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable(NavRoutes.WELCOME) {
            val viewModel: PairingViewModel = hiltViewModel()
            WelcomeScreen(
                onStartPairing = {
                    viewModel.startPairing()
                    navController.navigate(NavRoutes.PAIR_QR_SCAN)
                },
                viewModel = viewModel
            )
        }
        composable(NavRoutes.PAIR_QR_SCAN) {
            val viewModel: PairingViewModel = hiltViewModel()
            PairQrScanScreen(
                onQrScanned = { qrContent -> viewModel.onQrCodeScanned(qrContent) },
                onBack = {
                    viewModel.goBack()
                    navController.popBackStack()
                },
                viewModel = viewModel,
                onSasReady = { navController.navigate(NavRoutes.PAIR_SAS_CONFIRM) }
            )
        }
        composable(NavRoutes.PAIR_SAS_CONFIRM) {
            val viewModel: PairingViewModel = hiltViewModel()
            SasConfirmScreen(
                onConfirm = { viewModel.confirmSasCode() },
                onReject = {
                    viewModel.rejectSasCode()
                    navController.popBackStack(NavRoutes.PAIR_QR_SCAN, false)
                },
                onBack = {
                    viewModel.goBack()
                    navController.popBackStack()
                },
                onPairingComplete = {
                    navController.navigate(NavRoutes.PROJECTS) {
                        popUpTo(NavRoutes.WELCOME) { inclusive = true }
                    }
                },
                viewModel = viewModel
            )
        }
        composable(NavRoutes.PROJECTS) {
            ProjectsScreen(
                onProjectClick = { projectId ->
                    onProjectSelected(projectId)
                    if (!useTwoPane) {
                        navController.navigate(NavRoutes.conversations(projectId))
                    }
                },
                selectedProjectId = if (useTwoPane) selectedProjectId else null,
                useTwoPane = useTwoPane
            )
        }
        composable(
            route = NavRoutes.CONVERSATIONS,
            arguments = listOf(
                androidx.navigation.navArgument("projectId") {
                    type = androidx.navigation.NavType.StringType
                    nullable = true
                    defaultValue = null
                }
            )
        ) {
            ConversationsScreen(
                onConversationClick = { conversationId ->
                    if (!useTwoPane) {
                        navController.navigate(NavRoutes.conversationDetail(conversationId))
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }
        composable(
            route = NavRoutes.CONVERSATION_DETAIL,
            arguments = listOf(
                androidx.navigation.navArgument("conversationId") {
                    type = androidx.navigation.NavType.StringType
                }
            )
        ) {
            ConversationDetailScreen(
                onBack = {
                    navController.popBackStack()
                }
            )
        }
        composable(NavRoutes.RUNS) {
            RunsScreen(
                onRunClick = { runId ->
                    if (!useTwoPane) {
                        navController.navigate(NavRoutes.runDetail(runId))
                    }
                }
            )
        }
        composable(
            route = NavRoutes.RUN_DETAIL,
            arguments = listOf(
                androidx.navigation.navArgument("runId") {
                    type = androidx.navigation.NavType.StringType
                }
            )
        ) { entry ->
            val runId = entry.arguments?.getString("runId")
            if (runId != null) {
                RunDetailScreen(
                    runId = runId,
                    onBack = {
                        navController.popBackStack()
                    }
                )
            }
        }
        composable(NavRoutes.FILES) {
            FilesScreen(
                onFileClick = { fileId ->
                    if (!useTwoPane) {
                        navController.navigate(NavRoutes.filePreview(fileId))
                    }
                }
            )
        }
        composable(
            route = NavRoutes.FILE_PREVIEW,
            arguments = listOf(
                androidx.navigation.navArgument("fileId") {
                    type = androidx.navigation.NavType.StringType
                }
            )
        ) { entry ->
            val fileId = entry.arguments?.getString("fileId")
            if (fileId != null) {
                FilePreviewScreen(
                    fileId = fileId,
                    onBack = {
                        navController.popBackStack()
                    }
                )
            }
        }
        composable(NavRoutes.INTERACTIONS) {
            InteractionsScreen(
                onInteractionClick = { interactionId ->
                    if (!useTwoPane) {
                        navController.navigate(NavRoutes.interactionDetail(interactionId))
                    }
                }
            )
        }
        composable(
            route = NavRoutes.INTERACTION_DETAIL,
            arguments = listOf(
                androidx.navigation.navArgument("interactionId") {
                    type = androidx.navigation.NavType.StringType
                }
            )
        ) { entry ->
            val interactionId = entry.arguments?.getString("interactionId")
            if (interactionId != null) {
                InteractionDetailScreen(
                    interactionId = interactionId,
                    onBack = {
                        navController.popBackStack()
                    },
                    onApproved = {
                        navController.popBackStack()
                    },
                    onRejected = {
                        navController.popBackStack()
                    }
                )
            }
        }
        composable(NavRoutes.DEVICES) {
            DevicesScreen()
        }
        composable(NavRoutes.PLAN) {
            PlanScreen(
                onBack = { navController.popBackStack() }
            )
        }
        composable(NavRoutes.GOAL) {
            GoalScreen(
                onBack = { navController.popBackStack() }
            )
        }
        composable(NavRoutes.LIVING_WORK) {
            LivingWorkScreen(
                onBack = { navController.popBackStack() }
            )
        }
    }
}
