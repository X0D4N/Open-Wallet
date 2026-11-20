// Pure helpers shared by the page and the Node tests: barcode encoding,
// card-number checks, form validation and formatting.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WalletLib = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- Code 128 (subset B) -------------------------------------------------
  // Bar/space widths for symbol values 0..106 (106 = stop, 7 elements).
  const CODE128 = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
  ];
  const START_B = 104;
  const STOP = 106;

  // Returns the module widths (bar, space, bar, ...) for `text`, or null when
  // the text has characters outside printable ASCII.
  function code128(text) {
    const value = String(text || '');
    if (!value.length || !/^[\x20-\x7e]+$/.test(value)) return null;
    const codes = [START_B];
    for (const ch of value) codes.push(ch.charCodeAt(0) - 32);
    let sum = START_B;
    for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
    codes.push(sum % 103, STOP);
    const widths = [];
    for (const c of codes) for (const w of CODE128[c]) widths.push(Number(w));
    return widths;
  }

  function code128Svg(text, opts) {
    const o = Object.assign({ height: 80, quiet: 10, color: '#000' }, opts);
    const widths = code128(text);
    if (!widths) return '';
    const total = widths.reduce((a, b) => a + b, 0) + o.quiet * 2;
    let x = o.quiet;
    let rects = '';
    widths.forEach((w, i) => {
      if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${o.height}"/>`;
      x += w;
    });
    return `<svg class="barcode-svg" viewBox="0 0 ${total} ${o.height}" preserveAspectRatio="none" role="img" aria-label="Barcode ${escapeHtml(text)}" fill="${o.color}">${rects}</svg>`;
  }

  // ---- Payment card checks ---------------------------------------------------
  function digitsOnly(s) { return String(s || '').replace(/\D/g, ''); }

  function luhnValid(number) {
    const d = digitsOnly(number);
    if (d.length < 12 || d.length > 19) return false;
    let sum = 0;
    let dbl = false;
    for (let i = d.length - 1; i >= 0; i--) {
      let n = d.charCodeAt(i) - 48;
      if (dbl) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
      dbl = !dbl;
    }
    return sum % 10 === 0;
  }

  // Groups digits in fours for display while typing.
  function formatCardNumber(s) {
    return digitsOnly(s).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
  }

  // Parses "MM/YY" or "MM/YYYY". Returns {month, year} or null.
  function parseExpiry(s) {
    const m = String(s || '').trim().match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);
    if (!m) return null;
    const month = Number(m[1]);
    let year = Number(m[2]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12) return null;
    return { month, year };
  }

  function expiryInFuture(exp, now) {
    const d = now || new Date();
    return exp.year > d.getFullYear() || (exp.year === d.getFullYear() && exp.month >= d.getMonth() + 1);
  }

  function validatePaymentCard(input, now) {
    const errors = {};
    const number = digitsOnly(input.number);
    if (!number) errors.number = 'Enter the card number';
    else if (number.length < 12 || number.length > 19) errors.number = 'Card numbers have 12 to 19 digits';
    else if (!luhnValid(number)) errors.number = "This card number doesn't look right. Check it and try again";
    const exp = parseExpiry(input.expiry);
    if (!String(input.expiry || '').trim()) errors.expiry = 'Enter the expiry date';
    else if (!exp) errors.expiry = 'Use MM/YY';
    else if (!expiryInFuture(exp, now)) errors.expiry = 'This card has expired';
    if (!String(input.holder || '').trim()) errors.holder = 'Enter the name on the card';
    if (!String(input.issuer || '').trim()) errors.issuer = 'Enter the bank or card issuer';
    return { ok: Object.keys(errors).length === 0, errors, last4: number.slice(-4), exp };
  }

  function validateRequired(input, fields) {
    const errors = {};
    for (const [key, label] of fields) {
      if (!String(input[key] || '').trim()) errors[key] = `Enter ${label}`;
    }
    return errors;
  }

  function validateMoney(s, { allowEmpty = true, max = 100000 } = {}) {
    const t = String(s == null ? '' : s).trim();
    if (!t) return allowEmpty ? null : 'Enter an amount';
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return 'Use a number like 25 or 25.50';
    const v = Number(t);
    if (v > max) return `Amount must be ${max.toLocaleString('en-US')} or less`;
    return null;
  }

  function validateBarcode(s) {
    const t = String(s || '');
    if (!t.trim()) return null;
    if (!/^[\x20-\x7e]+$/.test(t)) return 'Use letters, numbers and common symbols only';
    if (t.length > 48) return 'Barcodes can have up to 48 characters';
    return null;
  }

  // ---- Formatting ------------------------------------------------------------
  function money(amount, currency) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
    } catch {
      return `${(amount || 0).toFixed(2)} ${currency || ''}`.trim();
    }
  }

  function shortDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function longDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function time(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function relativeDay(iso, now) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const base = now || new Date();
    const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const b = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate());
    const diff = Math.round((a - b) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === -1) return 'Yesterday';
    if (diff === 1) return 'Tomorrow';
    if (diff > 1 && diff < 7) return `In ${diff} days`;
    return shortDate(iso);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function matchesQuery(item, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    const hay = [item.title, item.subtitle, item.issuer, item.nickname, item.network, item.last4, item.kind]
      .concat(item.fields ? Object.values(item.fields) : [])
      .filter(Boolean).join(' ').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  }

  return {
    CODE128, code128, code128Svg, digitsOnly, luhnValid, formatCardNumber, parseExpiry, expiryInFuture,
    validatePaymentCard, validateRequired, validateMoney, validateBarcode, money, shortDate, longDate, time,
    relativeDay, escapeHtml, initials, matchesQuery
  };
});
