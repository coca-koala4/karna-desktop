package com.karna.android.core.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument

@Composable
fun KarnaNavHost(
    navController: NavHostController,
    modifier: Modifier = Modifier,
    startDestination: String = NavRoutes.WELCOME,
    welcomeRoute: @Composable () -> Unit = {},
    pairQrScanRoute: @Composable () -> Unit = {},
    pairSasConfirmRoute: @Composable () -> Unit = {},
    projectsRoute: @Composable () -> Unit = {},
    conversationsRoute: @Composable (String?) -> Unit = {},
    conversationDetailRoute: @Composable (String) -> Unit = {},
    runsRoute: @Composable () -> Unit = {},
    runDetailRoute: @Composable (String) -> Unit = {},
    filesRoute: @Composable () -> Unit = {},
    fileDetailRoute: @Composable (String) -> Unit = {},
    devicesRoute: @Composable () -> Unit = {},
    devicePairingRoute: @Composable () -> Unit = {},
    deviceDetailRoute: @Composable (String) -> Unit = {},
    settingsRoute: @Composable () -> Unit = {}
) {
    NavHost(
        navController = navController,
        startDestination = startDestination,
        modifier = modifier
    ) {
        composable(route = NavRoutes.WELCOME) {
            welcomeRoute()
        }
        composable(route = NavRoutes.PAIR_QR_SCAN) {
            pairQrScanRoute()
        }
        composable(route = NavRoutes.PAIR_SAS_CONFIRM) {
            pairSasConfirmRoute()
        }
        composable(route = NavRoutes.PROJECTS) {
            projectsRoute()
        }
        composable(
            route = NavRoutes.CONVERSATIONS,
            arguments = listOf(
                navArgument("projectId") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                }
            )
        ) { backStackEntry ->
            val projectId = backStackEntry.arguments?.getString("projectId")
            conversationsRoute(projectId)
        }
        composable(
            route = NavRoutes.CONVERSATION_DETAIL,
            arguments = listOf(
                navArgument("conversationId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val conversationId = backStackEntry.arguments?.getString("conversationId") ?: return@composable
            conversationDetailRoute(conversationId)
        }
        composable(route = NavRoutes.RUNS) {
            runsRoute()
        }
        composable(
            route = NavRoutes.RUN_DETAIL,
            arguments = listOf(
                navArgument("runId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val runId = backStackEntry.arguments?.getString("runId") ?: return@composable
            runDetailRoute(runId)
        }
        composable(route = NavRoutes.FILES) {
            filesRoute()
        }
        composable(
            route = NavRoutes.FILE_PREVIEW,
            arguments = listOf(
                navArgument("fileId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val fileId = backStackEntry.arguments?.getString("fileId") ?: return@composable
            fileDetailRoute(fileId)
        }
        composable(route = NavRoutes.DEVICES) {
            devicesRoute()
        }
        composable(route = NavRoutes.DEVICE_PAIRING) {
            devicePairingRoute()
        }
        composable(
            route = NavRoutes.DEVICE_DETAIL,
            arguments = listOf(
                navArgument("deviceId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val deviceId = backStackEntry.arguments?.getString("deviceId") ?: return@composable
            deviceDetailRoute(deviceId)
        }
        composable(route = NavRoutes.SETTINGS) {
            settingsRoute()
        }
    }
}
