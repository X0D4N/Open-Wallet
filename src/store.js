// Local persistence for Open Wallet.
//
// Cards, passes and settings live in one JSON document (wallet.json) in the
// app's user-data folder. Identity documents are NOT stored here: they live
// in the encrypted vault (see vault.js). Writes are atomic (temp file +
// rename) and a corrupt file is moved aside instead of being overwritten.
//
// Schema v2 (2026-11). v1 files are migrated on load.
'use strict';

const fs = require('fs');
const path = require('path');
const Catalog = require('./renderer/catalog.js');
const { sampleWallet } = require('./sample-data');

const SCHEMA_VERSION = 2;
const THEMES = ['system', 'light', 'dark'];
const TEMPLATES = Object.keys(Catalog.TEMPLATES);
const BARCODE_FORMATS = ['qr', 'code128', 'none'];
const BARCODE_SOURCES = ['entered', 'import', 'demo'];
const PASS_SOURCES = ['manual', 'import', 'calendar', 'sample'];

function emptyWallet() {
  return { version: SCHEMA_VERSION, settings: defaultSettings(), cards: [], passes: [] };
}

function defaultSettings() {
  return {
    theme: 'system', defaultCardId: null, notifyPassUpdates: true, notifyTransactions: true, confirmBeforeDemoTap: true,
    reduceMotion: false, onboarded: false, region: '', sortPasses: 'upcoming',
    vaultTimeout: 5, lockOnBlur: true, expiryReminders: false,
    calendar: { enabled: false, connected: false, account: '', lastSync: '', lastError: '', autoImport: false, onRemoved: 'mark', clientId: '' },
    calendarIgnored: [], learnedIins: {}
  };
}

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v).slice(0, max) : '');
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const color = (v) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : '');
const pick = (v, list, d) => (list.includes(v) ? v : d);

function normalizeTransaction(t) {
  if (!t || typeof t !== 'object') return null;
  return {
    id: str(t.id, 64) || randomId('tx'), merchant: str(t.merchant, 80) || 'Unknown', amount: num(t.amount),
    currency: str(t.currency, 3) || 'USD', date: str(t.date, 40) || new Date().toISOString(),
    status: pick(t.status, ['completed', 'pending', 'declined', 'refund'], 'completed'), category: str(t.category, 40), demo: true
  };
}

// Finds a catalogue issuer for a v1 free-text issuer name.
function issuerFromName(name) {
  const n = Catalog.norm(name);
  if (!n) return null;
  return Catalog.ISSUERS.find((b) => [b.name].concat(b.aliases).some((a) => Catalog.norm(a) === n)) || null;
}

function normalizeCard(c) {
  if (!c || typeof c !== 'object') return null;
  const last4 = str(c.last4, 4).replace(/\D/g, '');
  if (last4.length !== 4) return null;
  let issuerId = str(c.issuerId, 40);
  let issuerName = str(c.issuerName, 60);
  if (!issuerId && !issuerName && c.issuer) { const m = issuerFromName(c.issuer); if (m) issuerId = m.id; else issuerName = str(c.issuer, 60); }
  const iss = issuerId ? Catalog.issuer(issuerId) : null;
  if (issuerId && !iss) { issuerName = issuerName || issuerId; issuerId = ''; }
  const productId = iss && iss.products.some((p) => p.id === c.productId) ? c.productId : '';
  const networkId = Catalog.network(c.networkId) ? c.networkId : '';
  const legacy = c.style && !c.color; // v1 had colour names
  return {
    id: str(c.id, 64) || randomId('card'), issuerId, issuerName, productId, productName: productId ? '' : str(c.productName, 40),
    networkId, kind: pick(c.kind, ['credit', 'debit', 'prepaid'], 'credit'), last4,
    holder: str(c.holder, 60), showHolder: bool(c.showHolder, false),
    expMonth: c.expMonth ? Math.min(12, Math.max(1, Math.round(num(c.expMonth, 1)))) : 0, expYear: c.expYear ? Math.round(num(c.expYear, 2030)) : 0,
    showExpiry: bool(c.showExpiry, legacy), contactless: bool(c.contactless, false), color: color(c.color), nickname: str(c.nickname, 40),
    addedAt: str(c.addedAt, 40) || new Date().toISOString(),
    transactions: Array.isArray(c.transactions) ? c.transactions.map(normalizeTransaction).filter(Boolean) : []
  };
}

// v1 pass → v2 field map.
function migratePass(p) {
  const F = p.fields || {};
  const d = p.date ? new Date(p.date) : null;
  const pad = (n) => String(n).padStart(2, '0');
  const date = d && !isNaN(d) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
  const time = d && !isNaN(d) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
  const map = {
    boarding: ['flight', { from: F.From, to: F.To, flightNo: F.Flight, gate: F.Gate, seat: F.Seat, passenger: F.Passenger, boarding: F.Boarding, zone: F.Group, ref: F.Confirmation }],
    event: ['event', { title: p.title, venue: F.Venue, section: F.Section, seat: F.Seat, ref: F.Ticket }],
    loyalty: ['loyalty', { member: F.Member, number: F['Member number'] || p.barcode, points: F.Points, tier: F.Tier }],
    gift: ['gift', { number: F['Card number'] || p.barcode, pin: F.PIN, balance: p.balance != null ? String(p.balance) : '' }],
    transit: ['transit', { passType: 'Stored value', number: F['Card number'] || p.barcode, fare: F.Fare, balance: p.balance != null ? String(p.balance) : '' }],
    id: ['generic', { title: p.title, subtitle: F['Issued by'] || 'ID card', number: F['ID number'], notes: F.Name ? `Name: ${F.Name}` : '' }],
    generic: ['generic', { title: p.title, subtitle: p.subtitle, number: F.Number, notes: F.Notes }]
  }[p.kind] || ['generic', { title: p.title }];
  const fields = Object.assign({}, map[1], { date, time: date ? time : '' });
  return {
    id: p.id, template: map[0], providerName: ['boarding', 'loyalty', 'gift', 'transit'].includes(p.kind) ? p.title : '', fields,
    barcode: { value: p.barcode || '', format: p.barcodeType === 'code128' ? 'code128' : 'none', source: 'entered' },
    archived: p.archived, createdAt: p.createdAt, currency: p.currency, history: p.history, source: 'manual'
  };
}

function normalizePass(p) {
  if (!p || typeof p !== 'object') return null;
  if (!p.template && p.kind) p = migratePass(p);
  const template = pick(p.template, TEMPLATES, 'generic');
  const allowed = new Set(Catalog.TEMPLATES[template].fields.map((f) => f.k).concat(['date', 'time']));
  const fields = {};
  if (p.fields && typeof p.fields === 'object') {
    for (const [k, v] of Object.entries(p.fields)) {
      const s = str(v, k === 'notes' ? 1000 : 200).trim();
      if (allowed.has(k) && s) fields[k] = s;
    }
  }
  const extraFields = Array.isArray(p.extraFields) ? p.extraFields.slice(0, 12).map((x) => ({ label: str(x && x.label, 40), value: str(x && x.value, 200) })).filter((x) => x.label && x.value) : [];
  const b = p.barcode && typeof p.barcode === 'object' ? p.barcode : {};
  const value = typeof b.value === 'string' ? b.value.slice(0, 1200) : ''; // kept byte-for-byte
  const prov = p.providerId ? Catalog.provider(p.providerId) : null;
  const o = p.original && typeof p.original === 'object' && /^[a-z0-9_]+$/i.test(p.original.fileId || '') ? {
    fileId: p.original.fileId, name: str(p.original.name, 120), mime: str(p.original.mime, 60), size: num(p.original.size)
  } : null;
  return {
    id: str(p.id, 64) || randomId('pass'), template, providerId: prov ? prov.id : '', providerName: prov ? '' : str(p.providerName, 60),
    color: color(p.color), fields, extraFields,
    barcode: { value, format: value ? pick(b.format, BARCODE_FORMATS, 'qr') : 'none', source: pick(b.source, BARCODE_SOURCES, 'entered') },
    original: o, source: pick(p.source, PASS_SOURCES, 'manual'), sourceRef: str(p.sourceRef, 200), sourceStatus: pick(p.sourceStatus, ['', 'changed', 'removed'], ''),
    favorite: bool(p.favorite, false), archived: bool(p.archived, false), edited: bool(p.edited, false), currency: str(p.currency, 3) || 'USD',
    createdAt: str(p.createdAt, 40) || new Date().toISOString(), updatedAt: str(p.updatedAt, 40) || str(p.createdAt, 40) || new Date().toISOString(),
    history: Array.isArray(p.history) ? p.history.map(normalizeTransaction).filter(Boolean) : []
  };
}

function normalizeSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  const d = defaultSettings();
  const cal = s.calendar && typeof s.calendar === 'object' ? s.calendar : {};
  const learned = {};
  if (s.learnedIins && typeof s.learnedIins === 'object') {
    for (const [k, v] of Object.entries(s.learnedIins)) if (/^\d{6,8}$/.test(k) && Catalog.issuer(v)) learned[k] = v;
  }
  return {
    theme: pick(s.theme, THEMES, d.theme), defaultCardId: typeof s.defaultCardId === 'string' ? s.defaultCardId : null,
    notifyPassUpdates: bool(s.notifyPassUpdates, d.notifyPassUpdates), notifyTransactions: bool(s.notifyTransactions, d.notifyTransactions),
    confirmBeforeDemoTap: bool(s.confirmBeforeDemoTap, d.confirmBeforeDemoTap), reduceMotion: bool(s.reduceMotion, d.reduceMotion),
    onboarded: bool(s.onboarded, d.onboarded), region: Catalog.REGIONS.some((r) => r.code === s.region) ? s.region : '',
    sortPasses: pick(s.sortPasses, ['upcoming', 'recent'], 'upcoming'),
    vaultTimeout: [1, 5, 15, 60].includes(s.vaultTimeout) ? s.vaultTimeout : 5, lockOnBlur: bool(s.lockOnBlur, true), expiryReminders: bool(s.expiryReminders, false),
    calendar: {
      enabled: bool(cal.enabled, false), connected: bool(cal.connected, false), account: str(cal.account, 120), lastSync: str(cal.lastSync, 40),
      lastError: str(cal.lastError, 200), autoImport: bool(cal.autoImport, false), onRemoved: pick(cal.onRemoved, ['mark', 'delete'], 'mark'), clientId: str(cal.clientId, 200)
    },
    calendarIgnored: Array.isArray(s.calendarIgnored) ? s.calendarIgnored.filter((x) => typeof x === 'string').slice(-500) : [],
    learnedIins: learned
  };
}

function normalizeWallet(raw) {
  const w = emptyWallet();
  if (!raw || typeof raw !== 'object') return w;
  w.settings = normalizeSettings(raw.settings);
  w.cards = Array.isArray(raw.cards) ? raw.cards.map(normalizeCard).filter(Boolean) : [];
  w.passes = Array.isArray(raw.passes) ? raw.passes.map(normalizePass).filter(Boolean) : [];
  if (!w.cards.some((c) => c.id === w.settings.defaultCardId)) w.settings.defaultCardId = w.cards.length ? w.cards[0].id : null;
  return w;
}

function randomId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

class WalletStore {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'wallet.json');
  }

  // Returns { wallet, status } where status is 'loaded', 'new', 'migrated' or 'recovered'.
  load() {
    if (!fs.existsSync(this.file)) {
      const wallet = normalizeWallet(sampleWallet());
      this.save(wallet);
      return { wallet, status: 'new' };
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const wallet = normalizeWallet(raw);
      if (!raw.version || raw.version < SCHEMA_VERSION) {
        try { fs.copyFileSync(this.file, `${this.file}.v${raw.version || 1}.bak`); } catch { /* keep going */ }
        this.save(wallet);
        return { wallet, status: 'migrated' };
      }
      return { wallet, status: 'loaded' };
    } catch (err) {
      const backup = `${this.file}.corrupt-${Date.now()}`;
      try { fs.renameSync(this.file, backup); } catch { /* keep going */ }
      const wallet = normalizeWallet(sampleWallet());
      this.save(wallet);
      return { wallet, status: 'recovered', backup, error: String(err && err.message) };
    }
  }

  save(wallet) {
    const clean = normalizeWallet(wallet);
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(clean, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
    return clean;
  }
}

module.exports = { WalletStore, normalizeWallet, normalizePass, normalizeCard, emptyWallet, defaultSettings, SCHEMA_VERSION, THEMES };
