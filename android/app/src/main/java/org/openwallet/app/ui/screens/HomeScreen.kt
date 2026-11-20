package org.openwallet.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.util.lerp
import kotlinx.coroutines.launch
import org.openwallet.app.data.Catalog
import org.openwallet.app.data.PassEntity
import org.openwallet.app.ui.WalletState
import org.openwallet.app.ui.art.CardArt
import org.openwallet.app.ui.art.FeaturedPass
import org.openwallet.app.ui.art.PassTile
import org.openwallet.app.ui.art.cardName
import org.openwallet.app.ui.components.ChipRow
import org.openwallet.app.ui.components.Ic
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.absoluteValue

val PASS_GROUPS = listOf(
    Triple("all", "All", emptyList()), Triple("travel", "Travel", listOf("flight", "train", "bus", "taxi", "ferry", "hotel", "parking")),
    Triple("tickets", "Tickets", listOf("movie", "event", "sports", "amusement", "entry")), Triple("loyalty", "Loyalty", listOf("loyalty")),
    Triple("gift", "Gift & purchases", listOf("gift", "purchase")), Triple("transit", "Transport", listOf("transit")), Triple("other", "Other", listOf("generic"))
)

fun sortedPasses(list: List<PassEntity>, mode: String, time: (PassEntity) -> Long?): List<PassEntity> {
    val now = System.currentTimeMillis() - 86_400_000L
    return list.sortedWith(Comparator { a, b ->
        if (a.favorite != b.favorite) return@Comparator if (a.favorite) -1 else 1
        if (mode == "recent") return@Comparator b.createdAt.compareTo(a.createdAt)
        val ta = time(a); val tb = time(b)
        val ua = ta != null && ta >= now; val ub = tb != null && tb >= now
        when { ua && ub -> ta!!.compareTo(tb!!); ua != ub -> if (ua) -1 else 1; else -> b.createdAt.compareTo(a.createdAt) }
    })
}

fun badgeFor(p: PassEntity): String {
    val d = runCatching { LocalDate.parse(p.f("date")) }.getOrNull() ?: return ""
    val days = ChronoUnit.DAYS.between(LocalDate.now(), d)
    return when { days < 0 -> "Date passed"; days == 0L -> "Today"; days == 1L -> "Tomorrow"; days < 7 -> "In $days days"; days < 14 -> d.format(java.time.format.DateTimeFormatter.ofPattern("MMM d")); else -> "" }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun HomeScreen(
    cat: Catalog, state: WalletState, docCount: Int, reduce: Boolean, time: (PassEntity) -> Long?,
    onOpenCard: (String) -> Unit, onOpenPass: (String) -> Unit, onPay: (String) -> Unit, onAdd: () -> Unit, onSearch: () -> Unit,
    onAccount: () -> Unit, onCards: () -> Unit, onVault: () -> Unit, onArchived: () -> Unit, onSamples: () -> Unit
) {
    val cards = state.cards
    val defaultIndex = cards.indexOfFirst { it.id == state.settings.defaultCardId }.coerceAtLeast(0)
    val pager = rememberPagerState(initialPage = defaultIndex) { cards.size }
    val scope = rememberCoroutineScope()
    val list = rememberLazyListState()
    var group by rememberSaveable { mutableStateOf("all") }
    val expanded by remember { derivedStateOf { list.firstVisibleItemIndex == 0 && list.firstVisibleItemScrollOffset < 120 } }
    val all = sortedPasses(state.passes.filter { !it.archived }, state.settings.sortPasses, time)
    val featured = if (state.settings.showNext) all.firstOrNull { p -> p.template in setOf("flight", "train", "bus", "taxi", "ferry", "movie", "event", "sports", "amusement", "entry", "hotel") &&
        time(p)?.let { it > System.currentTimeMillis() - 3 * 3_600_000L && it < System.currentTimeMillis() + 14 * 86_400_000L } == true } else null
    val members = PASS_GROUPS.first { it.first == group }.third
    val shown = all.filter { it != featured && (members.isEmpty() || it.template in members) }
    val archived = state.passes.count { it.archived }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(state = list, contentPadding = PaddingValues(bottom = 120.dp), modifier = Modifier.fillMaxSize()) {
            item {
                Row(Modifier.fillMaxWidth().statusBarsPadding().height(64.dp).padding(start = 20.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Wallet", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                    IconButton(onSearch, Modifier.semantics { contentDescription = "Search" }) { Ic("search") }
                    IconButton(onAccount, Modifier.semantics { contentDescription = "Settings" }) {
                        Box(Modifier.size(32.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) { Ic("settings", tint = MaterialTheme.colorScheme.onPrimaryContainer, size = 18.dp) }
                    }
                }
            }
            if (cards.isNotEmpty()) {
                item {
                    HorizontalPager(pager, contentPadding = PaddingValues(start = 16.dp, end = if (cards.size > 1) 44.dp else 16.dp), pageSpacing = 10.dp) { page ->
                        val off = ((pager.currentPage - page) + pager.currentPageOffsetFraction).absoluteValue.coerceIn(0f, 1f)
                        Box(Modifier.graphicsLayer { val s = lerp(1f, .93f, off); scaleX = s; scaleY = s; alpha = lerp(1f, .82f, off) }
                            .clickable { if (page == pager.currentPage) onOpenCard(cards[page].id) else scope.launch { if (reduce) pager.scrollToPage(page) else pager.animateScrollToPage(page) } }) {
                            CardArt(cat, cards[page])
                        }
                    }
                    if (cards.size > 1) Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.Center) {
                        cards.indices.forEach { i ->
                            val w by animateDpAsState(if (i == pager.currentPage) 16.dp else 6.dp, label = "dot")
                            Box(Modifier.padding(horizontal = 3.dp).height(6.dp).width(w).clip(RoundedCornerShape(3.dp))
                                .background(if (i == pager.currentPage) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.outlineVariant))
                        }
                    }
                    Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        val cur = cards.getOrNull(pager.currentPage)
                        Row(Modifier.clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).clickable { cur?.let { onPay(it.id) } }
                            .padding(start = 8.dp, end = 14.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(24.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) { Ic("contactless", tint = MaterialTheme.colorScheme.onPrimary, size = 16.dp) }
                            Text("Contactless payments: not set up", Modifier.padding(start = 8.dp), fontSize = 13.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        IconButton(onCards, Modifier.semantics { contentDescription = "All payment cards" }) { Ic("stack", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
            } else item {
                Column(Modifier.fillMaxWidth().padding(16.dp).clip(RoundedCornerShape(16.dp)).border(2.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp)).clickable(onClick = onAdd).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally) {
                    Ic("card", tint = MaterialTheme.colorScheme.primary, size = 40.dp)
                    Text("Add a payment card", Modifier.padding(top = 8.dp), style = MaterialTheme.typography.titleMedium)
                    Text("Shows the card’s design and last 4 digits. It can’t pay.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                }
            }
            featured?.let { f -> item { Spacer(Modifier.height(18.dp)); FeaturedPass(cat, f, badgeFor(f)) { onOpenPass(f.id) } } }
            item {
                Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 22.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Passes", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                    if (all.isNotEmpty()) TextButton(onSearch) { Text("Search") }
                }
                if (all.size > 2) ChipRow(PASS_GROUPS.filter { g -> g.third.isEmpty() || all.any { it.template in g.third } }.map { it.first to it.second }, group, Modifier.padding(vertical = 4.dp)) { group = it }
            }
            if (all.isEmpty()) item {
                Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Your passes show up here", style = MaterialTheme.typography.titleLarge)
                    Text("Add boarding passes, tickets, loyalty and gift cards. Everything stays on this phone.", Modifier.padding(top = 6.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(onAdd, Modifier.padding(top = 14.dp)) { Ic("add", size = 18.dp); Text("Add to Wallet", Modifier.padding(start = 8.dp)) }
                    TextButton(onSamples) { Text("Try it with sample passes") }
                }
            }
            shown.chunked(2).forEach { pair ->
                item(key = pair.first().id) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        pair.forEach { p -> PassTile(cat, p, badgeFor(p), { onOpenPass(p.id) }, Modifier.weight(1f)) }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
            item {
                Text("IDs & documents", Modifier.padding(start = 20.dp, top = 24.dp, bottom = 8.dp), style = MaterialTheme.typography.titleMedium)
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(20.dp)).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(20.dp))
                    .background(MaterialTheme.colorScheme.surfaceContainerLow).clickable(onClick = onVault).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(44.dp).clip(CircleShape).background(MaterialTheme.colorScheme.tertiaryContainer), contentAlignment = Alignment.Center) { Ic("lock", tint = MaterialTheme.colorScheme.onTertiaryContainer) }
                    Column(Modifier.weight(1f).padding(start = 14.dp)) {
                        Text("Identity & documents", style = MaterialTheme.typography.titleMedium)
                        Text((if (docCount > 0) "$docCount saved · " else "") + "Locked with your screen lock. Personal copies, not verified IDs", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Ic("chevron", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (archived > 0) Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { TextButton(onArchived, Modifier.padding(top = 12.dp)) { Text("Archived passes ($archived)") } }
            }
        }
        ExtendedFloatingActionButton(onClick = onAdd, expanded = expanded, icon = { Ic("add") }, text = { Text("Add to Wallet") },
            modifier = Modifier.align(Alignment.BottomEnd).navigationBarsPadding().padding(16.dp).semantics { contentDescription = "Add to Wallet" }, containerColor = MaterialTheme.colorScheme.primaryContainer)
    }
}
