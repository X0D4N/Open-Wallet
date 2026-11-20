// Encrypted local storage for identity documents and imported originals.
//
// Vault (IDs & documents): a random 256-bit data key encrypts every document
// record and file with AES-256-GCM. The data key is wrapped with a key
// derived from the person's PIN (scrypt), and the wrapped key is further
// protected with the operating system's credential store (Electron
// safeStorage: DPAPI on Windows, Keychain on macOS, libsecret on Linux) when
// available. Without the PIN the vault cannot be opened, and a forgotten
// PIN cannot be recovered.
//
// Originals (files imported for passes): encrypted with a device key that is
// itself protected by safeStorage. Decryption returns the exact original
// bytes; a SHA-256 fingerprint is stored so "unchanged" can be checked.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_FILE = 25 * 1024 * 1024;
const SIGS = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47]], ['image/jpeg', [0xff, 0xd8, 0xff]], ['image/gif', [0x47, 0x49, 0x46, 0x38]],
  ['application/pdf', [0x25, 0x50, 0x44, 0x46]], ['image/webp', [0x52, 0x49, 0x46, 0x46]]
];

function sniff(buf) {
  for (const [mime, sig] of SIGS) if (sig.every((b, i) => buf[i] === b)) return mime;
  return '';
}
function seal(key, data) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([Buffer.from('OW1'), iv, c.getAuthTag(), body]);
}
function open(key, blob) {
  if (blob.slice(0, 3).toString() !== 'OW1') throw new Error('Unknown file format');
  const iv = blob.slice(3, 15), tag = blob.slice(15, 31);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(blob.slice(31)), d.final()]);
}
const pinKey = (pin, salt) => crypto.scryptSync(String(pin), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
function wipe(file) {
  try { const n = fs.statSync(file).size; fs.writeFileSync(file, Buffer.alloc(n)); } catch { /* best effort */ }
  try { fs.unlinkSync(file); } catch { /* already gone */ }
}

class Vault {
  constructor(dir, safeStorage) {
    this.dir = dir;
    this.files = path.join(dir, 'files');
    this.meta = path.join(dir, 'meta.json');
    this.docsFile = path.join(dir, 'docs.bin');
    this.ss = safeStorage && safeStorage.isEncryptionAvailable() ? safeStorage : null;
    this.key = null;
    this.failed = 0;
    this.blockedUntil = 0;
    this.temp = new Set();
  }
  readMeta() { try { return JSON.parse(fs.readFileSync(this.meta, 'utf8')); } catch { return null; } }
  status() {
    const m = this.readMeta();
    return { exists: !!m, locked: !this.key, osProtected: !!(m && m.os), blockedFor: Math.max(0, Math.ceil((this.blockedUntil - Date.now()) / 1000)) };
  }
  create(pin) {
    if (this.readMeta()) return { ok: false, reason: 'exists' };
    if (!/^\d{4,12}$/.test(String(pin))) return { ok: false, reason: 'pin' };
    fs.mkdirSync(this.files, { recursive: true });
    const key = crypto.randomBytes(32);
    this.writeKey(key, pin);
    this.key = key;
    this.saveDocs([]);
    return { ok: true };
  }
  writeKey(key, pin) {
    const salt = crypto.randomBytes(16);
    let wrapped = seal(pinKey(pin, salt), key).toString('base64');
    let os = false;
    if (this.ss) { wrapped = this.ss.encryptString(wrapped).toString('base64'); os = true; }
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.meta, JSON.stringify({ v: 1, salt: salt.toString('base64'), wrapped, os, created: new Date().toISOString() }));
  }
  unlock(pin) {
    const m = this.readMeta();
    if (!m) return { ok: false, reason: 'missing' };
    if (Date.now() < this.blockedUntil) return { ok: false, reason: 'blocked', blockedFor: Math.ceil((this.blockedUntil - Date.now()) / 1000) };
    try {
      let wrapped = m.wrapped;
      if (m.os) {
        if (!this.ss) return { ok: false, reason: 'os' };
        wrapped = this.ss.decryptString(Buffer.from(wrapped, 'base64'));
      }
      this.key = open(pinKey(pin, Buffer.from(m.salt, 'base64')), Buffer.from(wrapped, 'base64'));
      this.failed = 0;
      return { ok: true };
    } catch {
      this.failed++;
      if (this.failed >= 5) this.blockedUntil = Date.now() + Math.min(300, 30 * 2 ** (this.failed - 5)) * 1000;
      return { ok: false, reason: 'wrong', attempts: this.failed };
    }
  }
  verify(pin) {
    const keep = this.key;
    const r = this.unlock(pin);
    if (!r.ok) this.key = keep;
    return r.ok;
  }
  lock() {
    this.key = null;
    for (const f of this.temp) wipe(f);
    this.temp.clear();
  }
  need() { if (!this.key) throw new Error('locked'); }
  docs() {
    this.need();
    if (!fs.existsSync(this.docsFile)) return [];
    return JSON.parse(open(this.key, fs.readFileSync(this.docsFile)).toString('utf8'));
  }
  saveDocs(docs) {
    this.need();
    const tmp = `${this.docsFile}.tmp`;
    fs.writeFileSync(tmp, seal(this.key, Buffer.from(JSON.stringify(docs), 'utf8')));
    fs.renameSync(tmp, this.docsFile);
    return true;
  }
  changePin(oldPin, newPin) {
    if (!/^\d{4,12}$/.test(String(newPin))) return { ok: false, reason: 'pin' };
    if (!this.verify(oldPin)) return { ok: false, reason: 'wrong' };
    this.writeKey(this.key, newPin);
    return { ok: true };
  }
  reset() {
    this.lock();
    try { fs.readdirSync(this.files).forEach((f) => wipe(path.join(this.files, f))); } catch { /* none */ }
    wipe(this.docsFile); wipe(this.meta);
    return { ok: true };
  }
  addFile(srcPath) {
    this.need();
    return storeFile(srcPath, this.files, this.key);
  }
  readFile(id) {
    this.need();
    return open(this.key, fs.readFileSync(path.join(this.files, `${safeId(id)}.bin`)));
  }
  deleteFile(id) { wipe(path.join(this.files, `${safeId(id)}.bin`)); return true; }
  tempCopy(id, name, tmpDir) {
    const buf = this.readFile(id);
    const file = path.join(tmpDir, `openwallet-${crypto.randomBytes(6).toString('hex')}-${String(name || 'document').replace(/[^\w.-]+/g, '_')}`);
    fs.writeFileSync(file, buf);
    this.temp.add(file);
    return file;
  }
}

function safeId(id) { if (!/^[a-z0-9_]+$/i.test(String(id))) throw new Error('bad id'); return id; }

function storeFile(srcPath, dir, key) {
  const st = fs.statSync(srcPath);
  if (st.size > MAX_FILE) return { ok: false, reason: 'size', message: 'Files can be up to 25 MB.' };
  const buf = fs.readFileSync(srcPath);
  const mime = sniff(buf);
  if (!mime) return { ok: false, reason: 'type', message: 'Use a PNG, JPEG, WebP, GIF image or a PDF.' };
  if (mime === 'application/pdf' && /\/Encrypt\b/.test(buf.slice(0, Math.min(buf.length, 1 << 20)).toString('latin1'))) {
    // Password-protected PDFs are kept as they are; they just can't be previewed.
  }
  const id = `f_${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.bin`), seal(key, buf));
  return { ok: true, file: { fileId: id, name: path.basename(srcPath).slice(0, 120), mime, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') } };
}

// Originals of imported passes, encrypted with an OS-protected device key.
class Originals {
  constructor(dir, safeStorage) {
    this.dir = dir;
    this.ss = safeStorage && safeStorage.isEncryptionAvailable() ? safeStorage : null;
    this.temp = new Set();
  }
  key() {
    if (this.k) return this.k;
    const f = path.join(this.dir, 'device.key');
    fs.mkdirSync(this.dir, { recursive: true });
    if (fs.existsSync(f)) {
      const raw = fs.readFileSync(f);
      this.k = this.ss ? Buffer.from(this.ss.decryptString(raw), 'base64') : raw;
    } else {
      this.k = crypto.randomBytes(32);
      fs.writeFileSync(f, this.ss ? this.ss.encryptString(this.k.toString('base64')) : this.k);
    }
    return this.k;
  }
  add(srcPath) { return storeFile(srcPath, this.dir, this.key()); }
  read(id) { return open(this.key(), fs.readFileSync(path.join(this.dir, `${safeId(id)}.bin`))); }
  remove(id) { wipe(path.join(this.dir, `${safeId(id)}.bin`)); return true; }
  tempCopy(id, name, tmpDir) {
    const file = path.join(tmpDir, `openwallet-${crypto.randomBytes(6).toString('hex')}-${String(name || 'original').replace(/[^\w.-]+/g, '_')}`);
    fs.writeFileSync(file, this.read(id));
    this.temp.add(file);
    return file;
  }
  cleanup() { for (const f of this.temp) wipe(f); this.temp.clear(); }
}

module.exports = { Vault, Originals, sniff, seal, open };
