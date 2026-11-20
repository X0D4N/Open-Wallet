// Open Wallet — artwork: one data-driven renderer for payment cards, one for
// passes (12 category templates with original vector illustrations) and one
// for identity-document previews. Nothing here is a copy of a real card,
// ticket or document; provider identity is shown as a text wordmark.
(function (root) {
  'use strict';

  const C = root.Catalog;
  const E = root.Engines;
  const L = root.WalletLib;
  const I = root.Icons;
  const esc = L.escapeHtml;

  // ---------------- Colour helpers ----------------
  function hex(c) { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); return m ? parseInt(m[1], 16) : 0x46546b; }
  function rgb(c) { const n = hex(c); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function lum(c) { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
  function shade(c, f) { const [r, g, b] = rgb(c).map((v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)))); return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`; }
  const inkOn = (bg) => (lum(bg) > 0.42 ? '#1b1b1b' : '#ffffff');

  // ---------------- Dates ----------------
  function when(f) {
    if (!f || !f.date) return null;
    const d = new Date(`${f.date}T${f.time || '00:00'}`);
    return isNaN(d) ? null : d;
  }
  const fmtDate = (s, o) => { const d = new Date(`${s}T00:00`); return isNaN(d) ? s : d.toLocaleDateString(undefined, o || { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
  const fmtTime = (s) => { const d = new Date(`2000-01-01T${s}`); return isNaN(d) ? s : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };

  // ---------------- Wordmark logo ----------------
  function abbrev(name) {
    const n = String(name || '?').replace(/\(.*?\)/g, '').replace(/gift card|card/ig, '').trim();
    if (n.length <= 8) return n;
    const words = n.split(/[\s·&-]+/).filter((w) => w && !/^(of|the|and|de|la)$/i.test(w));
    if (words[0] && words[0].length <= 7 && words.length > 1 && /^[A-Z0-9]+$/.test(words[0])) return words[0]; // e.g. "UPSRTC", "HDFC"
    return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
  }
  // A round text wordmark. Size scales with the circle (sm 32, default 40, lg 52 px).
  function logo(name, color, fg, cls = '') {
    const t = abbrev(name);
    const d = /\bsm\b/.test(cls) ? 32 : /\blg\b/.test(cls) ? 52 : 40;
    const base = t.length <= 2 ? 15 : t.length <= 3 ? 13 : t.length <= 4 ? 11 : t.length <= 6 ? 9 : 7.5;
    return `<span class="wm-logo ${cls}" style="background:${esc(color)};color:${esc(fg || inkOn(color))};font-size:${(base * d / 40).toFixed(1)}px" aria-hidden="true">${esc(t)}</span>`;
  }

  // =========================================================================
  // Payment cards
  // =========================================================================
  function cardMatch(c) {
    return E.identifyCard({ issuerId: c.issuerId, productId: c.productId, networkId: c.networkId });
  }

  function cardArt(c, opts = {}) {
    const m = cardMatch(c);
    const iss = m.issuer;
    const prod = m.product;
    const net = m.network;
    const tier = prod ? prod.tier : iss ? 'issuer' : net ? 'network' : 'fallback';
    let c1, c2;
    if (c.color) { c1 = c.color; c2 = shade(c.color, -0.35); }
    else if (iss) { [c1, c2] = iss.colors; }
    else { c1 = '#3c4043'; c2 = '#202124'; }
    let bg, fg = iss && !c.color ? iss.fg : inkOn(c1), shapes = '';
    if (tier === 'premium') {
      bg = `linear-gradient(135deg, #26262b 0%, #3b3b42 42%, #17171a 100%)`; fg = '#f1ede4';
      shapes = `<path d="M0 150 C 90 120 200 210 320 120 L320 202 L0 202 Z" fill="${esc(c1)}" opacity=".55"/><path d="M0 158 C 90 128 200 218 320 128" stroke="${esc(c2 === c1 ? shade(c1, 0.3) : c2)}" stroke-width="2" fill="none" opacity=".8"/>`;
    } else if (tier === 'mid' || tier === 'issuer') {
      bg = `linear-gradient(140deg, ${c1} 0%, ${shade(c1, -0.25)} 100%)`;
      shapes = `<path d="M150 0 C 210 60 230 140 320 170 L320 0 Z" fill="${esc(c2)}" opacity=".55"/><path d="M200 0 C 250 70 260 150 320 182" stroke="#fff" stroke-opacity=".18" stroke-width="1.5" fill="none"/>`;
    } else if (tier === 'entry') {
      bg = c1;
      shapes = `<path d="M-10 140 L 330 40 L 330 90 L -10 190 Z" fill="${esc(c2)}" opacity=".45"/>`;
    } else if (tier === 'network') {
      bg = 'linear-gradient(140deg, #46484d 0%, #24262a 100%)'; fg = '#ffffff';
      shapes = Array.from({ length: 7 }, (_, i) => `<path d="M${-40 + i * 60} 202 L ${60 + i * 60} 0" stroke="#fff" stroke-opacity=".05" stroke-width="18"/>`).join('');
    } else {
      bg = c.color ? `linear-gradient(140deg, ${c1}, ${c2})` : 'linear-gradient(140deg, #5f6368 0%, #3c4043 100%)'; fg = c.color ? inkOn(c1) : '#ffffff';
    }
    const issuerName = iss ? iss.name : (c.issuerName || 'Card');
    const prodName = prod ? prod.name : (c.productName || '');
    const exp = c.showExpiry && c.expMonth ? `${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}` : '';
    const kind = c.kind ? c.kind[0].toUpperCase() + c.kind.slice(1) : '';
    return `<div class="pay-card art-${tier}" ${opts.shared ? 'data-shared="1"' : ''} style="background:${esc(bg)};color:${esc(fg)}" role="img" aria-label="${esc(`${issuerName} ${prodName} card ending ${c.last4}`)}">
      <svg class="card-bg" viewBox="0 0 320 202" preserveAspectRatio="none" aria-hidden="true">${shapes}</svg>
      <div class="ca-top"><div class="ca-issuer">${esc(issuerName)}</div><div class="ca-kind">${esc(kind)}</div></div>
      ${prodName ? `<div class="ca-product">${esc(prodName)}</div>` : ''}
      ${c.contactless ? `<span class="ca-cl">${I.contactless()}</span>` : ''}
      <div class="ca-bottom">
        <div><div class="ca-digits">•••• ${esc(c.last4)}</div>${(c.showHolder && c.holder) || exp ? `<div class="ca-meta">${esc(c.showHolder && c.holder ? c.holder : '')}${c.showHolder && c.holder && exp ? ' · ' : ''}${exp ? `Exp ${esc(exp)}` : ''}</div>` : ''}</div>
        <div class="ca-net">${net ? esc(net.name) : ''}<span class="ca-tag">Display only</span></div>
      </div>
    </div>`;
  }

  // =========================================================================
  // Passes
  // =========================================================================
  const TPL_COLOR = { movie: '#1f1f1f', flight: '#3d5a80', train: '#2f4858', bus: '#8a3b12', ferry: '#0b5d8f', transit: '#4a3b7a', event: '#5b2a86',
    sports: '#1e6b3a', hotel: '#6b4f2a', parking: '#1f4e79', loyalty: '#2b6b4f', gift: '#8a5a00', generic: '#46546b' };
  const LIGHT_TPL = { movie: true, hotel: true };

  function passInfo(p) {
    const t = C.TEMPLATES[p.template] || C.TEMPLATES.generic;
    const prov = p.providerId ? C.provider(p.providerId) : null;
    const f = p.fields || {};
    const provName = prov ? (prov.cat === 'transit' ? prov.sub : prov.name.replace(/\s*\(India\)$/, '')) : (p.providerName || '');
    const color = p.color || (prov ? prov.color : TPL_COLOR[p.template] || TPL_COLOR.generic);
    const light = !p.color && (LIGHT_TPL[p.template] || (prov && prov.surface));
    const surface = light ? ((prov && prov.surface) || '#ffffff') : color;
    const fg = light ? ((prov && prov.ink) || '#1b1b1b') : (prov && !p.color ? prov.fg : inkOn(color));
    const route = (a, b) => (a || b ? `${a || '—'} → ${b || '—'}` : '');
    let title, sub;
    switch (p.template) {
      case 'flight': title = route(f.from, f.to); sub = [provName, f.flightNo].filter(Boolean).join(' · '); break;
      case 'train': title = route(f.from, f.to); sub = [provName, f.trainName, f.trainNo].filter(Boolean).join(' · '); break;
      case 'bus': case 'ferry': title = route(f.from, f.to); sub = [provName, f.route || f.vessel].filter(Boolean).join(' · '); break;
      case 'transit': title = provName || 'Transport pass'; sub = [f.passType, prov && prov.city].filter(Boolean).join(' · '); break;
      case 'hotel': title = f.property || provName || 'Hotel'; sub = [provName !== f.property ? provName : '', f.checkout ? `Until ${fmtDate(f.checkout, { day: 'numeric', month: 'short' })}` : ''].filter(Boolean).join(' · '); break;
      case 'parking': title = f.facility || provName || 'Parking'; sub = [provName, f.vehicle].filter(Boolean).join(' · '); break;
      case 'loyalty': title = provName || 'Loyalty card'; sub = [prov ? prov.sub : '', f.points ? `${f.points} pts` : ''].filter(Boolean).join(' · '); break;
      case 'gift': title = provName || 'Gift card'; sub = f.balance ? `${L.money(Number(f.balance), p.currency || 'USD')} (your note)` : 'Gift card'; break;
      case 'movie': title = f.title || 'Movie'; sub = [provName, f.branch].filter(Boolean).join(' · '); break;
      case 'event': case 'sports': title = f.title || t.label; sub = [f.venue, provName].filter(Boolean).join(' · '); break;
      default: title = f.title || p.providerName || 'Pass'; sub = f.subtitle || provName || '';
    }
    return { t, prov, f, provName, color, surface, fg, light, title, sub, when: when(f), icon: t.icon, motif: (prov && prov.scene) || t.motif };
  }

  function badgeFor(p, info) {
    if (info.when) {
      const days = (info.when - Date.now()) / 86400000;
      const d0 = new Date(); d0.setHours(0, 0, 0, 0);
      if (info.when < d0) return 'Date passed';
      if (days < 14) return L.relativeDay(info.when.toISOString());
    }
    if (p.template === 'gift' && p.fields.balance) return L.money(Number(p.fields.balance), p.currency || 'USD');
    return '';
  }

  // Home grid tile.
  function passTile(p, i = 0) {
    const v = passInfo(p);
    const badge = badgeFor(p, v);
    const bg = v.light ? v.color : v.color;
    const fg = v.light ? inkOn(v.color) : v.fg;
    return `<button class="pass-tile enter" style="--tile-bg:${esc(bg)};--tile-fg:${esc(fg)};animation-delay:${60 + i * 40}ms" data-act="open-pass" data-id="${esc(p.id)}" aria-label="${esc(`${v.title}, ${v.t.label}`)}">
      <span class="pt-top">${logo(v.provName || v.title, shade(bg, lum(bg) > 0.4 ? -0.12 : 0.18), fg, 'sm')}${p.favorite ? `<span class="pt-fav" title="Favourite">${I.icon('star')}</span>` : ''}${badge ? `<span class="pt-badge">${esc(badge)}</span>` : ''}</span>
      <span class="pt-motif" aria-hidden="true">${I.icon(v.icon)}</span>
      <span class="pt-title">${esc(v.title)}</span><span class="pt-sub">${esc(v.sub || v.t.label)}</span>
    </button>`;
  }

  // Wide "next up" tile for the soonest trip or event.
  function passFeatured(p) {
    const v = passInfo(p);
    const f = v.f;
    const bg = v.color;
    const fg = v.light ? inkOn(bg) : v.fg;
    const isRoute = ['flight', 'train', 'bus', 'ferry'].includes(p.template);
    const line1 = isRoute ? `<span class="pf-route"><b>${esc(f.from || '—')}</b>${I.icon(v.icon, 'pf-mid')}<b>${esc(f.to || '—')}</b></span>` : `<span class="pf-big">${esc(v.title)}</span>`;
    const bits = [];
    if (p.template === 'flight') { if (f.gate) bits.push(`Gate ${f.gate}`); if (f.terminal) bits.push(`Terminal ${f.terminal}`); }
    if (p.template === 'train') { if (f.coach) bits.push(`Coach ${f.coach}`); if (f.seat) bits.push(`Seat ${f.seat}`); }
    if (['movie', 'event', 'sports'].includes(p.template)) { if (f.row) bits.push(`Row ${f.row}`); if (f.seat) bits.push(`Seat ${f.seat}`); }
    const timeLabel = p.template === 'flight' && f.boarding ? `Boarding ${fmtTime(f.boarding)}` : v.when ? `${L.relativeDay(v.when.toISOString())} · ${fmtTime(f.time || '00:00')}` : '';
    return `<button class="pass-featured enter" style="--tile-bg:${esc(bg)};--tile-fg:${esc(fg)}" data-act="open-pass" data-id="${esc(p.id)}" aria-label="${esc(`Next: ${v.title}`)}">
      <span class="pf-head">${logo(v.provName || v.title, shade(bg, lum(bg) > 0.4 ? -0.12 : 0.18), fg, 'sm')}<span class="pf-prov">${esc(v.sub)}</span></span>
      ${line1}
      <span class="pf-foot"><span class="pf-meta">${esc(bits.join(' · '))}${bits.length ? '<br>' : ''}${esc(timeLabel)}</span>
        <span class="pf-chip">${esc(badgeFor(p, v) || 'Upcoming')}</span>${p.barcode && p.barcode.value ? `<span class="pf-qr">${I.icon('qr')}</span>` : ''}</span>
    </button>`;
  }

  // ---------------- Vector illustrations (original drawings) ----------------
  function motif(name, ink, accent) {
    const W = 'viewBox="0 0 360 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true"';
    const k = esc(ink), a = esc(accent || ink);
    switch (name) {
      case 'film': {
        const path = 'M-30 112 C 40 70 110 128 190 92 S 320 34 400 66';
        const off = (dy) => `<path d="${path}" transform="translate(0 ${dy})" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="4 7"/>`;
        return `<svg class="motif" ${W}><path d="${path}" fill="none" stroke="#141414" stroke-width="40"/><path d="${path}" fill="none" stroke="#efefef" stroke-width="22" stroke-dasharray="34 5"/>${off(-14)}${off(14)}</svg>`;
      }
      case 'plane':
        return `<svg class="motif" ${W}><g fill="${k}" opacity=".16"><path d="M0 104 H360 V120 H0z"/></g>
          <g stroke="${k}" stroke-opacity=".28" stroke-width="2" stroke-linecap="round"><path d="M8 92 H120"/><path d="M30 100 H150"/></g>
          <g fill="${k}" opacity=".9" transform="translate(70 4) rotate(-8 160 70)">
            <path d="M40 80 C 60 72 220 60 290 56 C 310 55 324 60 318 67 C 312 73 290 75 262 77 L 62 91 C 48 92 37 87 40 80 Z"/>
            <path d="M150 74 L 210 71 L 168 112 L 150 112 Z"/><path d="M48 82 L 28 44 L 48 44 L 84 78 Z"/><path d="M54 86 L 34 98 L 48 98 L 78 86 Z"/>
            <ellipse cx="176" cy="88" rx="16" ry="6"/></g>
          <g fill="${a}" opacity=".9" transform="translate(70 4) rotate(-8 160 70)">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<circle cx="${110 + i * 18}" cy="${71 - i * 0.9}" r="2.4" fill="#fff" opacity=".7"/>`).join('')}</g></svg>`;
      case 'city':
        return `<svg class="motif" ${W}><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6c79e"/><stop offset="1" stop-color="#f4e6d6"/></linearGradient></defs>
          <rect width="360" height="120" fill="url(#sky)"/>
          <g fill="#c98f6b"><rect x="18" y="66" width="70" height="54"/><circle cx="53" cy="62" r="18"/><rect x="50" y="36" width="6" height="14"/><rect x="24" y="58" width="8" height="10"/><rect x="74" y="58" width="8" height="10"/></g>
          <g fill="#a9745a"><rect x="150" y="22" width="44" height="98"/><rect x="160" y="10" width="24" height="14"/></g>
          <g fill="#d9a785"><rect x="100" y="78" width="40" height="42"/><rect x="206" y="70" width="56" height="50"/><rect x="270" y="56" width="32" height="64"/><circle cx="286" cy="54" r="10"/><rect x="310" y="80" width="40" height="40"/></g>
          <g fill="#fff" opacity=".45">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="${156 + (i % 3) * 12}" y="${32 + Math.floor(i / 3) * 18}" width="6" height="9"/>`).join('')}</g></svg>`;
      case 'train':
        return `<svg class="motif" ${W}><g fill="${k}"><path d="M-10 58 H262 C 318 58 350 82 358 100 L 358 106 H -10 Z" opacity=".88"/></g>
          <rect x="0" y="66" width="270" height="12" rx="3" fill="${a}" opacity=".5"/>
          <g fill="#fff" opacity=".55">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<rect x="${8 + i * 30}" y="68" width="22" height="8" rx="2"/>`).join('')}<path d="M300 66 C 322 70 338 80 344 90 L 300 90 Z"/></g>
          <rect x="-10" y="110" width="380" height="3" fill="${k}" opacity=".6"/><g stroke="${k}" stroke-opacity=".35" stroke-width="3">${Array.from({ length: 19 }, (_, i) => `<path d="M${i * 20} 113 V118"/>`).join('')}</g></svg>`;
      case 'bus':
        return `<svg class="motif" ${W}><rect x="40" y="40" width="270" height="64" rx="14" fill="${k}" opacity=".88"/>
          <g fill="#fff" opacity=".55">${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${58 + i * 36}" y="50" width="28" height="22" rx="3"/>`).join('')}<rect x="280" y="50" width="22" height="34" rx="3"/></g>
          <rect x="40" y="80" width="270" height="6" fill="${a}" opacity=".6"/><g fill="${k}"><circle cx="90" cy="106" r="12"/><circle cx="262" cy="106" r="12"/></g><g fill="#fff" opacity=".6"><circle cx="90" cy="106" r="4"/><circle cx="262" cy="106" r="4"/></g>
          <rect x="0" y="116" width="360" height="4" fill="${k}" opacity=".3"/></svg>`;
      case 'ship':
        return `<svg class="motif" ${W}><g fill="${k}" opacity=".9"><path d="M40 78 H330 L300 102 H66 Z"/><rect x="90" y="58" width="180" height="20" rx="3"/><rect x="120" y="42" width="110" height="16" rx="3"/><rect x="200" y="22" width="18" height="22"/></g>
          <g fill="#fff" opacity=".5">${Array.from({ length: 10 }, (_, i) => `<circle cx="${104 + i * 16}" cy="68" r="2.6"/>`).join('')}</g>
          <g fill="none" stroke="${a}" stroke-opacity=".7" stroke-width="3"><path d="M0 108 q 15 -8 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0"/><path d="M0 117 q 15 -8 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0" stroke-opacity=".4"/></g></svg>`;
      case 'metro':
        return `<svg class="motif" ${W}>${[0, 1].map((n) => `<g transform="translate(${20 + n * 166} 0)"><rect x="0" y="46" width="160" height="58" rx="${n ? 10 : 10}" fill="${k}" opacity=".88"/>
          <g fill="#fff" opacity=".55"><rect x="12" y="56" width="26" height="18" rx="3"/><rect x="122" y="56" width="26" height="18" rx="3"/><rect x="50" y="54" width="14" height="40" rx="2"/><rect x="96" y="54" width="14" height="40" rx="2"/><rect x="70" y="56" width="20" height="18" rx="3"/></g>
          <rect x="0" y="80" width="160" height="4" fill="${a}" opacity=".7"/></g>`).join('')}
          <rect x="0" y="108" width="360" height="3" fill="${k}" opacity=".6"/><rect x="0" y="114" width="360" height="2" fill="${k}" opacity=".3"/></svg>`;
      case 'stage':
        return `<svg class="motif" ${W}><g fill="${a}" opacity=".22"><path d="M60 0 L 20 96 H 110 Z"/><path d="M180 0 L 140 96 H 220 Z"/><path d="M300 0 L 250 96 H 340 Z"/></g>
          <rect x="0" y="92" width="360" height="8" fill="${k}" opacity=".5"/>
          <g fill="${k}" opacity=".9"><path d="M0 120 V108 ${Array.from({ length: 24 }, (_, i) => `a8 8 0 0 1 15 0`).join(' ')} V120 Z"/></g></svg>`;
      case 'stadium':
        return `<svg class="motif" ${W}><ellipse cx="180" cy="104" rx="200" ry="44" fill="${k}" opacity=".35"/><ellipse cx="180" cy="108" rx="150" ry="26" fill="${a}" opacity=".55"/>
          <g stroke="#fff" stroke-opacity=".5" stroke-width="2" fill="none"><ellipse cx="180" cy="108" rx="110" ry="17"/><path d="M180 91 V125"/><ellipse cx="180" cy="108" rx="16" ry="5"/></g>
          <g fill="${k}" opacity=".8"><rect x="22" y="24" width="4" height="62"/><rect x="334" y="24" width="4" height="62"/><rect x="12" y="18" width="24" height="10" rx="2"/><rect x="324" y="18" width="24" height="10" rx="2"/></g></svg>`;
      case 'hotel':
        return `<svg class="motif" ${W}><rect x="110" y="20" width="140" height="100" fill="${k}" opacity=".85"/>
          <g fill="#fff" opacity=".6">${Array.from({ length: 15 }, (_, i) => `<rect x="${124 + (i % 5) * 24}" y="${32 + Math.floor(i / 5) * 20}" width="14" height="10" rx="1"/>`).join('')}</g>
          <rect x="160" y="92" width="40" height="28" fill="${a}" opacity=".8"/><path d="M146 92 H214 L206 84 H154 Z" fill="${a}"/>
          <g fill="${k}" opacity=".5"><rect x="40" y="66" width="56" height="54"/><rect x="266" y="56" width="62" height="64"/></g>
          <g transform="translate(300 18)" fill="none" stroke="${a}" stroke-width="4"><circle cx="10" cy="10" r="8"/><path d="M18 10 H44 M36 10 V18 M42 10 V16"/></g></svg>`;
      case 'parking':
        return `<svg class="motif" ${W}><rect x="30" y="20" width="64" height="64" rx="12" fill="${a}" opacity=".9"/><text x="62" y="70" text-anchor="middle" font-size="48" font-weight="700" fill="#fff" font-family="system-ui, sans-serif">P</text>
          <rect x="58" y="84" width="8" height="36" fill="${k}" opacity=".6"/>
          <g fill="${k}" opacity=".88"><path d="M150 96 L 170 70 C 174 64 180 62 186 62 H 262 C 270 62 276 66 280 72 L 296 96 H 316 C 324 96 328 100 328 106 V 112 H 140 V 106 C 140 100 144 96 150 96 Z"/></g>
          <g fill="#fff" opacity=".55"><path d="M176 92 L 190 72 H 222 V 92 Z"/><path d="M230 72 H 262 L 278 92 H 230 Z"/></g><g fill="${k}"><circle cx="180" cy="112" r="10"/><circle cx="292" cy="112" r="10"/></g></svg>`;
      case 'gift':
        return `<svg class="motif" ${W}><rect x="250" y="0" width="22" height="120" fill="${a}" opacity=".35"/><rect x="0" y="52" width="360" height="16" fill="${a}" opacity=".25"/></svg>`;
      default:
        return '';
    }
  }

  // ---------------- Pass detail card ----------------
  const fv = (f, k) => (f[k] == null ? '' : String(f[k]).trim());
  function field(label, value, align) { return value ? `<div class="pc-f ${align || ''}"><div class="k">${esc(label)}</div><div class="v">${esc(value)}</div></div>` : ''; }
  function row(cells) { const html = cells.filter(Boolean); if (!html.length) return ''; return `<div class="pc-row n${html.length}">${html.map((h, i) => (i === html.length - 1 && html.length > 1 ? h.replace('class="pc-f ', 'class="pc-f end ') : h)).join('')}</div>`; }

  function codeBlock(p, v) {
    const b = p.barcode || {};
    if (!b.value) return '';
    const svg = b.format === 'code128' ? L.code128Svg(b.value) : E.qrSvg(b.value);
    if (!svg) return `<div class="pc-code-missing">${I.icon('info')}<span>This code is too long to draw. The text is kept exactly as entered.</span></div>`;
    const note = b.source === 'demo' ? '<span class="pc-demo">Sample code: not valid for entry</span>'
      : b.source === 'import' ? '<span class="pc-src">From your imported ticket</span>' : '<span class="pc-src">Redrawn from the code you entered</span>';
    return `<div class="pc-code ${b.format === 'code128' ? 'bar' : 'qr'}"><button class="pc-code-box" data-act="barcode" data-id="${esc(p.id)}" aria-label="Show the code full screen">${svg}</button>
      <div class="pc-code-text">${esc(b.value.length > 40 ? `${b.value.slice(0, 40)}…` : b.value)}</div>${note}</div>`;
  }

  function passCard(p, opts = {}) {
    const v = passInfo(p);
    const f = v.f;
    const reveal = opts.reveal || {};
    const dt = (k) => (fv(f, k) ? fmtDate(fv(f, k)) : '');
    const tm = (k) => (fv(f, k) ? fmtTime(fv(f, k)) : '');
    const masked = (k) => (fv(f, k) ? (reveal[k] ? fv(f, k) : E.mask(fv(f, k))) : '');
    let head = `<div class="pc-head">${logo(v.provName || v.title, v.light ? v.color : shade(v.color, lum(v.color) > 0.4 ? -0.12 : 0.18), v.light ? inkOn(v.color) : v.fg)}<span class="pc-prov">${esc(v.provName || v.t.label)}</span>`;
    let kicker = '', big = '', rows = '', extra = '';
    switch (p.template) {
      case 'movie':
        head += '</div>'; kicker = fv(f, 'branch'); big = fv(f, 'title');
        rows = row([field('Date', dt('date')), field('Time', tm('time'))]) + row([field('Section', fv(f, 'section')), field('Row', fv(f, 'row')), field('Seat', fv(f, 'seat'))])
          + row([field('Screen', fv(f, 'screen')), field('Format', fv(f, 'format')), field('Language', fv(f, 'language'))]);
        extra = fv(f, 'ref') ? `<div class="pc-ref">Booking ID: ${esc(fv(f, 'ref'))}</div>` : '';
        break;
      case 'flight': {
        head = v.light && v.prov ? `<div class="pc-head wm"><span class="pc-wordmark" style="color:${esc(v.color)}">${esc(v.provName)}</span><span class="pc-right">${esc(fv(f, 'flightNo'))}</span></div>`
          : `${head}<span class="pc-right">${esc(fv(f, 'flightNo'))}</span></div>`;
        kicker = fv(f, 'fromName') && fv(f, 'toName') ? `${fv(f, 'fromName')} to ${fv(f, 'toName')}` : '';
        big = `<span class="pc-route">${esc(fv(f, 'from'))}${I.icon('boarding', 'pc-plane')}${esc(fv(f, 'to'))}</span>`;
        const tg = [fv(f, 'terminal'), fv(f, 'gate')].filter(Boolean).join(' / ');
        const dlab = [dt('date') ? fmtDate(fv(f, 'date'), { month: 'short', day: 'numeric' }) : '', tm('time')].filter(Boolean).join(', ');
        rows = row([field('Date', dlab), field(fv(f, 'terminal') && fv(f, 'gate') ? 'Terminal / Gate' : fv(f, 'gate') ? 'Gate' : 'Terminal', tg)]) + '<hr class="pc-hr">'
          + row([field('Passenger', fv(f, 'passenger')), field('Seat', fv(f, 'seat'))]) + row([field('Boarding', tm('boarding')), field('Group', fv(f, 'zone')), field('Arrives', tm('arrive'))]);
        extra = fv(f, 'ref') ? `<div class="pc-ref">PNR: ${esc(fv(f, 'ref'))}${fv(f, 'fare') ? `/${esc(fv(f, 'fare').toUpperCase())}` : ''}</div>` : (fv(f, 'fare') ? `<div class="pc-ref">${esc(fv(f, 'fare').toUpperCase())}</div>` : '');
        break;
      }
      case 'train':
        head += `<span class="pc-right">${esc(fv(f, 'trainNo'))}</span></div>`; kicker = fv(f, 'trainName');
        big = `<span class="pc-route st">${esc(fv(f, 'from'))}${I.icon('arrowDown', 'pc-arrow')}${esc(fv(f, 'to'))}</span>`;
        rows = row([field('Date', dt('date')), field('Departs', tm('time')), field('Arrives', tm('arrive'))]) + row([field('Coach', fv(f, 'coach')), field('Class', fv(f, 'class')), field('Seat / berth', fv(f, 'seat'))])
          + row([field('Passenger', fv(f, 'passenger')), field('Platform', fv(f, 'platform'))]);
        extra = fv(f, 'ref') ? `<div class="pc-ref">PNR: ${esc(fv(f, 'ref'))}</div>` : '';
        break;
      case 'bus': case 'ferry':
        head += '</div>'; kicker = fv(f, p.template === 'bus' ? 'route' : 'vessel');
        big = `<span class="pc-route st">${esc(fv(f, 'from'))}${I.icon('arrowDown', 'pc-arrow')}${esc(fv(f, 'to'))}</span>`;
        rows = row([field('Date', dt('date')), field(p.template === 'bus' ? 'Departs' : 'Embarkation', tm('time'))]) + row([field('Terminal', fv(f, 'terminal')), field(p.template === 'bus' ? 'Seat' : 'Cabin / seat', fv(f, 'seat'))]) + row([field('Passenger', fv(f, 'passenger'))]);
        extra = fv(f, 'ref') ? `<div class="pc-ref">Booking: ${esc(fv(f, 'ref'))}</div>` : '';
        break;
      case 'transit':
        head += '</div>'; kicker = v.prov ? v.prov.name : ''; big = fv(f, 'passType');
        rows = row([field('Zones or route', fv(f, 'zones')), field('Fare', fv(f, 'fare'))]) + row([field('Valid from', dt('validFrom')), field('Valid until', dt('validTo'))])
          + row([field('Card number', masked('number')), field('Balance (your note)', fv(f, 'balance') ? L.money(Number(f.balance), p.currency || 'USD') : '')]);
        break;
      case 'event': case 'sports':
        head += '</div>'; kicker = fv(f, 'venue'); big = fv(f, 'title');
        rows = row([field('Date', dt('date')), field(p.template === 'sports' ? 'Kick-off' : 'Time', tm('time'))]) + row([field('Gate', fv(f, 'gate')), field('Section', fv(f, 'section')), field('Row', fv(f, 'row')), field('Seat', fv(f, 'seat'))])
          + row([field('Ticket type', fv(f, 'ticketType'))]);
        extra = fv(f, 'ref') ? `<div class="pc-ref">Order: ${esc(fv(f, 'ref'))}</div>` : '';
        break;
      case 'hotel':
        head += '</div>'; kicker = fv(f, 'address'); big = fv(f, 'property');
        rows = row([field('Check-in', [dt('date'), tm('time')].filter(Boolean).join(' · ')), field('Check-out', dt('checkout'))]) + row([field('Guest', fv(f, 'guest')), field('Room', fv(f, 'room'))]);
        extra = fv(f, 'ref') ? `<div class="pc-ref">Booking: ${esc(fv(f, 'ref'))}</div>` : '';
        break;
      case 'parking':
        head += '</div>'; big = fv(f, 'facility');
        rows = row([field('From', [dt('date'), tm('time')].filter(Boolean).join(' · ')), field('Valid until', dt('validTo'))]) + row([field('Vehicle', fv(f, 'vehicle')), field('Bay / level', fv(f, 'space'))]);
        extra = fv(f, 'ref') ? `<div class="pc-ref">Ref: ${esc(fv(f, 'ref'))}</div>` : '';
        break;
      case 'loyalty':
        head += '</div>'; kicker = v.prov ? v.prov.sub : ''; big = fv(f, 'points') ? `<span class="pc-points">${esc(fv(f, 'points'))}<small>points (your note)</small></span>` : '';
        rows = row([field('Member', fv(f, 'member')), field('Tier', fv(f, 'tier'))]) + row([field('Member number', masked('number'))]);
        break;
      case 'gift':
        head += '</div>'; big = fv(f, 'balance') ? `<span class="pc-points">${esc(L.money(Number(f.balance), p.currency || 'USD'))}<small>balance (your note, not live)</small></span>` : '';
        rows = row([field('Card number', masked('number')), field('PIN', fv(f, 'pin') ? (reveal.pin ? fv(f, 'pin') : '••••') : '')]) + row([field('Expires', dt('validTo'))]);
        break;
      default:
        head += '</div>'; kicker = fv(f, 'subtitle'); big = fv(f, 'title');
        rows = row([field('Date', dt('date')), field('Time', tm('time'))]) + row([field('Number', fv(f, 'number'))]);
        extra = fv(f, 'notes') ? `<p class="pc-notes">${esc(fv(f, 'notes'))}</p>` : '';
    }
    const custom = (p.extraFields || []).filter((x) => x.label && x.value);
    if (custom.length) rows += custom.map((x) => row([field(x.label, x.value)])).join('');
    const bigHtml = big ? (big.startsWith('<') ? `<div class="pc-big">${big}</div>` : `<div class="pc-big">${esc(big)}</div>`) : '';
    const motifHtml = motif(v.motif, v.light ? '#1b1b1b' : v.fg, v.light ? v.color : shade(v.color, 0.45));
    return `<article class="pass-card tpl-${esc(p.template)} ${v.light ? 'light' : 'pc-brand'}" ${opts.shared ? 'data-shared="1"' : ''} style="--pc-bg:${esc(v.surface)};--pc-fg:${esc(v.fg)};--pc-accent:${esc(v.color)}">
      ${head}<hr class="pc-hr top">
      ${kicker ? `<div class="pc-kicker">${esc(kicker)}</div>` : ''}${bigHtml}
      ${rows}${extra}${codeBlock(p, v)}
      ${motifHtml ? `<div class="pc-motif">${motifHtml}</div>` : '<div class="pc-pad"></div>'}
    </article>`;
  }

  // =========================================================================
  // Identity documents: a clean summary preview, always labelled.
  // =========================================================================
  function docCard(d, opts = {}) {
    const t = C.docType(d.typeId) || C.docType('XX.other');
    const region = C.regionName(d.region || t.region);
    const num = d.number ? (opts.reveal ? d.number : E.mask(d.number, t.mask)) : '';
    const color = t.color;
    return `<div class="doc-card" style="--doc:${esc(color)}" role="img" aria-label="${esc(`${t.name}, personal copy`)}">
      <div class="dc-band"><span class="dc-country">${esc(t.region === 'XX' ? region : C.regionName(t.region))}</span><span class="dc-tag">Personal copy · not verified</span></div>
      <div class="dc-body">
        <div class="dc-type">${esc(d.label || t.name)}</div>
        <div class="dc-auth">${esc(d.authority || t.authority || '')}</div>
        <div class="dc-holder">${esc(d.holder || '')}</div>
        ${num ? `<div class="dc-num">${esc(num)}</div>` : ''}
        ${d.expiry ? `<div class="dc-exp">Valid until ${esc(fmtDate(d.expiry, { day: 'numeric', month: 'short', year: 'numeric' }))}</div>` : ''}
      </div>
      <span class="dc-icon">${I.icon(t.group === 'health' ? 'health' : t.group === 'vehicle' ? 'car' : 'id')}</span>
    </div>`;
  }

  root.Art = { cardArt, cardMatch, passInfo, passTile, passFeatured, passCard, docCard, logo, motif, inkOn, shade, lum, fmtDate, fmtTime, when, TPL_COLOR };
})(typeof self !== 'undefined' ? self : this);
