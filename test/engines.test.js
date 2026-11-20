// Engine tests: QR encoder (decoded back with an independent reader),
// card identification, booking detection, ICS parsing, masking, document
// checks, store migration and the encrypted vault. Synthetic data only.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const C = require('../src/renderer/catalog.js');
const E = require('../src/renderer/engines.js');
const { normalizeWallet } = require('../src/store.js');
const { Vault, Originals } = require('../src/vault.js');

// ---- Independent QR reader (level M, byte mode) ------------------------------
function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; }
function gfPow(e) { let r = 1; for (let i = 0; i < e; i++) r = gfMul(r, 2); return r; }
function readQr(q) {
  const n = q.size, m = q.modules, ver = (n - 17) / 4;
  // Format bits around the top-left finder.
  let bits = 0;
  const fmtCoords = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  fmtCoords.forEach(([x, y], i) => { if (m[y][x]) bits |= 1 << i; });
  const fmt = bits ^ 0x5412;
  const ecl = fmt >>> 13, mask = (fmt >>> 10) & 7;
  // Function-pattern map (rebuilt independently).
  const fn = Array.from({ length: n }, () => new Array(n).fill(false));
  const mark = (x, y) => { if (x >= 0 && y >= 0 && x < n && y < n) fn[y][x] = true; };
  for (let i = 0; i < n; i++) { mark(6, i); mark(i, 6); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) mark(cx + dx, cy + dy);
  const al = ver === 1 ? [] : (() => { const k = Math.floor(ver / 7) + 2; const step = Math.ceil((ver * 4 + 4) / (k * 2 - 2)) * 2; const r = [6]; for (let p = n - 7; r.length < k; p -= step) r.splice(1, 0, p); return r; })();
  al.forEach((a, i) => al.forEach((b, j) => { if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(a + dx, b + dy); }));
  for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8); }
  for (let i = 0; i < 8; i++) { mark(n - 1 - i, 8); mark(8, n - 1 - i); }
  if (ver >= 7) for (let i = 0; i < 18; i++) { mark(n - 11 + (i % 3), Math.floor(i / 3)); mark(Math.floor(i / 3), n - 11 + (i % 3)); }
  const masks = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const bitsOut = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < n; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - v : v;
      if (!fn[y][x]) bitsOut.push(m[y][x] !== masks[mask](x, y) ? 1 : 0);
    }
  }
  const raw = [];
  for (let i = 0; i + 8 <= bitsOut.length; i += 8) raw.push(parseInt(bitsOut.slice(i, i + 8).join(''), 2));
  const ECC = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
  const NB = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
  const nb = NB[ver], ecc = ECC[ver], total = raw.length, short = nb - (total % nb), shortLen = Math.floor(total / nb);
  const blocks = Array.from({ length: nb }, (_, i) => []);
  let k = 0;
  for (let i = 0; i < shortLen + 1; i++) for (let j = 0; j < nb; j++) {
    if (i === shortLen - ecc && j < short) continue; // short blocks have one fewer data byte
    if (k < total) blocks[j].push(raw[k++]);
  }
  const data = [];
  blocks.forEach((b, j) => {
    // Reed-Solomon syndromes must all be zero.
    for (let s = 0; s < ecc; s++) { let acc = 0; for (const c of b) acc = gfMul(acc, gfPow(s)) ^ c; assert.strictEqual(acc, 0, `RS syndrome ${s} of block ${j}`); }
    data.push(...b.slice(0, b.length - ecc));
  });
  const bs = data.map((x) => x.toString(2).padStart(8, '0')).join('');
  assert.strictEqual(bs.slice(0, 4), '0100', 'byte mode');
  const lenBits = ver <= 9 ? 8 : 16;
  const len = parseInt(bs.slice(4, 4 + lenBits), 2);
  const bytes = [];
  for (let i = 0; i < len; i++) bytes.push(parseInt(bs.slice(4 + lenBits + i * 8, 12 + lenBits + i * 8), 2));
  return { ecl, text: Buffer.from(bytes).toString('utf8') };
}

test('QR codes decode back to the exact payload (several versions)', () => {
  const payloads = ['A', 'DEMO-CINEMA-232-12-02', 'M1MORGAN/ALEX        EDEMO42 DELBOMAI 0588 320Y002F0001 100', 'ü€ unicode ✓', 'x'.repeat(120), 'y'.repeat(300), 'z'.repeat(600)];
  for (const p of payloads) {
    const q = E.qrEncode(p);
    assert.ok(q, `encodes ${p.length} chars`);
    const r = readQr(q);
    assert.strictEqual(r.ecl, 0, 'level M');
    assert.strictEqual(r.text, p, `round trip of ${p.slice(0, 20)}`);
  }
  assert.strictEqual(E.qrEncode('q'.repeat(2000)), null, 'too long is refused, not truncated');
});

test('card network is found from the first digits (published test ranges)', () => {
  const cases = { '411111': 'visa', '555555': 'mastercard', '222100': 'mastercard', '378282': 'amex', '601111': 'discover', '652150': 'rupay', '608001': 'rupay', '353011': 'jcb', '508500': 'rupay','352800': 'jcb', '620000': 'unionpay', '305693': 'diners' };
  for (const [p, id] of Object.entries(cases)) assert.strictEqual((E.networkFor(p) || {}).id, id, p);
  assert.strictEqual(E.networkFor('99'), null);
  assert.strictEqual(E.networkFor(''), null);
});

test('match levels follow the priority order and never guess an issuer', () => {
  assert.strictEqual(E.identifyCard({ prefix: '411111' }).level, 'network');
  assert.strictEqual(E.identifyCard({ prefix: '411111' }).issuer, null, 'no BIN table: no guessed bank');
  assert.strictEqual(E.identifyCard({ prefix: '4111', issuerId: 'axis' }).level, 'issuer-network');
  assert.strictEqual(E.identifyCard({ issuerId: 'axis' }).level, 'issuer');
  assert.strictEqual(E.identifyCard({ prefix: '411111', issuerId: 'axis', productId: 'magnus' }).level, 'product');
  assert.strictEqual(E.identifyCard({}).level, 'fallback');
  assert.strictEqual(E.identifyCard({ prefix: '411111', learned: { 411111: 'hdfc' } }).issuer.id, 'hdfc', 'prefix confirmed on this device');
  assert.strictEqual(E.identifyCard({ prefix: '378282', issuerId: 'amex' }).network.id, 'amex');
  assert.ok(E.identifyCard({ prefix: '555555', issuerId: 'hdfc', productId: 'dcb' }).productNetworkMismatch, 'flags a product on an unusual network');
});

test('bookings are detected, meetings are not, and nothing is invented', () => {
  const flight = E.detectBooking({ id: '1', title: 'Flight EK 512 DXB → BOM', description: 'Emirates booking reference: QX7P2L Seat 32A', start: '2030-03-04T09:00:00Z', end: '2030-03-04T11:00:00Z' });
  assert.strictEqual(flight.template, 'flight');
  assert.strictEqual(flight.fields.from, 'DXB');
  assert.strictEqual(flight.fields.to, 'BOM');
  assert.strictEqual(flight.fields.ref, 'QX7P2L');
  assert.strictEqual(flight.provider, 'flight.emirates');
  assert.strictEqual(flight.fields.gate, undefined, 'no gate in the event, none invented');
  const movie = E.detectBooking({ id: '2', title: 'Movie: Night Train', location: 'VOX Cinemas Mall', description: 'Screen 7 Row F Booking ID: VX88213', start: '2030-03-05T18:00:00Z' });
  assert.strictEqual(movie.template, 'movie');
  assert.strictEqual(movie.fields.screen, '7');
  const train = E.detectBooking({ id: '3', title: 'Train New Delhi to Agra', description: 'PNR: 4521378890 Coach C2', start: '2030-03-06T06:00:00Z' });
  assert.strictEqual(train.template, 'train');
  const hotel = E.detectBooking({ id: '4', title: 'Stay at Sample Hotel', description: 'Hotel reservation, check-in 3pm. Confirmation number: HTL8812', start: '2030-03-07', end: '2030-03-09', allDay: true });
  assert.strictEqual(hotel.template, 'hotel');
  assert.strictEqual(hotel.fields.checkout, '2030-03-09');
  assert.strictEqual(E.detectBooking({ id: '5', title: 'Weekly team sync', start: '2030-03-04T10:00:00Z' }), null);
  assert.strictEqual(E.detectBooking({ id: '6', title: 'Lunch with Sam', location: 'Hotel cafe', start: '2030-03-04T12:00:00Z' }), null, 'a meeting at a hotel is not a booking');
});

test('ICS files are parsed (folded lines, escapes, all-day events)', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a1\r\nDTSTART;VALUE=DATE:20300307\r\nDTEND;VALUE=DATE:20300309\r\nSUMMARY:Stay at Sample\r\n  Hotel\r\nDESCRIPTION:Line one\\nRef\\, HTL1\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:a2\r\nDTSTART:20300304T090000Z\r\nSUMMARY:Flight\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const ev = E.parseIcs(ics);
  assert.strictEqual(ev.length, 2);
  assert.strictEqual(ev[0].title, 'Stay at Sample Hotel');
  assert.strictEqual(ev[0].allDay, true);
  assert.strictEqual(ev[0].description, 'Line one\nRef, HTL1');
  assert.strictEqual(ev[1].start, '2030-03-04T09:00:00.000Z');
});

test('masking and document checks', () => {
  assert.strictEqual(E.mask('123456789012'), 'XXXX XXXX 9012');
  assert.strictEqual(E.mask('ABCDE1234F'), 'XXXX XXXX 234F');
  assert.strictEqual(E.mask('DL 01 AB 1234', 'none'), 'DL 01 AB 1234');
  // Verhoeff: build a valid synthetic number, then break it.
  let good = '';
  for (let d = 0; d < 10; d++) if (E.verhoeffValid(`99990000123${d}`)) good = `99990000123${d}`;
  assert.ok(good, 'a check digit exists');
  const bad = good.slice(0, 11) + ((Number(good[11]) + 1) % 10);
  assert.strictEqual(E.checkDocNumber(C.docType('IN.aadhaar'), good), '');
  assert.match(E.checkDocNumber(C.docType('IN.aadhaar'), bad), /check digit/);
  assert.strictEqual(E.checkDocNumber(C.docType('IN.pan'), 'ABCDE1234F'), '');
  assert.match(E.checkDocNumber(C.docType('IN.pan'), 'ABC123'), /doesn’t look like/);
});

test('catalogue covers every requested region and category', () => {
  for (const r of ['IN', 'AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'US', 'GB', 'EU']) assert.ok(C.ISSUERS.some((b) => b.country === r) || r === 'XX', `issuers in ${r}`);
  for (const id of ['axis', 'hdfc', 'icici', 'sbi', 'kotak', 'idfcfirst', 'indusind', 'federal', 'bob', 'pnb', 'yes', 'au', 'rbl', 'enbd', 'fab', 'adcb', 'dib', 'mashreq', 'rakbank', 'adib', 'cbd',
    'chase', 'bofa', 'wellsfargo', 'capitalone', 'citi', 'hsbc', 'barclays', 'stanchart', 'lloyds', 'santander', 'amex', 'discover']) assert.ok(C.issuer(id), id);
  for (const id of ['visa', 'mastercard', 'amex', 'rupay', 'discover', 'unionpay', 'jcb']) assert.ok(C.network(id), id);
  for (const id of ['movie.pvrinox', 'flight.salamair', 'flight.airindia', 'gift.dominos', 'loyalty.yesbank', 'loyalty.flipkart', 'transit.hmrl', 'transit.kmrl', 'transit.upsrtc']) assert.ok(C.provider(id), id);
  for (const id of ['IN.aadhaar', 'IN.pan', 'IN.abha', 'IN.rc', 'IN.puc', 'AE.eid', 'SA.iqama', 'QA.qid', 'KW.civil', 'BH.cpr', 'OM.civil', 'US.dl', 'US.ssn', 'GB.dl', 'EU.nid']) assert.ok(C.docType(id), id);
  assert.ok(C.ISSUERS.every((b) => b.art.verified === false), 'no artwork is claimed as verified');
});

test('v1 wallets migrate to v2 without losing data or keeping card numbers', () => {
  const v1 = { version: 1, settings: { theme: 'dark' }, cards: [{ id: 'c1', issuer: 'HDFC Bank', network: 'Credit', kind: 'credit', last4: '1234', expMonth: 1, expYear: 2031, holder: 'A', style: 'ocean', number: '4111111111111234' }],
    passes: [{ id: 'p1', kind: 'boarding', title: 'Skyway', barcode: 'ABC', barcodeType: 'code128', date: '2030-01-02T09:30:00.000Z', fields: { From: 'SFO', To: 'SEA', Flight: 'SK 1', Seat: '1A' } },
      { id: 'p2', kind: 'gift', title: 'Books', balance: 12.5, barcode: '999' }] };
  const w = normalizeWallet(v1);
  assert.strictEqual(w.version, 2);
  assert.strictEqual(w.cards[0].issuerId, 'hdfc');
  assert.ok(!JSON.stringify(w).includes('4111111111111234'));
  assert.strictEqual(w.passes[0].template, 'flight');
  assert.strictEqual(w.passes[0].fields.from, 'SFO');
  assert.strictEqual(w.passes[0].barcode.value, 'ABC');
  assert.strictEqual(w.passes[0].barcode.format, 'code128');
  assert.strictEqual(w.passes[1].fields.balance, '12.5');
  assert.strictEqual(w.settings.theme, 'dark');
});

test('pass codes are stored byte-for-byte', () => {
  const value = '  M1DOE/JANE  E^ABC123 é  ';
  const w = normalizeWallet({ passes: [{ template: 'flight', fields: { from: 'AAA', to: 'BBB' }, barcode: { value, format: 'qr', source: 'entered' } }] });
  assert.strictEqual(w.passes[0].barcode.value, value);
});

test('vault: PIN, encryption at rest, lockout and files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-vault-'));
  const v = new Vault(dir, null);
  assert.strictEqual(v.create('12').ok, false, 'short PIN refused');
  assert.ok(v.create('2468').ok);
  v.saveDocs([{ id: 'd1', typeId: 'IN.pan', number: 'ABCDE1234F', holder: 'Test Person' }]);
  const onDisk = fs.readFileSync(path.join(dir, 'docs.bin')).toString('latin1');
  assert.ok(!onDisk.includes('ABCDE1234F') && !onDisk.includes('Test Person'), 'encrypted at rest');
  v.lock();
  assert.throws(() => v.docs(), /locked/);
  assert.strictEqual(v.unlock('0000').ok, false);
  assert.ok(v.unlock('2468').ok);
  assert.strictEqual(v.docs()[0].number, 'ABCDE1234F');
  const src = path.join(dir, 'front.png');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake image body')]);
  fs.writeFileSync(src, png);
  const r = v.addFile(src);
  assert.ok(r.ok);
  assert.ok(v.readFile(r.file.fileId).equals(png), 'original bytes unchanged');
  fs.writeFileSync(path.join(dir, 'x.txt'), 'hello');
  assert.strictEqual(v.addFile(path.join(dir, 'x.txt')).ok, false, 'unsupported type refused');
  v.lock();
  for (let i = 0; i < 5; i++) v.unlock('1111');
  assert.strictEqual(v.unlock('2468').reason, 'blocked', 'locks out after 5 wrong PINs');
  const o = new Originals(path.join(dir, 'orig'), null);
  const added = o.add(src);
  assert.ok(o.read(added.file.fileId).equals(png));
  fs.rmSync(dir, { recursive: true, force: true });
});
