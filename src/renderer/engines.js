// Open Wallet — engines: QR encoder, card issuer identification (GCIAE),
// pass-type recognition, calendar/ICS booking detection, masking and
// document-number checks. Pure functions; shared by the page and the tests.
(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./catalog.js') : root.Catalog);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engines = api;
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  // =========================================================================
  // QR Code (ISO/IEC 18004), byte mode, error correction level M, v1–20.
  // The payload is encoded exactly as given (UTF-8); nothing is added.
  // =========================================================================
  const ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
  const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];

  function rawModules(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { const n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
    return r;
  }
  const dataCodewords = (ver) => Math.floor(rawModules(ver) / 8) - ECC_M[ver] * BLOCKS_M[ver];

  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
    return z & 0xff;
  }
  function rsDivisor(degree) {
    const r = new Array(degree).fill(0);
    r[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = gfMul(root, 0x02);
    }
    return r;
  }
  function rsRemainder(data, div) {
    const r = new Array(div.length).fill(0);
    for (const b of data) {
      const f = b ^ r.shift();
      r.push(0);
      div.forEach((c, i) => { r[i] ^= gfMul(c, f); });
    }
    return r;
  }
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(s));
    return Array.from(Buffer.from(s, 'utf8'));
  }

  function qrEncode(text) {
    const bytes = utf8(String(text));
    let ver = 1;
    for (; ver <= 20; ver++) {
      const bits = 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8;
      if (bits <= dataCodewords(ver) * 8) break;
    }
    if (ver > 20) return null; // too long for this encoder
    const cap = dataCodewords(ver) * 8;
    const bb = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1); };
    put(4, 4);
    put(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach((b) => put(b, 8));
    put(0, Math.min(4, cap - bb.length));
    put(0, (8 - (bb.length % 8)) % 8);
    for (let pad = 0xec; bb.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bb.length; i += 8) data.push(parseInt(bb.slice(i, i + 8).join(''), 2));

    // Error correction and interleaving.
    const nb = BLOCKS_M[ver];
    const eccLen = ECC_M[ver];
    const raw = Math.floor(rawModules(ver) / 8);
    const short = nb - (raw % nb);
    const shortLen = Math.floor(raw / nb);
    const div = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < short ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < short) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const codewords = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= short) codewords.push(b[i]); });
    }

    // Function patterns.
    const size = ver * 4 + 17;
    const mods = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { mods[y][x] = dark; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4); }
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const align = [];
    if (ver > 1) {
      const n = Math.floor(ver / 7) + 2;
      const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
      align.push(6);
      for (let pos = size - 7; align.length < n; pos -= step) align.splice(1, 0, pos);
    }
    align.forEach((ax, i) => align.forEach((ay, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    const drawFormat = (mask) => {
      const d = (0 << 3) | mask; // level M = 0b00
      let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((d << 10) | rem) ^ 0x5412;
      const g = (i) => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, g(i));
      set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i));
      set(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((bits >>> i) & 1) !== 0;
        const a = size - 11 + (i % 3), b = Math.floor(i / 3);
        set(a, b, bit); set(b, a, bit);
      }
    }
    // Data placement.
    let bi = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - v : v;
        if (!fn[y][x] && bi < codewords.length * 8) { mods[y][x] = ((codewords[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
      }
    }
    // Masking: try all 8 and keep the lowest penalty.
    const maskFn = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
    ];
    const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[m](x, y)) mods[y][x] = !mods[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      for (let y = 0; y < size; y++) {
        let runX = 1, runY = 1;
        for (let x = 0; x < size; x++) {
          if (mods[y][x]) dark++;
          if (x > 0) {
            if (mods[y][x] === mods[y][x - 1]) { runX++; if (runX === 5) p += 3; else if (runX > 5) p++; } else runX = 1;
            if (mods[x][y] === mods[x - 1][y]) { runY++; if (runY === 5) p += 3; else if (runY > 5) p++; } else runY = 1;
          }
          if (x < size - 1 && y < size - 1) { const c = mods[y][x]; if (c === mods[y][x + 1] && c === mods[y + 1][x] && c === mods[y + 1][x + 1]) p += 3; }
        }
      }
      return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      const pp = penalty();
      if (pp < bestP) { bestP = pp; best = m; }
      applyMask(m);
    }
    applyMask(best); drawFormat(best);
    return { size, modules: mods, version: ver };
  }

  function qrSvg(text, { quiet = 4, label = '' } = {}) {
    const q = qrEncode(text);
    if (!q) return '';
    const n = q.size + quiet * 2;
    let d = '';
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.modules[y][x]) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    return `<svg class="qr-svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${label || 'QR code'}"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  // =========================================================================
  // GCIAE — Global Card Issuer Identification & Artwork Engine.
  // Input: up to the first 8 digits (never the full number) plus the
  // person's choices. Output: network, issuer, product and a match level.
  // =========================================================================
  function networkFor(prefix) {
    const d = String(prefix || '').replace(/\D/g, '').slice(0, 8);
    if (!d) return null;
    let best = null, bestLen = 0;
    for (const n of C.NETWORKS) {
      for (const r of n.ranges) {
        const [lo, hi] = r.split('-');
        const len = lo.length;
        if (d.length < len) continue;
        const head = Number(d.slice(0, len));
        if (head >= Number(lo) && head <= Number(hi || lo) && len > bestLen) {
          if (n.id === 'rupay' && /^6011/.test(d)) continue; // 6011 is Discover
          best = n; bestLen = len;
        }
      }
    }
    return best;
  }

  // learned: { '<prefix>': issuerId } — prefixes the person confirmed here.
  function identifyCard({ prefix = '', issuerId = '', productId = '', networkId = '', learned = {} } = {}) {
    const d = String(prefix).replace(/\D/g, '').slice(0, 8);
    const net = networkId ? C.network(networkId) : networkFor(d);
    let iss = issuerId ? C.issuer(issuerId) : null;
    let issuerSource = iss ? 'chosen' : '';
    if (!iss && d.length >= 6) {
      for (const len of [8, 7, 6]) {
        const p = d.slice(0, len);
        if (learned[p]) { iss = C.issuer(learned[p]); issuerSource = 'learned'; break; }
        const hit = C.ISSUERS.find((b) => b.iins.includes(p));
        if (hit) { iss = hit; issuerSource = 'catalogue'; break; }
      }
    }
    if (iss && iss.networkLocked && !networkId) {
      const locked = C.network(iss.networkLocked);
      if (!net || net.id !== locked.id) return finish(iss, null, locked, issuerSource, d);
    }
    const prod = iss && productId ? iss.products.find((p) => p.id === productId) || null : null;
    return finish(iss, prod, net, issuerSource, d);
  }
  function finish(iss, prod, net, issuerSource, d) {
    let level, label;
    if (iss && prod) { level = 'product'; label = `${iss.name} ${prod.name}`; }
    else if (iss && net) { level = 'issuer-network'; label = `${iss.name} · ${net.name}`; }
    else if (iss) { level = 'issuer'; label = iss.name; }
    else if (net) { level = 'network'; label = `${net.name} card`; }
    else { level = 'fallback'; label = 'Card'; }
    const productNetworkMismatch = !!(prod && net && prod.networks.length && !prod.networks.includes(net.id));
    return { issuer: iss, product: prod, network: net, level, label, issuerSource, digits: d.length, productNetworkMismatch };
  }
  const MATCH_TEXT = {
    product: 'Issuer and product: Open Wallet design in the issuer’s colours',
    'issuer-network': 'Issuer and network: Open Wallet design in the issuer’s colours',
    issuer: 'Issuer only: Open Wallet design in the issuer’s colours',
    network: 'Network only: neutral design',
    fallback: 'Not identified: neutral design'
  };

  // =========================================================================
  // Pass-type recognition from free text (imports, calendar events, OCR
  // suggestions). Returns ranked guesses; never invents values.
  // =========================================================================
  const RX = {
    flight: /\b(flight|boarding|airlines?|airways|depart(ure)? terminal|gate\s?\w+|PNR|e-?ticket|baggage)\b/i,
    flightNo: /\b([A-Z][A-Z0-9]|[A-Z0-9][A-Z])\s?(\d{2,4})\b/,
    iataPair: /\b([A-Z]{3})\s*(?:→|->|–|-|to)\s*([A-Z]{3})\b/,
    train: /\b(train|rail(way)?|coach\s?[A-Z]?\d|berth|platform|IRCTC|express|shatabdi|rajdhani|vande bharat|amtrak|eurostar)\b/i,
    bus: /\b(bus|coach ticket|RTC|redbus|flixbus|greyhound|megabus|boarding point)\b/i,
    ferry: /\b(ferry|cruise|vessel|embark(ation)?|port)\b/i,
    movie: /\b(movie|cinema|film|screen\s?\d+|IMAX|4DX|PVR|INOX|showtime|audi(torium)?)\b/i,
    hotel: /\b(hotel|check-?in|check-?out|reservation at|stay at|resort|room type|nights?)\b/i,
    sports: /\b(match|vs\.?|v\.|stadium|kick-?off|fixture|cricket|football|IPL)\b/i,
    event: /\b(concert|festival|tickets?|theatre|theater|show|gig|exhibition|museum|live)\b/i,
    parking: /\b(parking|car park|valet)\b/i,
    ref: /\b(?:PNR|booking\s*(?:id|ref(?:erence)?|no\.?|number)|confirmation\s*(?:code|no\.?|number|#)?|ref(?:erence)?\s*(?:no\.?|#)?|order\s*(?:id|no\.?|#))\s*[:#-]?\s*([A-Z0-9]{5,12})\b/i,
    seat: /\bseats?\s*[:#-]?\s*([A-Z]?\d{1,3}[A-Z]?(?:\s*,\s*[A-Z]?\d{1,3}[A-Z]?)*)\b/i,
    gate: /\bgate\s*[:#-]?\s*([A-Z]?\d{1,3}[A-Z]?)\b/i,
    terminal: /\bterminal\s*[:#-]?\s*([A-Z0-9]{1,3})\b/i,
    trainNo: /\b(?:train\s*(?:no\.?|number|#)?\s*[:#-]?\s*)(\d{4,5})\b/i,
    row: /\brow\s*[:#-]?\s*([A-Z]{1,2}|\d{1,3})\b/i,
    screen: /\b(screen|audi(?:torium)?)\s*[:#-]?\s*(\d{1,2}|[A-Z])\b/i
  };
  const MEETING = /\b(meeting|sync|standup|stand-up|1:1|one-on-one|call|zoom|teams|google meet|interview|review|lunch with|catch ?up|webinar|class|lecture|dentist|doctor|appointment|birthday|reminder)\b/i;

  function recogniseText(text) {
    const t = String(text || '');
    const scores = {};
    const bump = (k, n) => { scores[k] = (scores[k] || 0) + n; };
    if (RX.flight.test(t)) bump('flight', 2);
    if (RX.iataPair.test(t)) bump('flight', 2);
    if (RX.train.test(t)) bump('train', 3);
    if (RX.bus.test(t)) bump('bus', 3);
    if (RX.ferry.test(t)) bump('ferry', 2);
    if (RX.movie.test(t)) bump('movie', 3);
    if (RX.hotel.test(t)) bump('hotel', 3);
    if (RX.sports.test(t)) bump('sports', 2);
    if (RX.event.test(t)) bump('event', 2);
    if (RX.parking.test(t)) bump('parking', 3);
    // Provider names are strong signals.
    const nt = C.norm(t);
    let prov = null;
    for (const p of C.PROVIDERS) {
      if (!['flight', 'train', 'bus', 'ferry', 'movie', 'hotel', 'event', 'parking'].includes(p.cat)) continue;
      const n = C.norm(p.name);
      if (n.length > 2 && (` ${nt} `).includes(` ${n} `)) { bump(p.cat, 4); if (!prov || n.length > C.norm(prov.name).length) prov = p; }
    }
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return { ranked, best: ranked.length ? ranked[0][0] : null, score: ranked.length ? ranked[0][1] : 0, provider: prov };
  }

  // =========================================================================
  // Calendar booking detection. `ev` = { id, title, description, location,
  // start, end, allDay, organizer }. Only fields found in the event are
  // filled; missing ones are listed so the person can review them.
  // =========================================================================
  const pad2 = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const isoTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  function detectBooking(ev) {
    const text = [ev.title, ev.description, ev.location, ev.organizer].filter(Boolean).join('\n');
    const rec = recogniseText(text);
    const ref = (text.match(RX.ref) || [])[1] || '';
    const meeting = MEETING.test(ev.title || '');
    let confidence = rec.score + (ref ? 3 : 0) + (rec.provider ? 1 : 0) - (meeting ? 6 : 0);
    if (!rec.best || confidence < 4) return null; // ordinary events never become passes
    const template = rec.best;
    const start = ev.start ? new Date(ev.start) : null;
    const end = ev.end ? new Date(ev.end) : null;
    const f = {};
    if (start && !isNaN(start)) { f.date = isoDate(start); if (!ev.allDay) f.time = isoTime(start); }
    if (ref) f.ref = ref.toUpperCase();
    const seat = (text.match(RX.seat) || [])[1];
    if (seat) f.seat = seat.toUpperCase();
    if (template === 'flight') {
      const pair = text.match(RX.iataPair);
      if (pair) { f.from = pair[1]; f.to = pair[2]; }
      const fl = (ev.title || '').match(RX.flightNo) || text.match(RX.flightNo);
      if (fl) f.flightNo = `${fl[1]}${fl[2]}`;
      const g = text.match(RX.gate); if (g) f.gate = g[1].toUpperCase();
      const te = text.match(RX.terminal); if (te) f.terminal = te[1].toUpperCase();
      if (end && !isNaN(end) && !ev.allDay) f.arrive = isoTime(end);
    } else if (template === 'train') {
      const tn = text.match(RX.trainNo); if (tn) f.trainNo = tn[1];
      const m = (ev.title || '').match(/(.+?)\s+(?:to|→|->)\s+(.+)/i);
      if (m) { f.from = m[1].replace(/^.*(train|rail)\s*/i, '').trim(); f.to = m[2].trim(); }
      if (end && !isNaN(end) && !ev.allDay) f.arrive = isoTime(end);
    } else if (template === 'bus' || template === 'ferry') {
      const m = (ev.title || '').match(/(.+?)\s+(?:to|→|->)\s+(.+)/i);
      if (m) { f.from = m[1].replace(/^.*(bus|ferry)\s*/i, '').trim(); f.to = m[2].trim(); }
    } else if (template === 'movie') {
      f.title = (ev.title || '').replace(/^(movie|cinema)\s*[:\-–]\s*/i, '').replace(/\s*[@|].*$/, '').trim();
      if (ev.location) f.branch = ev.location;
      const sc = text.match(RX.screen); if (sc) f.screen = sc[2];
      const rw = text.match(RX.row); if (rw) f.row = rw[1];
    } else if (template === 'hotel') {
      f.property = (ev.title || '').replace(/^(stay at|hotel|reservation at)\s*[:\-–]?\s*/i, '').trim();
      if (ev.location) f.address = ev.location;
      if (end && !isNaN(end)) f.checkout = isoDate(end);
    } else if (template === 'event' || template === 'sports') {
      f.title = (ev.title || '').trim();
      if (ev.location) f.venue = ev.location;
    } else if (template === 'parking') {
      f.facility = ev.location || ev.title || '';
    }
    const req = C.TEMPLATES[template].fields.filter((x) => x.req).map((x) => x.k);
    const missing = req.filter((k) => !f[k]);
    return { template, provider: rec.provider ? rec.provider.id : '', fields: f, missing, confidence: Math.min(10, confidence), title: ev.title || '' };
  }

  // Minimal RFC 5545 reader: VEVENTs with UID, SUMMARY, DESCRIPTION,
  // LOCATION, DTSTART, DTEND, ORGANIZER, STATUS.
  function parseIcs(text) {
    const lines = String(text || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
    const out = [];
    let cur = null;
    const unesc = (v) => v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
    const when = (v, params) => {
      const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
      if (!m) return { iso: '', allDay: false };
      if (!m[4]) return { iso: new Date(+m[1], +m[2] - 1, +m[3]).toISOString(), allDay: true };
      const d = m[7] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))) : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
      return { iso: d.toISOString(), allDay: /VALUE=DATE(?!-)/.test(params) };
    };
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
      if (line === 'END:VEVENT') { if (cur) out.push(cur); cur = null; continue; }
      if (!cur) continue;
      const i = line.indexOf(':');
      if (i < 0) continue;
      const head = line.slice(0, i), val = line.slice(i + 1);
      const [name, ...ps] = head.split(';');
      const params = ps.join(';');
      if (name === 'UID') cur.id = val;
      else if (name === 'SUMMARY') cur.title = unesc(val);
      else if (name === 'DESCRIPTION') cur.description = unesc(val).slice(0, 2000);
      else if (name === 'LOCATION') cur.location = unesc(val);
      else if (name === 'ORGANIZER') cur.organizer = (params.match(/CN=([^;:]+)/) || [])[1] || '';
      else if (name === 'STATUS') cur.status = val;
      else if (name === 'DTSTART') { const w = when(val, params); cur.start = w.iso; cur.allDay = w.allDay; }
      else if (name === 'DTEND') cur.end = when(val, params).iso;
    }
    return out.filter((e) => e.id && e.start);
  }

  // =========================================================================
  // Masking and document-number checks.
  // =========================================================================
  function mask(value, rule = 'last4') {
    const v = String(value || '');
    if (!v) return '';
    if (rule === 'none') return v;
    const clean = v.replace(/[\s-]/g, '');
    if (clean.length <= 4) return '•'.repeat(clean.length);
    const tail = clean.slice(-4);
    const groups = Math.ceil((clean.length - 4) / 4);
    return `${Array(groups).fill('XXXX').join(' ')} ${tail}`;
  }

  const VD = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
  const VP = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
  function verhoeffValid(num) {
    const d = String(num).replace(/\D/g, '');
    if (!d) return false;
    let c = 0;
    d.split('').reverse().forEach((ch, i) => { c = VD[c][VP[i % 8][Number(ch)]]; });
    return c === 0;
  }

  // Returns '' when fine, or a message. A format check, never a verification.
  function checkDocNumber(type, value) {
    const v = String(value || '').trim().toUpperCase();
    if (!v) return '';
    if (type.pattern && !new RegExp(type.pattern).test(v)) return `This doesn’t look like a ${type.numberLabel.toLowerCase()}. Check it and try again`;
    if (type.check === 'verhoeff' && !verhoeffValid(v)) return 'This number fails the Aadhaar check digit. Check it for typing mistakes';
    return '';
  }

  return { qrEncode, qrSvg, networkFor, identifyCard, MATCH_TEXT, recogniseText, detectBooking, parseIcs, mask, verhoeffValid, checkDocNumber };
});
