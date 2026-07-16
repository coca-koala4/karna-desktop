package com.karna.android.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf

private val LightColorScheme = lightColorScheme(
    primary = LightColorFamily.primary,
    onPrimary = LightColorFamily.onPrimary,
    primaryContainer = LightColorFamily.primaryContainer,
    onPrimaryContainer = LightColorFamily.onPrimaryContainer,
    secondary = LightColorFamily.secondary,
    onSecondary = LightColorFamily.onSecondary,
    secondaryContainer = LightColorFamily.secondaryContainer,
    onSecondaryContainer = LightColorFamily.onSecondaryContainer,
    tertiary = LightColorFamily.tertiary,
    onTertiary = LightColorFamily.onTertiary,
    tertiaryContainer = LightColorFamily.tertiaryContainer,
    onTertiaryContainer = LightColorFamily.onTertiaryContainer,
    error = LightColorFamily.error,
    onError = LightColorFamily.onError,
    errorContainer = LightColorFamily.errorContainer,
    onErrorContainer = LightColorFamily.onErrorContainer,
    background = LightColorFamily.background,
    onBackground = LightColorFamily.onBackground,
    surface = LightColorFamily.surface,
    onSurface = LightColorFamily.onSurface,
    surfaceVariant = LightColorFamily.surfaceVariant,
    onSurfaceVariant = LightColorFamily.onSurfaceVariant,
    outline = LightColorFamily.outline,
    outlineVariant = LightColorFamily.outlineVariant
)

private val DarkColorScheme = darkColorScheme(
    primary = DarkColorFamily.primary,
    onPrimary = DarkColorFamily.onPrimary,
    primaryContainer = DarkColorFamily.primaryContainer,
    onPrimaryContainer = DarkColorFamily.onPrimaryContainer,
    secondary = DarkColorFamily.secondary,
    onSecondary = DarkColorFamily.onSecondary,
    secondaryContainer = DarkColorFamily.secondaryContainer,
    onSecondaryContainer = DarkColorFamily.onSecondaryContainer,
    tertiary = DarkColorFamily.tertiary,
    onTertiary = DarkColorFamily.onTertiary,
    tertiaryContainer = DarkColorFamily.tertiaryContainer,
    onTertiaryContainer = DarkColorFamily.onTertiaryContainer,
    error = DarkColorFamily.error,
    onError = DarkColorFamily.onError,
    errorContainer = DarkColorFamily.errorContainer,
    onErrorContainer = DarkColorFamily.onErrorContainer,
    background = DarkColorFamily.background,
    onBackground = DarkColorFamily.onBackground,
    surface = DarkColorFamily.surface,
    onSurface = DarkColorFamily.onSurface,
    surfaceVariant = DarkColorFamily.surfaceVariant,
    onSurfaceVariant = DarkColorFamily.onSurfaceVariant,
    outline = DarkColorFamily.outline,
    outlineVariant = DarkColorFamily.outlineVariant
)

val LocalColorFamily = staticCompositionLocalOf { LightColorFamily }

@Composable
fun KarnaTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    val colorFamily = if (darkTheme) DarkColorFamily else LightColorFamily

    CompositionLocalProvider(
        LocalColorFamily provides colorFamily
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = KarnaTypography,
            shapes = KarnaShapes,
            content = content
        )
    }
}
