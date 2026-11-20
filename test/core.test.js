// Run with `npm test` (Node's built-in test runner; no extra packages).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const L = require('../src/renderer/lib.js');
const { WalletStore, normalizeWallet } = require('../src/store.js');
const { sampleWallet } = require('../src/sample-data.js');

test('Code 128 table: every symbol is 11 modules (stop is 13)', () => {
  assert.strictEqual(L.CODE128.length, 107);
  L.CODE128.forEach((p, i) => {
    const sum = [...p].reduce((a, b) => a + Number(b), 0);
    assert.strictEqual(sum, i === 106 ? 13 : 11, `symbol ${i}`);
  });
});

test('Code 128B encodes with the right checksum and length', () => {
  // "PJJ123C" in subset B: 104 + 48*1 + 42*2 + 42*3 + 17*4 + 18*5 + 19*6 + 35*7
  // = 879, and 879 mod 103 = 55.
  const w = L.code128('PJJ123C');
  // start + 7 data + check + stop = 10 symbols; 9 * 6 + 7 elements.
  assert.strictEqual(w.length, 9 * 6 + 7);
  const modules = w.reduce((a, b) => a + b, 0);
  assert.strictEqual(modules, 9 * 11 + 13);
  const check = L.CODE128[55].split('').map(Number);
  assert.deepStrictEqual(w.slice(8 * 6, 9 * 6), check);
  assert.strictEqual(L.code128('é'), null);
  assert.strictEqual(L.code128(''), null);
});

test('Luhn check accepts valid test numbers and rejects typos', () => {
  assert.ok(L.luhnValid('4111 1111 1111 1111'));
  assert.ok(L.luhnValid('5555555555554444'));
  assert.ok(!L.luhnValid('4111 1111 1111 1112'));
  assert.ok(!L.luhnValid('1234'));
});

test('payment card validation', () => {
  const now = new Date(2026, 10, 13);
  const ok = L.validatePaymentCard({ issuer: 'Bank', number: '4111111111111111', expiry: '12/27', holder: 'A B' }, now);
  assert.ok(ok.ok);
  assert.strictEqual(ok.last4, '1111');
  const bad = L.validatePaymentCard({ issuer: '', number: '4111111111111112', expiry: '01/20', holder: '' }, now);
  assert.ok(!bad.ok);
  assert.deepStrictEqual(Object.keys(bad.errors).sort(), ['expiry', 'holder', 'issuer', 'number']);
  assert.strictEqual(L.validatePaymentCard({ issuer: 'B', number: '4111111111111111', expiry: '13/27', holder: 'x' }, now).errors.expiry, 'Use MM/YY');
  assert.ok(L.validatePaymentCard({ issuer: 'B', number: '4111111111111111', expiry: '11/26', holder: 'x' }, now).ok, 'current month is still valid');
});

test('money and barcode validation', () => {
  assert.strictEqual(L.validateMoney('25'), null);
  assert.strictEqual(L.validateMoney('25.5'), null);
  assert.ok(L.validateMoney('25.555'));
  assert.ok(L.validateMoney('abc'));
  assert.ok(L.validateMoney('', { allowEmpty: false }));
  assert.strictEqual(L.validateBarcode('ABC-123'), null);
  assert.ok(L.validateBarcode('ünïcode'));
});

test('search matches across fields', () => {
  const item = { title: 'Skyway Air', subtitle: 'SFO → SEA', fields: { Seat: '12A' } };
  assert.ok(L.matchesQuery(item, 'skyway'));
  assert.ok(L.matchesQuery(item, '12a sfo'));
  assert.ok(!L.matchesQuery(item, 'train'));
});

test('sample data survives normalisation', () => {
  const w = normalizeWallet(sampleWallet());
  assert.strictEqual(w.cards.length, 3);
  assert.strictEqual(w.passes.length, 9);
  assert.strictEqual(w.settings.defaultCardId, 'card_enbd');
  w.passes.filter((p) => p.barcode.value).forEach((p) => assert.strictEqual(p.barcode.source, 'demo', 'sample codes are demos'));
  w.cards.forEach((c) => assert.match(c.last4, /^\d{4}$/));
});

test('normalisation drops bad records and never keeps a full card number', () => {
  const w = normalizeWallet({ cards: [{ last4: '12' }, { last4: '9999', number: '4111111111119999', issuer: 'X' }], passes: [null, { kind: 'weird', title: 'T' }], settings: { theme: 'neon' } });
  assert.strictEqual(w.cards.length, 1);
  assert.strictEqual(w.cards[0].number, undefined);
  assert.strictEqual(w.passes.length, 1);
  assert.strictEqual(w.passes[0].template, 'generic');
  assert.strictEqual(w.settings.theme, 'system');
});

test('store persists, reloads and recovers from a corrupt file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-wallet-test-'));
  const store = new WalletStore(dir);
  const first = store.load();
  assert.strictEqual(first.status, 'new');
  first.wallet.passes[0].fields.passenger = 'Changed';
  store.save(first.wallet);
  const again = store.load();
  assert.strictEqual(again.status, 'loaded');
  assert.strictEqual(again.wallet.passes[0].fields.passenger, 'Changed');
  fs.writeFileSync(path.join(dir, 'wallet.json'), '{ not json');
  const rec = store.load();
  assert.strictEqual(rec.status, 'recovered');
  assert.ok(fs.existsSync(rec.backup), 'corrupt file is kept aside');
  fs.rmSync(dir, { recursive: true, force: true });
});
