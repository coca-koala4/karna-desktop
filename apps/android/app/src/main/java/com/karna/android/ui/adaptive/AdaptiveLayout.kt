package com.karna.android.ui.adaptive

import androidx.activity.compose.BackHandler
import androidx.compose.material3.adaptive.ExperimentalMaterial3AdaptiveApi
import androidx.compose.material3.adaptive.layout.AnimatedPane
import androidx.compose.material3.adaptive.layout.ListDetailPaneScaffold
import androidx.compose.material3.adaptive.layout.ListDetailPaneScaffoldRole
import androidx.compose.material3.adaptive.layout.PaneAdaptedValue
import androidx.compose.material3.adaptive.layout.ThreePaneScaffoldRole
import androidx.compose.material3.adaptive.navigation.rememberListDetailPaneScaffoldNavigator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Composable
fun <T> KarnaListDetailPane(
    listPane: @Composable (onItemSelected: (T) -> Unit, selectedItem: T?) -> Unit,
    detailPane: @Composable (selectedItem: T, onBack: () -> Unit) -> Unit,
    noDetailPane: @Composable () -> Unit = {},
    modifier: Modifier = Modifier,
    initialSelectedItem: T? = null,
    keyExtractor: (T) -> String = { it.hashCode().toString() }
) {
    val navigator = rememberListDetailPaneScaffoldNavigator<T>()
    var selectedItemKey by rememberSaveable { mutableStateOf<String?>(initialSelectedItem?.let(keyExtractor)) }
    var selectedItem by rememberSaveable { mutableStateOf(initialSelectedItem) }

    BackHandler(navigator.canNavigateBack()) {
        navigator.navigateBack()
        selectedItem = null
        selectedItemKey = null
    }

    ListDetailPaneScaffold(
        directive = navigator.scaffoldDirective,
        value = navigator.scaffoldValue,
        modifier = modifier,
        listPane = {
            AnimatedPane {
                listPane(
                    { item ->
                        selectedItem = item
                        selectedItemKey = keyExtractor(item)
                        navigator.navigateTo(ListDetailPaneScaffoldRole.Detail, item)
                    },
                    selectedItem
                )
            }
        },
        detailPane = {
            AnimatedPane {
                val isDetailVisible = navigator.scaffoldValue[ListDetailPaneScaffoldRole.Detail] == PaneAdaptedValue.Expanded
                val currentItem = selectedItem
                if (currentItem != null && isDetailVisible) {
                    detailPane(
                        currentItem,
                        {
                            navigator.navigateBack()
                            selectedItem = null
                            selectedItemKey = null
                        }
                    )
                } else {
                    noDetailPane()
                }
            }
        }
    )
}

@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Composable
fun <T> KarnaListDetailPaneWithExtra(
    listPane: @Composable (onItemSelected: (T) -> Unit, selectedItem: T?) -> Unit,
    detailPane: @Composable (selectedItem: T, onBack: () -> Unit, showExtraPane: Boolean) -> Unit,
    extraPane: @Composable (selectedItem: T?) -> Unit = {},
    noDetailPane: @Composable () -> Unit = {},
    modifier: Modifier = Modifier,
    initialSelectedItem: T? = null,
    keyExtractor: (T) -> String = { it.hashCode().toString() }
) {
    val navigator = rememberListDetailPaneScaffoldNavigator<T>()
    var selectedItemKey by rememberSaveable { mutableStateOf<String?>(initialSelectedItem?.let(keyExtractor)) }
    var selectedItem by rememberSaveable { mutableStateOf(initialSelectedItem) }

    BackHandler(navigator.canNavigateBack()) {
        navigator.navigateBack()
        selectedItem = null
        selectedItemKey = null
    }

    val isListVisible = navigator.scaffoldValue[ListDetailPaneScaffoldRole.List] == PaneAdaptedValue.Expanded
    val isDetailVisible = navigator.scaffoldValue[ListDetailPaneScaffoldRole.Detail] == PaneAdaptedValue.Expanded
    val showExtraPane = isListVisible && isDetailVisible

    ListDetailPaneScaffold(
        directive = navigator.scaffoldDirective,
        value = navigator.scaffoldValue,
        modifier = modifier,
        listPane = {
            AnimatedPane {
                listPane(
                    { item ->
                        selectedItem = item
                        selectedItemKey = keyExtractor(item)
                        navigator.navigateTo(ListDetailPaneScaffoldRole.Detail, item)
                    },
                    selectedItem
                )
            }
        },
        detailPane = {
            AnimatedPane {
                val currentItem = selectedItem
                if (currentItem != null && isDetailVisible) {
                    detailPane(
                        currentItem,
                        {
                            navigator.navigateBack()
                            selectedItem = null
                            selectedItemKey = null
                        },
                        showExtraPane
                    )
                } else {
                    noDetailPane()
                }
            }
        },
        extraPane = if (showExtraPane) {
            {
                AnimatedPane {
                    extraPane(selectedItem)
                }
            }
        } else null
    )
}
