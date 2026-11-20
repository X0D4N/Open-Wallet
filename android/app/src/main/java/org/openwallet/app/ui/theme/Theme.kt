package org.openwallet.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Estimated Material 3 baseline palette (measured from the person's reference pictures where possible).
private val Light = lightColorScheme(
    primary = Color(0xFF0B57D0), onPrimary = Color.White,
    primaryContainer = Color(0xFFD3E3FD), onPrimaryContainer = Color(0xFF041E49),
    secondaryContainer = Color(0xFFD3E3FD), onSecondaryContainer = Color(0xFF0842A0),
    tertiary = Color(0xFF146C2E), tertiaryContainer = Color(0xFFC4EED0), onTertiaryContainer = Color(0xFF072711),
    background = Color.White, onBackground = Color(0xFF1F1F1F),
    surface = Color.White, onSurface = Color(0xFF1F1F1F),
    surfaceVariant = Color(0xFFE1E3E1), onSurfaceVariant = Color(0xFF444746),
    surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFF8FAFD),
    surfaceContainer = Color(0xFFF0F4F9), surfaceContainerHigh = Color(0xFFE9EEF6), surfaceContainerHighest = Color(0xFFDDE3EA),
    outline = Color(0xFF747775), outlineVariant = Color(0xFFC4C7C5),
    error = Color(0xFFB3261E), errorContainer = Color(0xFFF9DEDC), onErrorContainer = Color(0xFF410E0B),
    inverseSurface = Color(0xFF303030), inverseOnSurface = Color(0xFFF2F2F2), inversePrimary = Color(0xFFA8C7FA)
)

private val Dark = darkColorScheme(
    primary = Color(0xFFA8C7FA), onPrimary = Color(0xFF062E6F),
    primaryContainer = Color(0xFF0842A0), onPrimaryContainer = Color(0xFFD3E3FD),
    secondaryContainer = Color(0xFF004A77), onSecondaryContainer = Color(0xFFC2E7FF),
    tertiary = Color(0xFF6DD58C), tertiaryContainer = Color(0xFF0F5223), onTertiaryContainer = Color(0xFFC4EED0),
    background = Color(0xFF1F1F1F), onBackground = Color(0xFFE3E3E3),
    surface = Color(0xFF1F1F1F), onSurface = Color(0xFFE3E3E3),
    surfaceVariant = Color(0xFF444746), onSurfaceVariant = Color(0xFFC4C7C5),
    surfaceContainerLowest = Color(0xFF0E0E0E), surfaceContainerLow = Color(0xFF1B1B1B),
    surfaceContainer = Color(0xFF282A2C), surfaceContainerHigh = Color(0xFF333537), surfaceContainerHighest = Color(0xFF37393B),
    outline = Color(0xFF8E918F), outlineVariant = Color(0xFF444746),
    error = Color(0xFFF2B8B5), errorContainer = Color(0xFF8C1D18), onErrorContainer = Color(0xFFF9DEDC),
    inverseSurface = Color(0xFFE3E3E3), inverseOnSurface = Color(0xFF303030), inversePrimary = Color(0xFF0B57D0)
)

private val Type = Typography(
    headlineSmall = TextStyle(fontSize = 24.sp, lineHeight = 32.sp, fontWeight = FontWeight.Normal),
    titleLarge = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.Normal),
    titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.15.sp),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp, letterSpacing = 0.5.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.25.sp),
    labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.1.sp),
    labelMedium = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.5.sp)
)

@Composable
fun OpenWalletTheme(theme: String, content: @Composable () -> Unit) {
    val dark = when (theme) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = Type, content = content)
}

/** Brand colour for each card/pass style. */
object Styles {
    val all = listOf("coral", "ocean", "forest", "sky", "blue", "green", "red", "amber", "brown", "purple", "teal", "slate")
    fun color(style: String): Color = when (style) {
        "coral" -> Color(0xFFEA4335)
        "ocean" -> Color(0xFF0B57D0)
        "forest" -> Color(0xFF188038)
        "sky" -> Color(0xFF1A73E8)
        "blue" -> Color(0xFF3F51B5)
        "green" -> Color(0xFF1E8E3E)
        "red" -> Color(0xFFD93025)
        "amber" -> Color(0xFFF29900)
        "brown" -> Color(0xFF7B4A2D)
        "purple" -> Color(0xFF8E24AA)
        "teal" -> Color(0xFF00897B)
        else -> Color(0xFF5F6368)
    }

    fun cardBrush(style: String): Brush {
        val c = color(style)
        return Brush.linearGradient(listOf(lerp(c, Color.White, 0.12f), c, lerp(c, Color.Black, 0.25f)))
    }

    /** Pastel row tint for passes (light) or deep tint (dark), as in the reference pictures. */
    fun rowTint(style: String, dark: Boolean): Color =
        if (dark) lerp(Color(0xFF1F1F1F), color(style), 0.22f) else lerp(Color.White, color(style), 0.10f)
}
