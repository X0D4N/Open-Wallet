package org.openwallet.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun Ic(name: String, modifier: Modifier = Modifier, tint: Color = Color.Unspecified, size: Dp = 24.dp) =
    Icon(WalletIcons.get(name), null, modifier.size(size), tint = if (tint == Color.Unspecified) androidx.compose.material3.LocalContentColor.current else tint)

@Composable
fun WTopBar(title: String = "", onBack: (() -> Unit)? = null, backIcon: String = "back", actions: @Composable RowScope.() -> Unit = {}) {
    Row(Modifier.fillMaxWidth().statusBarsPadding().height(64.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        if (onBack != null) IconButton(onBack) { Ic(backIcon) } else Spacer(Modifier.width(12.dp))
        Text(title, Modifier.weight(1f).padding(start = 4.dp), style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
        actions()
    }
}

/** Round text wordmark in the provider's colours (no third-party logo artwork is bundled). */
@Composable
fun Logo(name: String, bg: Color, fg: Color = if (bg.luminance() > 0.45f) Color(0xFF1B1B1B) else Color.White, size: Dp = 40.dp) {
    val t = abbrev(name)
    val base = when { t.length <= 2 -> 15f; t.length <= 3 -> 13f; t.length <= 4 -> 11f; t.length <= 6 -> 9f; else -> 7.5f }
    Box(Modifier.size(size).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
        Text(t, color = fg, fontSize = (base * size.value / 40f).sp, fontWeight = FontWeight.ExtraBold, maxLines = 1)
    }
}

fun abbrev(name: String): String {
    val n = name.replace(Regex("\\(.*?\\)"), "").replace(Regex("gift card|card", RegexOption.IGNORE_CASE), "").trim()
    if (n.length <= 8) return n.ifEmpty { "?" }
    val words = n.split(Regex("[\\s·&-]+")).filter { it.isNotEmpty() && !it.lowercase().matches(Regex("of|the|and|de|la")) }
    if (words.size > 1 && words[0].length <= 7 && words[0].all { it.isUpperCase() || it.isDigit() }) return words[0]
    return words.take(3).joinToString("") { it.take(1) }.uppercase()
}

/** A grouped list like the reference Add-to-Wallet screens: 28dp outer corners, 4dp inner corners, 3dp gaps. */
@Composable
fun Group(modifier: Modifier = Modifier, content: @Composable GroupScope.() -> Unit) {
    val scope = GroupScope().apply { content() }
    Column(modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        scope.items.forEachIndexed { i, item ->
            val first = i == 0; val last = i == scope.items.lastIndex
            val shape = RoundedCornerShape(if (first) 28.dp else 4.dp, if (first) 28.dp else 4.dp, if (last) 28.dp else 4.dp, if (last) 28.dp else 4.dp)
            Box(Modifier.fillMaxWidth().clip(shape).background(MaterialTheme.colorScheme.surfaceContainerHigh)) { item() }
        }
    }
}

class GroupScope { val items = mutableListOf<@Composable () -> Unit>(); fun item(c: @Composable () -> Unit) { items += c } }

@Composable
fun GroupRow(title: String, sub: String = "", lead: @Composable () -> Unit, trailing: (@Composable () -> Unit)? = null, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).heightIn(min = 92.dp).padding(horizontal = 18.dp, vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) {
        lead()
        Column(Modifier.weight(1f).padding(start = 18.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp, lineHeight = 24.sp))
            if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp, lineHeight = 21.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        trailing?.invoke()
    }
}

@Composable
fun IconCircle(name: String, size: Dp = 52.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(MaterialTheme.colorScheme.secondaryContainer), contentAlignment = Alignment.Center) {
        Ic(name, tint = MaterialTheme.colorScheme.onSecondaryContainer)
    }
}

@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier, trailing: @Composable () -> Unit = {}) {
    Row(modifier.fillMaxWidth().padding(start = 24.dp, end = 12.dp, top = 22.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        trailing()
    }
}

@Composable
fun Display(text: String, modifier: Modifier = Modifier) =
    Text(text, modifier.padding(start = 24.dp, end = 24.dp, top = 8.dp, bottom = 20.dp), style = MaterialTheme.typography.headlineSmall.copy(fontSize = 34.sp, lineHeight = 42.sp))

@Composable
fun Notice(text: String, icon: String = "info", warn: Boolean = false, modifier: Modifier = Modifier) {
    val bg = if (warn) MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.55f) else MaterialTheme.colorScheme.surfaceContainer
    Row(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).clip(RoundedCornerShape(12.dp)).background(bg).padding(14.dp)) {
        Ic(icon, tint = if (warn) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.primary, size = 20.dp)
        Text(text, Modifier.padding(start = 12.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun SettingRow(icon: String, title: String, sub: String = "", enabled: Boolean = true, trailing: (@Composable () -> Unit)? = null, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = onClick).heightIn(min = 56.dp).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Ic(icon, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = if (enabled) 1f else 0.4f))
        Column(Modifier.weight(1f).padding(start = 16.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = if (enabled) 1f else 0.45f))
            if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        trailing?.invoke()
    }
}

@Composable
fun SwitchRow(icon: String, title: String, sub: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) =
    SettingRow(icon, title, sub, enabled, trailing = { Switch(checked, onChange, enabled = enabled) }) { onChange(!checked) }

@Composable
fun Field(
    value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier, error: String? = null, hint: String = "",
    keyboard: KeyboardType = KeyboardType.Text, upper: Boolean = false, secret: Boolean = false, singleLine: Boolean = true, minLines: Int = 1
) {
    OutlinedTextField(
        value, { onChange(if (upper) it.uppercase() else it) }, modifier.fillMaxWidth(), label = { Text(label) }, isError = error != null,
        supportingText = (error ?: hint.ifEmpty { null })?.let { { Text(it) } }, singleLine = singleLine, minLines = minLines,
        visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard, capitalization = if (upper) KeyboardCapitalization.Characters else KeyboardCapitalization.Sentences)
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Select(label: String, value: String, options: List<Pair<String, String>>, modifier: Modifier = Modifier, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(open, { open = it }, modifier.fillMaxWidth()) {
        OutlinedTextField(options.firstOrNull { it.first == value }?.second ?: value, {}, Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
            readOnly = true, label = { Text(label) }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(open) })
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (k, l) -> DropdownMenuItem({ Text(l) }, { open = false; onSelect(k) }) }
        }
    }
}

@Composable
fun SearchPill(value: String, onChange: (String) -> Unit, placeholder: String, onBack: (() -> Unit)?, modifier: Modifier = Modifier) {
    Surface(modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp).height(56.dp), shape = RoundedCornerShape(28.dp), color = MaterialTheme.colorScheme.surfaceContainerHighest) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (onBack != null) IconButton(onBack) { Ic("back") } else Ic("search", Modifier.padding(start = 16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            androidx.compose.foundation.text.BasicTextField(
                value, onChange, Modifier.weight(1f).padding(start = 8.dp, end = 16.dp), singleLine = true,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface, fontSize = 18.sp),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(MaterialTheme.colorScheme.primary),
                decorationBox = { inner -> Box { if (value.isEmpty()) Text(placeholder, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 18.sp, maxLines = 1); inner() } }
            )
        }
    }
}

@Composable
fun ChipRow(options: List<Pair<String, String>>, selected: String, modifier: Modifier = Modifier, onSelect: (String) -> Unit) {
    LazyRow(modifier, contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(options) { (k, l) -> FilterChip(selected == k, { onSelect(k) }, { Text(l) }) }
    }
}

@Composable
fun RadioDialog(title: String, options: List<Pair<String, String>>, current: String, onDismiss: () -> Unit, onPick: (String) -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text(title) }, text = {
        Column { options.forEach { (k, l) ->
            Row(Modifier.fillMaxWidth().clickable { onPick(k) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                RadioButton(current == k, { onPick(k) }); Text(l)
            }
        } }
    }, confirmButton = { TextButton(onDismiss) { Text("Close") } })
}

@Composable
fun ConfirmDialog(title: String, text: String, confirm: String, danger: Boolean = false, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text(title) }, text = { Text(text) },
        confirmButton = { TextButton({ onDismiss(); onConfirm() }) { Text(confirm, color = if (danger) MaterialTheme.colorScheme.error else Color.Unspecified) } },
        dismissButton = { TextButton(onDismiss) { Text("Cancel") } })
}
