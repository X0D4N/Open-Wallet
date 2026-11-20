// Open Wallet — Electron main process.
//
// Owns the window, the local JSON store, the encrypted document vault, the
// encrypted store of imported originals, the optional Google Calendar reader
// and the few OS integrations the UI needs (file dialogs, opening official
// websites). Network requests happen only when the person connects or syncs
// Google Calendar, or opens an official website in their browser.
'use strict';

const { app, BrowserWindow, ipcMain, dialog, nativeTheme, Menu, shell, safeStorage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WalletStore, normalizeWallet, emptyWallet } = require('./src/store');
const { sampleWallet } = require('./src/sample-data');
const { Vault, Originals } = require('./src/vault');
const { CalendarClient } = require('./src/calendar');

// ---- Command line -----------------------------------------------------------
function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : '';
}

const screenshotArg = argValue('--screenshot');
const SCREENSHOT = screenshotArg !== null;
const screenshotFile = SCREENSHOT ? path.resolve(process.cwd(), screenshotArg || 'screenshot.png') : null;
const startScreen = argValue('--screen') || 'home';
const forcedTheme = argValue('--theme');
const userDataArg = argValue('--user-data');
if (userDataArg) app.setPath('userData', path.resolve(process.cwd(), userDataArg));
// Screenshot runs never touch the person's data: everything lives in a
// throw-away folder.
const shotDir = SCREENSHOT ? fs.mkdtempSync(path.join(os.tmpdir(), 'openwallet-shot-')) : null;
const e2eArg = argValue('--e2e');
const sizeMatch = /^(\d{3,4})x(\d{3,4})$/.exec(argValue('--size') || '');
const winSize = sizeMatch ? { width: Number(sizeMatch[1]), height: Number(sizeMatch[2]) } : { width: 412, height: 870 };

const dataDir = () => (SCREENSHOT ? shotDir : app.getPath('userData'));

// ---- Store ------------------------------------------------------------------
let store, vault, originals, calendar;
let memoryWallet = null;

function initStores() {
  if (SCREENSHOT) {
    memoryWallet = normalizeWallet(sampleWallet());
    if (forcedTheme === 'light' || forcedTheme === 'dark') memoryWallet.settings.theme = forcedTheme;
    memoryWallet.settings.onboarded = true;
  } else {
    store = new WalletStore(dataDir());
  }
  vault = new Vault(path.join(dataDir(), 'vault'), SCREENSHOT ? null : safeStorage);
  originals = new Originals(path.join(dataDir(), 'originals'), SCREENSHOT ? null : safeStorage);
  calendar = new CalendarClient(dataDir(), safeStorage, (url) => shell.openExternal(url));
  if (SCREENSHOT) seedScreenshotVault();
}

// Synthetic sample documents for screenshot runs (PIN 0000). The Aadhaar
// sample number is generated to pass the check digit but belongs to no one.
function seedScreenshotVault() {
  const { verhoeffValid } = require('./src/renderer/engines.js');
  let aadhaar = '';
  for (let d = 0; d < 10 && !aadhaar; d++) if (verhoeffValid(`99990000123${d}`)) aadhaar = `99990000123${d}`;
  vault.create('0000');
  vault.saveDocs([
    { id: 'doc_aadhaar', typeId: 'IN.aadhaar', region: 'IN', holder: 'Alex Morgan', number: aadhaar, fields: { dob: '1990-01-01' }, favorite: true, files: [], createdAt: new Date().toISOString(), status: 'personal-copy' },
    { id: 'doc_pan', typeId: 'IN.pan', region: 'IN', holder: 'Alex Morgan', number: 'ABCDE1234F', fields: {}, files: [], createdAt: new Date().toISOString(), status: 'personal-copy' },
    { id: 'doc_dl', typeId: 'IN.dl', region: 'IN', holder: 'Alex Morgan', number: 'DL-0420110012345', expiry: `${new Date().getFullYear() + 6}-05-31`, fields: { classes: 'LMV, MCWG' }, files: [], createdAt: new Date().toISOString(), status: 'personal-copy' },
    { id: 'doc_rc', typeId: 'IN.rc', region: 'IN', holder: 'Alex Morgan', number: 'DL 01 AB 1234', expiry: `${new Date().getFullYear() + 9}-02-28`, fields: { makeModel: 'Sample Hatchback' }, files: [], createdAt: new Date().toISOString(), status: 'personal-copy' }
  ]);
  if (startScreen !== 'vault-locked') return;
  vault.lock();
}

function loadWallet() {
  if (memoryWallet) return { wallet: memoryWallet, status: 'loaded' };
  return store.load();
}

function saveWallet(w) {
  if (memoryWallet) { memoryWallet = normalizeWallet(w); return memoryWallet; }
  return store.save(w);
}

function applyTheme(theme) {
  nativeTheme.themeSource = ['light', 'dark'].includes(theme) ? theme : 'system';
}

// ---- Window -----------------------------------------------------------------
let win;
let lockTimer = null;

function createWindow() {
  initStores();
  const initial = loadWallet();
  applyTheme(initial.wallet.settings.theme);
  const dark = nativeTheme.shouldUseDarkColors;

  win = new BrowserWindow({
    width: winSize.width,
    height: winSize.height,
    minWidth: 340,
    minHeight: 560,
    title: 'Open Wallet',
    backgroundColor: dark ? '#131314' : '#ffffff',
    autoHideMenuBar: true,
    show: false,
    focusable: !SCREENSHOT,
    skipTaskbar: SCREENSHOT,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  });
  Menu.setApplicationMenu(null);

  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // A screenshot run opens without taking focus so it never interrupts.
  win.once('ready-to-show', () => (SCREENSHOT ? win.showInactive() : win.show()));
  win.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  win.on('blur', () => { if (!win.isDestroyed()) win.webContents.send('app:blur'); });
  win.on('minimize', () => { if (!win.isDestroyed()) win.webContents.send('app:blur'); });

  if (e2eArg) {
    const script = fs.readFileSync(path.resolve(process.cwd(), e2eArg), 'utf8');
    win.webContents.once('did-finish-load', async () => {
      let code = 0;
      try {
        const report = await win.webContents.executeJavaScript(script, true);
        console.log(JSON.stringify(report, null, 2));
        if (!report || report.ok !== true) code = 1;
      } catch (err) {
        console.error('E2E failed:', err);
        code = 1;
      }
      setTimeout(() => { cleanup(); app.exit(code); }, 300); // let the last save finish
    });
  }

  if (SCREENSHOT) {
    let done = false;
    const capture = async () => {
      if (done) return;
      done = true;
      try {
        const image = await win.webContents.capturePage();
        fs.mkdirSync(path.dirname(screenshotFile), { recursive: true });
        fs.writeFileSync(screenshotFile, image.toPNG());
        console.log(`Saved screenshot to ${screenshotFile}`);
      } catch (err) {
        console.error('Screenshot failed:', err);
        process.exitCode = 1;
      }
      app.quit();
    };
    // The renderer reports "settled" after the launch animation and the
    // requested start screen (about 2 s); fall back to a fixed delay.
    ipcMain.once('app:settled', () => setTimeout(capture, 600));
    win.webContents.once('did-finish-load', () => setTimeout(capture, 9000));
  }
}

// ---- IPC: wallet --------------------------------------------------------------
ipcMain.handle('wallet:load', () => {
  const result = loadWallet();
  return { ...result, screenshot: SCREENSHOT, startScreen, version: app.getVersion(), osProtection: !SCREENSHOT && safeStorage.isEncryptionAvailable() };
});

ipcMain.handle('wallet:save', (_e, wallet) => {
  const clean = saveWallet(wallet);
  applyTheme(clean.settings.theme);
  return clean;
});

ipcMain.handle('wallet:reset', (_e, mode) => {
  const fresh = mode === 'empty' ? emptyWallet() : normalizeWallet(sampleWallet());
  fresh.settings.onboarded = true;
  return saveWallet(fresh);
});

ipcMain.handle('wallet:export', async (_e, wallet) => {
  if (SCREENSHOT) return { ok: false, reason: 'disabled' };
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export wallet data (cards and passes, not ID documents)',
    defaultPath: `open-wallet-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false, reason: 'canceled' };
  fs.writeFileSync(filePath, JSON.stringify(normalizeWallet(wallet), null, 2), 'utf8');
  return { ok: true, file: path.basename(filePath) };
});

ipcMain.handle('wallet:import', async () => {
  if (SCREENSHOT) return { ok: false, reason: 'disabled' };
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Import wallet data', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (canceled || !filePaths.length) return { ok: false, reason: 'canceled' };
  try {
    const raw = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    if (!raw || typeof raw !== 'object' || (!Array.isArray(raw.cards) && !Array.isArray(raw.passes))) {
      return { ok: false, reason: 'invalid', message: 'That file is not an Open Wallet backup.' };
    }
    return { ok: true, wallet: saveWallet(raw) };
  } catch {
    return { ok: false, reason: 'invalid', message: 'That file could not be read as JSON.' };
  }
});

ipcMain.handle('app:open-data-folder', () => {
  if (SCREENSHOT) return false;
  shell.openPath(app.getPath('userData'));
  return true;
});

// Only official sites listed in the catalogue (and Google's developer
// console for calendar set-up) can be opened, and only in the browser.
const OPEN_HOSTS = ['myaadhaar.uidai.gov.in', 'uidai.gov.in', 'www.incometax.gov.in', 'www.digilocker.gov.in', 'voters.eci.gov.in', 'abha.abdm.gov.in',
  'parivahan.gov.in', 'uaepass.ae', 'www.absher.sa', 'console.cloud.google.com', 'developers.google.com', 'myaccount.google.com'];
ipcMain.handle('app:open-external', (_e, url) => {
  if (SCREENSHOT) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !OPEN_HOSTS.includes(u.hostname)) return false;
    shell.openExternal(u.toString());
    return true;
  } catch { return false; }
});

ipcMain.handle('app:protect', (_e, on) => {
  if (!SCREENSHOT && win && !win.isDestroyed()) win.setContentProtection(!!on);
  return true;
});

async function pickFile(title, filters) {
  if (SCREENSHOT) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { title, properties: ['openFile'], filters });
  return canceled || !filePaths.length ? null : filePaths[0];
}
const DOC_FILTERS = [{ name: 'Images and PDF', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf'] }];
const dataUrl = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`;

// ---- IPC: vault ----------------------------------------------------------------
function armLock(minutes) {
  clearTimeout(lockTimer);
  if (minutes > 0) lockTimer = setTimeout(() => { vault.lock(); if (win && !win.isDestroyed()) { win.setContentProtection(false); win.webContents.send('vault:locked'); } }, minutes * 60000);
}
const guarded = (fn) => (...args) => { try { return fn(...args); } catch (err) { return { ok: false, reason: err.message === 'locked' ? 'locked' : 'error', message: err.message }; } };

ipcMain.handle('vault:status', () => vault.status());
ipcMain.handle('vault:create', (_e, pin) => vault.create(pin));
ipcMain.handle('vault:unlock', (_e, pin, minutes) => { const r = vault.unlock(pin); if (r.ok) armLock(minutes); return r; });
ipcMain.handle('vault:touch', (_e, minutes) => { if (!vault.status().locked) armLock(minutes); return true; });
ipcMain.handle('vault:verify', (_e, pin) => vault.verify(pin));
ipcMain.handle('vault:lock', () => { vault.lock(); clearTimeout(lockTimer); return true; });
ipcMain.handle('vault:docs', guarded(() => ({ ok: true, docs: vault.docs() })));
ipcMain.handle('vault:save', guarded((_e, docs) => ({ ok: vault.saveDocs(Array.isArray(docs) ? docs.slice(0, 500) : []) })));
ipcMain.handle('vault:change-pin', (_e, a, b) => vault.changePin(a, b));
ipcMain.handle('vault:reset', () => vault.reset());
ipcMain.handle('vault:add-file', async () => {
  const p = await pickFile('Choose a photo or PDF of your document', DOC_FILTERS);
  if (!p) return { ok: false, reason: SCREENSHOT ? 'disabled' : 'canceled' };
  try { return vault.addFile(p); } catch (err) { return { ok: false, reason: 'error', message: err.message }; }
});
ipcMain.handle('vault:file-url', guarded((_e, id, mime) => ({ ok: true, url: mime === 'application/pdf' ? '' : dataUrl(vault.readFile(id), mime) })));
ipcMain.handle('vault:open-file', guarded((_e, id, name) => { shell.openPath(vault.tempCopy(id, name, os.tmpdir())); return { ok: true }; }));
ipcMain.handle('vault:delete-file', guarded((_e, id) => ({ ok: vault.deleteFile(id) })));
ipcMain.handle('vault:export-file', async (_e, id, name) => {
  if (SCREENSHOT) return { ok: false, reason: 'disabled' };
  const { canceled, filePath } = await dialog.showSaveDialog(win, { title: 'Save an unencrypted copy', defaultPath: name || 'document' });
  if (canceled || !filePath) return { ok: false, reason: 'canceled' };
  try { fs.writeFileSync(filePath, vault.readFile(id)); return { ok: true, file: path.basename(filePath) }; } catch (err) { return { ok: false, reason: 'error', message: err.message }; }
});

// ---- IPC: originals of imported passes ------------------------------------------
ipcMain.handle('originals:add', async () => {
  const p = await pickFile('Choose a photo, screenshot or PDF of your pass', DOC_FILTERS);
  if (!p) return { ok: false, reason: SCREENSHOT ? 'disabled' : 'canceled' };
  try { return originals.add(p); } catch (err) { return { ok: false, reason: 'error', message: err.message }; }
});
ipcMain.handle('originals:add-data', (_e, url) => {
  if (SCREENSHOT) return { ok: false, reason: 'disabled' };
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(url || ''));
  if (!m) return { ok: false, reason: 'type' };
  const tmp = path.join(os.tmpdir(), `camera-photo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`);
  try { fs.writeFileSync(tmp, Buffer.from(m[1], 'base64')); return originals.add(tmp); } catch (err) { return { ok: false, reason: 'error', message: err.message }; } finally { try { fs.unlinkSync(tmp); } catch { /* gone */ } }
});
ipcMain.handle('originals:url', guarded((_e, id, mime) => ({ ok: true, url: mime === 'application/pdf' ? '' : dataUrl(originals.read(id), mime) })));
ipcMain.handle('originals:open', guarded((_e, id, name) => { shell.openPath(originals.tempCopy(id, name, os.tmpdir())); return { ok: true }; }));
ipcMain.handle('originals:remove', guarded((_e, id) => ({ ok: originals.remove(id) })));

// ---- IPC: calendar -------------------------------------------------------------
ipcMain.handle('calendar:connect', async (_e, opts) => (SCREENSHOT ? { ok: false, reason: 'disabled' } : calendar.connect(opts || {})));
ipcMain.handle('calendar:events', async () => (SCREENSHOT ? { ok: false, reason: 'disabled' } : calendar.events()));
ipcMain.handle('calendar:disconnect', async () => calendar.disconnect());
ipcMain.handle('calendar:status', () => ({ connected: calendar.connected(), canProtect: calendar.canProtect() }));
ipcMain.handle('calendar:import-ics', async () => {
  const p = await pickFile('Choose a calendar file (.ics)', [{ name: 'Calendar', extensions: ['ics'] }]);
  if (!p) return { ok: false, reason: SCREENSHOT ? 'disabled' : 'canceled' };
  if (fs.statSync(p).size > 2 * 1024 * 1024) return { ok: false, reason: 'size', message: 'Calendar files can be up to 2 MB.' };
  return { ok: true, text: fs.readFileSync(p, 'utf8'), name: path.basename(p) };
});

// ---- Lifecycle -----------------------------------------------------------------
function cleanup() {
  try { if (vault) vault.lock(); if (originals) originals.cleanup(); } catch { /* ignore */ }
  if (shotDir) { try { fs.rmSync(shotDir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

if (!SCREENSHOT && !e2eArg && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', cleanup);
}
