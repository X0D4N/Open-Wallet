package org.openwallet.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.WindowManager
import androidx.activity.SystemBarStyle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavBackStackEntry
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.launch
import org.openwallet.app.data.ActivityEntity
import org.openwallet.app.data.GoogleCalendar
import org.openwallet.app.data.StoredFile
import org.openwallet.app.domain.Money
import org.openwallet.app.ui.WalletViewModel
import org.openwallet.app.ui.screens.AboutScreen
import org.openwallet.app.ui.screens.AddScreen
import org.openwallet.app.ui.screens.ArchivedScreen
import org.openwallet.app.ui.screens.CalendarScreen
import org.openwallet.app.ui.screens.CardDetailScreen
import org.openwallet.app.ui.screens.CardFormScreen
import org.openwallet.app.ui.screens.CardsScreen
import org.openwallet.app.ui.screens.CodeViewer
import org.openwallet.app.ui.screens.DocDetailScreen
import org.openwallet.app.ui.screens.DocFormScreen
import org.openwallet.app.ui.screens.HomeScreen
import org.openwallet.app.ui.screens.IdsScreen
import org.openwallet.app.ui.screens.InfoSheet
import org.openwallet.app.ui.screens.OtherScreen
import org.openwallet.app.ui.screens.PassDetailScreen
import org.openwallet.app.ui.screens.PassFormScreen
import org.openwallet.app.ui.screens.ScanScreen
import org.openwallet.app.ui.screens.PaymentsNfcScreen
import org.openwallet.app.ui.screens.NfcReaderScreen
import androidx.compose.foundation.background
import androidx.compose.ui.graphics.Color
import org.openwallet.app.ui.screens.Prefill
import org.openwallet.app.ui.screens.ProvidersScreen
import org.openwallet.app.ui.screens.RegionSheet
import org.openwallet.app.ui.screens.ReviewScreen
import org.openwallet.app.ui.screens.SearchScreen
import org.openwallet.app.ui.screens.SettingsScreen
import org.openwallet.app.ui.screens.TemplatesScreen
import org.openwallet.app.ui.screens.VaultLockScreen
import org.openwallet.app.ui.screens.VaultScreen
import org.openwallet.app.ui.theme.OpenWalletTheme
import java.io.File

class MainActivity : FragmentActivity() {
    private val vm: WalletViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val state by vm.state.collectAsStateWithLifecycle()
            val dark = when (state.settings.theme) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
            LaunchedEffect(dark) {
                val t = android.graphics.Color.TRANSPARENT
                val style = if (dark) SystemBarStyle.dark(t) else SystemBarStyle.light(t, t)
                enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
            }
            OpenWalletTheme(state.settings.theme) { WalletApp(this, vm) }
        }
    }

    fun canAuthenticate() = BiometricManager.from(this).canAuthenticate(BIOMETRIC_WEAK or DEVICE_CREDENTIAL) == BiometricManager.BIOMETRIC_SUCCESS

    /** Fingerprint, face or the phone's screen lock. */
    fun authenticate(title: String, onSuccess: () -> Unit) {
        val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = onSuccess()
        })
        prompt.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle(title).setSubtitle("Open Wallet document vault").setAllowedAuthenticators(BIOMETRIC_WEAK or DEVICE_CREDENTIAL).build())
    }

    fun fileName(uri: Uri): String = runCatching {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
    }.getOrNull() ?: "file"

    fun openWith(file: File, mime: String) {
        val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
        runCatching { startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)) }
            .onFailure { vm.notify("No app on this phone can open this file") }
    }

    fun openUrl(url: String) { runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }.onFailure { vm.notify("No browser found") } }
}

private val EMPHASIZED = CubicBezierEasing(0.2f, 0f, 0f, 1f)
private const val DUR = 300

@Composable
fun WalletApp(act: MainActivity, vm: WalletViewModel) {
    val cat = vm.cat
    val state by vm.state.collectAsStateWithLifecycle()
    val vault by vm.vault.collectAsStateWithLifecycle()
    val cal by vm.calendar.collectAsStateWithLifecycle()
    val message by vm.messages.collectAsStateWithLifecycle()
    val nav = rememberNavController()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var prefill by remember { mutableStateOf<Prefill?>(null) }
    var regionSheet by remember { mutableStateOf(false) }
    var info by remember { mutableStateOf<Pair<String, String>?>(null) }
    var chooseTemplateFor by remember { mutableStateOf<Prefill?>(null) }
    var activity by remember { mutableStateOf<ActivityEntity?>(null) }
    var docFileCallback by remember { mutableStateOf<((StoredFile) -> Unit)?>(null) }
    var exportFile by remember { mutableStateOf<StoredFile?>(null) }
    val reduce = state.settings.reduceMotion
    val d = if (reduce) 1 else DUR

    fun go(route: String) = nav.navigate(route) { launchSingleTop = true }
    fun back() { nav.popBackStack() }

    LaunchedEffect(message) {
        val m = message ?: return@LaunchedEffect
        vm.consumeMessage()
        val r = snackbar.showSnackbar(m.text, actionLabel = m.action ?: if (m.undo != null) "Undo" else null, duration = SnackbarDuration.Short)
        if (r == SnackbarResult.ActionPerformed) { if (m.undo != null) vm.runUndo(m) else m.onAction?.invoke() }
    }

    // The vault locks when the app goes to the background; screenshots are blocked while it's open.
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e ->
            if (e == Lifecycle.Event.ON_STOP && vm.vault.value.unlocked && !vm.externalFlow) vm.lockVault()
            if (e == Lifecycle.Event.ON_RESUME) vm.externalFlow = false
        }
        lifecycle.addObserver(obs); onDispose { lifecycle.removeObserver(obs) }
    }
    LaunchedEffect(vault.unlocked) {
        if (vault.unlocked) act.window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        else act.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }

    // ---- Activity results -------------------------------------------------------------------
    val consent = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { r ->
        when (val a = GoogleCalendar.fromConsent(act, r.data)) {
            is GoogleCalendar.Auth.Granted -> vm.calendarConnected(a.token)
            is GoogleCalendar.Auth.Failed -> vm.calendarError(a.message)
            else -> {}
        }
    }
    fun connectOrSync(interactive: Boolean) = scope.launch {
        when (val a = GoogleCalendar.authorize(act)) {
            is GoogleCalendar.Auth.Granted -> if (state.settings.calendarConnected) vm.sync(a.token) else vm.calendarConnected(a.token)
            is GoogleCalendar.Auth.NeedsConsent -> if (interactive) a.result.pendingIntent?.let { consent.launch(IntentSenderRequest.Builder(it.intentSender).build()) }
            is GoogleCalendar.Auth.Failed -> if (interactive) vm.calendarError(a.message)
        }
    }
    // Optional: sync when the app opens (never in the background), at most every 6 hours.
    LaunchedEffect(state.loading) {
        if (!state.loading && state.settings.calendarConnected && state.settings.calendarAutoSync && System.currentTimeMillis() - state.settings.calendarLastSync > 6 * 3_600_000L) connectOrSync(false)
    }

    var docPre by remember { mutableStateOf<Triple<org.openwallet.app.ui.DocPrefill, List<Pair<String, StoredFile>>, String>?>(null) }
    var analysing by remember { mutableStateOf(false) }

    /** Sends a recognised scan or import to the matching form. */
    fun handle(route: org.openwallet.app.ui.Route) {
        when (route) {
            is org.openwallet.app.ui.Route.Card -> { vm.cardPrefill = route.p; go("cardform") }
            is org.openwallet.app.ui.Route.Pass -> { prefill = route.p; go("passform/${route.p.template}") }
            is org.openwallet.app.ui.Route.Choose -> chooseTemplateFor = route.p
            is org.openwallet.app.ui.Route.Doc -> {
                val open = { scope.launch {
                    val files = route.p.images.mapIndexed { i, (side, bytes) -> side to vm.addDocImage(bytes, "Scan ${i + 1}.jpg") }
                    docPre = Triple(route.p, files, route.p.typeId); go("docform?type=${route.p.typeId}")
                } }
                if (vault.unlocked) open() else act.authenticate("Unlock to save this document") { vm.unlockVault(); open() }
            }
        }
    }
    fun afterImport(uri: Uri, name: String) = scope.launch {
        analysing = true
        vm.analyseFile(uri, name).onSuccess { handle(it) }.onFailure { vm.notify(it.message ?: "Couldn’t import that file") }
        analysing = false
    }
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let { afterImport(it, act.fileName(it)) } }
    val cameraFile = remember { File(act.cacheDir, "camera").apply { mkdirs() }.let { File(it, "photo.jpg") } }
    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        if (ok) scope.launch { afterImport(Uri.fromFile(cameraFile), "Camera photo.jpg").join(); cameraFile.writeBytes(ByteArray(cameraFile.length().toInt())); cameraFile.delete() }
    }
    var caps by remember { mutableStateOf(org.openwallet.app.nfc.NfcInfo.caps(act)) }
    val docFileLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val cb = docFileCallback; docFileCallback = null
        if (uri != null && cb != null) scope.launch { vm.addDocFile(uri, act.fileName(uri)).onSuccess(cb).onFailure { vm.notify(it.message ?: "Couldn’t add that file") } }
    }
    val exportDocLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        val f = exportFile; exportFile = null
        if (uri != null && f != null) runCatching { act.contentResolver.openOutputStream(uri, "wt")!!.use { it.write(vm.docFile(f.fileId)) } }
            .onSuccess { vm.notify("Saved an unencrypted copy. Keep it somewhere safe") }.onFailure { vm.notify("Couldn’t save the file") }
    }
    val backupOut = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { it?.let(vm::exportBackup) }
    val backupIn = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { it?.let(vm::importBackup) }
    val icsLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { it?.let { u -> vm.importIcs(u); go("review") } }

    fun openTemplate(template: String, providerId: String = "") { prefill = Prefill(template, providerId); go("passform/$template") }
    fun openDocType(typeId: String) {
        val t = cat.docType(typeId) ?: return
        if (t.official != null) info = t.name to "official:$typeId" else if (vault.unlocked) go("docform?type=$typeId") else act.authenticate("Unlock to add a document") { vm.unlockVault(); go("docform?type=$typeId") }
    }
    fun openCategory(id: String) {
        val c = cat.categories.first { it.id == id }
        when (c.route) {
            "form" -> if (c.template == "payment") go("cardform") else openTemplate(c.template ?: "generic")
            "providers" -> go("providers/${c.cat}?tpl=")
            "templates" -> go("templates/${c.id}")
            "ids" -> go("ids/${c.group}")
            "doc" -> c.doc?.let { openDocType(it) }
            "other" -> go("other")
        }
    }

    val enter: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = { slideInHorizontally(tween(d, easing = EMPHASIZED)) { it / 4 } + fadeIn(tween(d)) }
    val exit: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = { slideOutHorizontally(tween(d, easing = EMPHASIZED)) { -it / 4 } + fadeOut(tween(d / 2)) }
    val popEnter: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = { slideInHorizontally(tween(d, easing = EMPHASIZED)) { -it / 4 } + fadeIn(tween(d)) }
    val popExit: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = { slideOutHorizontally(tween(d, easing = EMPHASIZED)) { it / 4 } + fadeOut(tween(d / 2)) }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { Box(Modifier.fillMaxSize()) {
        if (state.loading) CircularProgressIndicator(Modifier.align(Alignment.Center))
        else NavHost(nav, "home", enterTransition = enter, exitTransition = exit, popEnterTransition = popEnter, popExitTransition = popExit) {
            composable("home") {
                HomeScreen(cat, state, vault.docs.size, reduce, vm::passTime, onOpenCard = { go("card/$it") }, onOpenPass = { go("pass/$it") },
                    onPay = { go("payments") }, onAdd = { go("add") }, onSearch = { go("search") },
                    onAccount = { go("settings") }, onCards = { go("cards") }, onVault = { go("vault") }, onArchived = { go("archived") }, onSamples = vm::addSamples)
            }
            composable("card/{id}") { e -> val id = e.arguments?.getString("id") ?: return@composable
                CardDetailScreen(cat, state, id, ::back, onPay = { go("payments") }, onEdit = { go("cardform?id=$id") },
                    onSetDefault = { vm.setDefault(id) }, onRemove = { nav.popBackStack("home", false); vm.removeCard(id) }, onActivity = { activity = it }, authenticate = act::authenticate)
            }
            composable("cards") { CardsScreen(cat, state, ::back, { go("card/$it") }, { go("cardform") }, vm::moveCard) }
            composable("cardform?id={id}") { e ->
                val id = e.arguments?.getString("id")
                val pre = remember { if (id == null) vm.cardPrefill.also { vm.cardPrefill = null } else null }
                CardFormScreen(cat, state, id, ::back, pre) { c, isNew, prefix -> vm.saveCard(c, isNew, prefix); if (isNew) nav.popBackStack("home", false) else back() }
            }
            composable("scan/{mode}") { e ->
                val mode = e.arguments?.getString("mode") ?: "card"
                ScanScreen(mode, state.settings.autoCapture, ::back, { back(); importLauncher.launch(arrayOf("image/*")) }) { out ->
                    back()
                    scope.launch { analysing = true; runCatching { vm.analyseScan(out) }.onSuccess { handle(it) }.onFailure { vm.notify("Couldn’t read that scan. Try again or enter it yourself") }; analysing = false }
                }
            }
            composable("payments") {
                LaunchedEffect(Unit) { caps = org.openwallet.app.nfc.NfcInfo.caps(act) }
                PaymentsNfcScreen(act, caps, ::back, { go("nfcreader") }, { caps = org.openwallet.app.nfc.NfcInfo.caps(act) }, act::authenticate)
            }
            composable("nfcreader") {
                NfcReaderScreen(act, ::back) { r ->
                    prefill = Prefill("generic", fields = mapOf("title" to "NFC tag", "notes" to r.records.joinToString("\n") { "${it.first}: ${it.second}" }), source = "import",
                        note = "Read from an NFC tag. Reading a tag doesn’t make this pass work with NFC readers.")
                    back(); go("passform/generic")
                }
            }
            composable("pass/{id}") { e -> val id = e.arguments?.getString("id") ?: return@composable
                PassDetailScreen(cat, state, id, ::back, onEdit = { state.pass(id)?.let { go("passform/${it.template}?id=$id") } }, onCode = { go("code/$id") },
                    onOriginal = { state.pass(id)?.let { p -> runCatching { act.openWith(vm.originals.tempCopy(p.originalFile, p.originalName.ifEmpty { "original" }), p.originalMime) }.onFailure { vm.notify("The original file is missing") } } },
                    onFavorite = { vm.toggleFavorite(id) }, onArchive = { vm.setArchived(id, it) }, onDelete = { nav.popBackStack(); vm.deletePass(id) },
                    onSetBalance = { vm.setFields(id, mapOf("balance" to it)) }, onAddValue = { vm.addTransitValue(id, it) }, onActivity = { activity = it })
            }
            composable("code/{id}") { e -> state.pass(e.arguments?.getString("id") ?: "")?.let { CodeViewer(cat, it, ::back) } }
            composable("passform/{template}?id={id}") { e ->
                val template = e.arguments?.getString("template") ?: "generic"
                val id = e.arguments?.getString("id")
                val pf = remember { prefill?.takeIf { it.template == template } ?: Prefill(template) }
                PassFormScreen(cat, state, id, pf, ::back) { p, isNew ->
                    vm.savePass(p, isNew)
                    if (p.source == "calendar") vm.proposalDone(p.sourceRef)
                    prefill = null
                    if (isNew && p.source == "calendar") back() else if (isNew) nav.popBackStack("home", false) else back()
                }
            }
            composable("add") {
                AddScreen(cat, state, ::back, { info = "Adding to Wallet" to HELP }, { regionSheet = true }, ::openCategory, { t, p -> openTemplate(t, p) }, ::openDocType,
                    onScanCard = { go("scan/card") }, onScanCode = { go("scan/code") }, onImage = { importLauncher.launch(arrayOf("image/*")) },
                    onPdf = { importLauncher.launch(arrayOf("application/pdf")) }, onCalendar = { go("calendar") })
            }
            composable("templates/{cat}") { e -> TemplatesScreen(cat, e.arguments?.getString("cat") ?: "tickets", ::back, { k ->
                val pc = cat.template(k).providerCat
                if (pc != null && cat.providers(pc).isNotEmpty()) go("providers/$pc?tpl=$k") else openTemplate(k) }) { openTemplate("generic") } }
            composable("providers/{cat}?tpl={tpl}") { e ->
                val pc = e.arguments?.getString("cat") ?: "loyalty"
                val tpl = e.arguments?.getString("tpl").orEmpty().ifEmpty { if (pc == "gift") "gift" else pc }
                ProvidersScreen(cat, state, pc, ::back, { info = "How suggestions are chosen" to "Suggestions come from the region you picked, not from your location. Change it any time in Settings." },
                    { openTemplate(tpl, it) }) { openTemplate(tpl) }
            }
            composable("other") {
                OtherScreen(::back, { importLauncher.launch(arrayOf("image/*", "application/pdf")) },
                    { cameraLauncher.launch(FileProvider.getUriForFile(act, "${act.packageName}.files", cameraFile)) }, { openTemplate("generic") }, { icsLauncher.launch(arrayOf("text/calendar", "*/*")) })
            }
            composable("search") { SearchScreen(cat, state, vm::passTime, ::back, { go("card/$it") }, { go("pass/$it") }) }
            composable("settings") {
                SettingsScreen(cat, state, vm, { go(it) }, ::back, { regionSheet = true }, { backupOut.launch("open-wallet-backup.json") },
                    { backupIn.launch(arrayOf("application/json", "*/*")) }, { icsLauncher.launch(arrayOf("text/calendar", "*/*")) })
            }
            composable("calendar") {
                CalendarScreen(state, cal, ::back, { connectOrSync(true) }, { connectOrSync(true) }, vm::setCalendarAuto, vm::setCalendarOnRemoved, vm::disconnectCalendar,
                    vm::deleteCalendarPasses, { icsLauncher.launch(arrayOf("text/calendar", "*/*")) }, { info = "Google Calendar set-up" to CAL_SETUP })
            }
            composable("review") {
                ReviewScreen(cat, cal, ::back, { p ->
                    prefill = Prefill(p.booking.template, p.booking.provider ?: "", p.booking.fields, source = "calendar", sourceRef = p.ref,
                        note = "Found in “${p.title}”. Only details from the event are filled in. Check them and add anything missing.")
                    go("passform/${p.booking.template}")
                }, vm::ignoreProposal, vm::applyUpdate)
            }
            composable("archived") { ArchivedScreen(cat, state, ::back, { go("pass/$it") }) { vm.setArchived(it, false) } }
            composable("about") { AboutScreen(cat, ::back) }
            composable("vault") {
                if (!vault.unlocked) VaultLockScreen(act.canAuthenticate(), ::back) { act.authenticate("Unlock your documents") { vm.unlockVault() } }
                else VaultScreen(cat, state, vault, ::back, { vm.lockVault("Vault locked") }, { vm.touchVault(); go("ids/identity") }, { vm.touchVault(); go("doc/$it") }, vm::resetVault)
            }
            composable("ids/{group}") { e -> IdsScreen(cat, state, e.arguments?.getString("group") ?: "identity", ::back, { regionSheet = true }, ::openDocType) }
            composable("docform?type={type}&id={id}") { e ->
                if (!vault.unlocked) { LaunchedEffect(Unit) { nav.popBackStack() }; return@composable }
                val type = e.arguments?.getString("type")
                val pre = remember { docPre?.takeIf { it.third == type && e.arguments?.getString("id") == null }.also { docPre = null } }
                DocFormScreen(cat, vault, type, e.arguments?.getString("id"), state.settings.region, ::back,
                    { _, cb -> docFileCallback = cb; vm.touchVault(); vm.externalFlow = true; docFileLauncher.launch(arrayOf("image/*", "application/pdf")) },
                    pre?.first?.number ?: "", pre?.first?.holder ?: "", pre?.second ?: emptyList(), pre?.first?.note ?: "") { doc, removed ->
                    vm.saveDoc(doc, removed); back()
                }
            }
            composable("doc/{id}") { e -> val id = e.arguments?.getString("id") ?: return@composable
                if (!vault.unlocked) { LaunchedEffect(Unit) { nav.popBackStack("vault", false) }; return@composable }
                DocDetailScreen(cat, vault, id, ::back, { go("docform?id=$id") }, { on -> if (on) act.authenticate("Show document details") { vm.revealDoc(id, true) } else vm.revealDoc(id, false) },
                    { vm.toggleDocFavorite(id) }, { f -> if (f.mime == "application/pdf") { vm.externalFlow = true; act.openWith(vm.docTempFile(f.fileId, f.name), f.mime) } },
                    { runCatching { vm.docFile(it) }.getOrNull() }, { f -> exportFile = f; vm.externalFlow = true; exportDocLauncher.launch(f.name) }, { vm.deleteDoc(id); back() }, act::openUrl)
            }
        }
        if (analysing) Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .4f)), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator(); Text("Reading on this phone…", Modifier.padding(top = 12.dp), color = Color.White) }
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 80.dp))
    } }

    if (regionSheet) RegionSheet(cat, state.settings.region, { regionSheet = false }) { vm.setRegion(it); regionSheet = false }
    info?.let { (title, body) ->
        if (body.startsWith("official:")) {
            val t = cat.docType(body.removePrefix("official:"))!!
            AlertDialog({ info = null }, title = { Text(title) }, text = { Text("Keep a personal copy here (encrypted, not verified), or open the official website for the official digital version. Open Wallet doesn’t sign in for you.") },
                confirmButton = { TextButton({ info = null; if (vault.unlocked) go("docform?type=${t.id}") else act.authenticate("Unlock to add a document") { vm.unlockVault(); go("docform?type=${t.id}") } }) { Text("Keep a personal copy") } },
                dismissButton = { TextButton({ info = null; act.openUrl(t.official!!.url) }) { Text(t.official!!.label) } })
        } else InfoSheet(title, body) { info = null }
    }
    chooseTemplateFor?.let { pf ->
        AlertDialog({ chooseTemplateFor = null }, title = { Text("What is it?") }, text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                cat.templates.values.forEach { t -> Text(t.label, Modifier.fillMaxWidth().clickable { chooseTemplateFor = null; prefill = pf.copy(template = t.id); go("passform/${t.id}") }.padding(vertical = 12.dp)) }
            }
        }, confirmButton = { TextButton({ chooseTemplateFor = null }) { Text("Cancel") } })
    }
    activity?.let { a ->
        AlertDialog({ activity = null }, title = { Text(a.merchant) }, text = { Text("${Money.format(a.amountCents / 100.0, a.currency)} · ${if (a.demo) "Demo or sample" else ""}. Not a real transaction.") },
            confirmButton = { TextButton({ activity = null; vm.removeActivity(a.id) }) { Text("Remove from activity") } }, dismissButton = { TextButton({ activity = null }) { Text("Close") } })
    }
    if (!state.loading && !state.settings.onboarded) {
        AlertDialog({}, title = { Text("Welcome to Open Wallet") },
            text = { Text("Keep cards, passes, tickets and personal documents on this phone. No account needed, and it works offline.\n\nPayment cards are display copies. Open Wallet can’t make payments yet (that needs a bank partner) and never keeps full card numbers or security codes.") },
            confirmButton = { TextButton({ vm.setOnboarded(); regionSheet = true }) { Text("Choose region") } }, dismissButton = { TextButton({ vm.setOnboarded() }) { Text("Got it") } })
    }
}

private const val HELP = "Type it in: pick a category and a provider, then enter the details from your card or ticket. This always works, offline and without an account.\n\n" +
    "Import a file: under “Everything else”, import a photo, screenshot or PDF. The original is kept unchanged and encrypted. Barcodes and QR codes in photos are read on the phone.\n\n" +
    "Calendar bookings: import an .ics file, or connect Google Calendar (optional, read-only) in Settings. You review every booking before it’s saved.\n\n" +
    "IDs and documents go into a separate vault that opens with your fingerprint, face or screen lock. They’re personal copies, not official or verified IDs."

private const val CAL_SETUP = "Connecting needs an Android OAuth client in the app publisher’s Google Cloud project, matching this app’s package name (org.openwallet.app) and its signing certificate’s SHA-1, with the Google Calendar API turned on. " +
    "No client secret is stored in the app. The full steps are in docs/GOOGLE_CALENDAR_SETUP.md in the project. Until that’s set up, Google answers “developer error” and nothing is connected."
