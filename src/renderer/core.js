// Open Wallet — core: state, persistence, theme, shared fragments,
// page navigation and the overlay layer (sheets, dialogs, menus, snackbars).
(function () {
  'use strict';

  const L = window.WalletLib;
  const I = window.Icons;
  const esc = L.escapeHtml;
  const icon = I.icon;

  const A = (window.App = {
    W: null, // the wallet document
    meta: { screenshot: false, startScreen: 'home', version: '1.0.0' },
    stack: [], // [{ name, params, el }]
    ui: { search: { q: '', filter: 'all', sort: 'upcoming' }, expanded: {}, reveal: {}, fabCollapsed: false, lastScroll: 0, cardIndex: null, homeGroup: 'all', docCount: 0 },
    vault: { unlocked: false, docs: [], status: null },
    PAGES: {},
    ACTIONS: {},
    layers: []
  });

  A.C = window.Catalog;
  A.E = window.Engines;
  A.Art = window.Art;
  A.TPL = A.C.TEMPLATES;
  // Custom colours offered in forms (null = provider / issuer colours).
  A.COLORS = [null, '#1f3a5f', '#0b57d0', '#00796b', '#2e7d32', '#8a5a00', '#c2410c', '#b3261e', '#ad1457', '#6a1b9a', '#37474f', '#1b1b1b'];
  A.PEEK = 58; // visible strip of each stacked card, px

  const pagesEl = document.getElementById('pages');
  const layerEl = document.getElementById('layer');
  A.pagesEl = pagesEl;
  A.layerEl = layerEl;

  // ---------------- State & persistence ----------------
  A.uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  A.findCard = (id) => A.W.cards.find((c) => c.id === id);
  A.findPass = (id) => A.W.passes.find((p) => p.id === id);
  A.defaultCard = () => A.findCard(A.W.settings.defaultCardId) || A.W.cards[0] || null;

  let saveChain = Promise.resolve();
  A.commit = function commit(mutate) {
    const W = A.W;
    if (mutate) mutate(W);
    if (W.settings.defaultCardId && !A.findCard(W.settings.defaultCardId)) W.settings.defaultCardId = W.cards[0] ? W.cards[0].id : null;
    if (!W.settings.defaultCardId && W.cards[0]) W.settings.defaultCardId = W.cards[0].id;
    A.applyTheme();
    A.refreshAll();
    const snapshot = JSON.parse(JSON.stringify(W));
    saveChain = saveChain.then(() => window.walletApi.save(snapshot)).catch((err) => {
      console.error(err);
      A.snackbar("Couldn't save your changes. Check that the app's data folder is writable.");
    });
    return saveChain;
  };

  // ---------------- Theme & motion ----------------
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  A.applyTheme = function () {
    const t = A.W ? A.W.settings.theme : 'system';
    const dark = t === 'dark' || (t === 'system' && darkQuery.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.motion = A.W && A.W.settings.reduceMotion ? 'reduced' : 'full';
  };
  darkQuery.addEventListener('change', A.applyTheme);
  A.reduced = () => !!(A.W && A.W.settings.reduceMotion);
  A.motionMs = (ms) => (A.reduced() ? 1 : ms);
  A.wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------- Shared fragments ----------------
  A.payCardHtml = (c, opts) => A.Art.cardArt(c, opts);
  A.cardName = (c) => {
    const m = A.Art.cardMatch(c);
    return `${m.issuer ? m.issuer.name : c.issuerName || (m.network ? m.network.name : 'Card')}${m.product ? ` ${m.product.name}` : c.productName ? ` ${c.productName}` : ''}`;
  };
  A.passTileHtml = (p, i) => A.Art.passTile(p, i);
  A.passWhen = (p) => A.Art.when(p.fields);
  A.region = () => (A.W && A.W.settings.region) || '';
  A.regionLabel = () => (A.region() ? A.C.regionName(A.region()) : 'All regions');

  A.topbar = function ({ title = '', back = true, actions = '', cls = '' } = {}) {
    return `<header class="topbar ${cls}">
      ${back ? `<button class="icon-btn" data-act="back" aria-label="Back" title="Back">${icon('back')}</button>` : ''}
      <div class="topbar-title">${esc(title)}</div>${actions}</header>`;
  };

  A.sw = (on) => `<span class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}"></span>`;

  A.txItem = function (t, ownerType, ownerId) {
    const pos = t.amount > 0;
    const status = t.status === 'pending' ? ' · Pending' : t.status === 'refund' ? ' · Refund' : t.status === 'declined' ? ' · Declined' : '';
    return `<button class="list-item" data-act="tx" data-owner="${ownerType}" data-id="${esc(ownerId)}" data-tx="${esc(t.id)}">
      <span class="lead">${esc((t.merchant || '?')[0].toUpperCase())}</span>
      <span class="body"><span class="l1" style="display:block">${esc(t.merchant)}</span><span class="l2">${esc(L.relativeDay(t.date))} · ${esc(L.time(t.date))}${status}</span></span>
      <span class="trail ${pos ? 'pos' : ''}">${pos ? '+' : ''}${esc(L.money(t.amount, t.currency))}</span>
    </button>`;
  };

  // Favourites first, then upcoming by date (or most recently added).
  A.sortedPasses = function (list, mode) {
    const now = Date.now() - 86400000;
    const m = mode || (A.W && A.W.settings.sortPasses) || 'upcoming';
    return list.slice().sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      if (m === 'recent') return String(b.createdAt).localeCompare(String(a.createdAt));
      const ad = A.passWhen(a) ? A.passWhen(a).getTime() : NaN;
      const bd = A.passWhen(b) ? A.passWhen(b).getTime() : NaN;
      const au = ad >= now;
      const bu = bd >= now;
      if (au && bu) return ad - bd;
      if (au !== bu) return au ? -1 : 1;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  };

  // ---------------- Navigation ----------------
  A.top = () => A.stack[A.stack.length - 1];

  A.renderEntry = function (entry) {
    const def = A.PAGES[entry.name];
    const sc = entry.el.querySelector('.page-scroll');
    const scroll = sc ? sc.scrollTop : 0;
    const html = def.render(entry.params);
    if (html == null) return false;
    entry.el.innerHTML = html;
    const sc2 = entry.el.querySelector('.page-scroll');
    if (sc2) sc2.scrollTop = scroll;
    if (def.mount) def.mount(entry.el, entry.params);
    return true;
  };

  A.refreshAll = function () {
    const stack = A.stack;
    for (let i = stack.length - 1; i >= 0; i--) {
      const e = stack[i];
      const def = A.PAGES[e.name];
      if (def.keep) { // pages with typed input keep focus and values
        if (def.refresh) def.refresh(e);
        continue;
      }
      if (!A.renderEntry(e)) {
        e.el.remove(); // the item this page showed no longer exists
        stack.splice(i, 1);
      }
    }
    if (stack.length) stack[stack.length - 1].el.classList.remove('hidden');
  };

  A.makePage = function (name, params) {
    const el = document.createElement('section');
    el.className = 'page';
    el.dataset.page = name;
    const entry = { name, params: params || {}, el };
    pagesEl.appendChild(el);
    A.renderEntry(entry);
    return entry;
  };

  const afterAnim = (ms, fn) => setTimeout(fn, A.motionMs(ms) + 30);

  A.push = function (name, params, opts = {}) {
    A.closeLayers(true);
    const prev = A.top();
    const entry = A.makePage(name, params);
    A.stack.push(entry);
    if (!prev) return entry;
    if (opts.shared && !A.reduced()) {
      entry.el.style.zIndex = 2;
      entry.el.style.animation = 'fade-in 260ms var(--ease-std) both';
      flyCard(opts.shared, entry.el.querySelector('[data-shared]'));
      afterAnim(460, () => { entry.el.style.animation = ''; entry.el.style.zIndex = ''; if (A.top() !== prev) prev.el.classList.add('hidden'); });
      return entry;
    }
    entry.el.classList.add('enter');
    prev.el.classList.add('exit-under');
    afterAnim(450, () => {
      entry.el.classList.remove('enter');
      prev.el.classList.remove('exit-under');
      if (A.top() !== prev) prev.el.classList.add('hidden');
    });
    return entry;
  };

  A.pop = function () {
    if (A.stack.length < 2) return;
    A.closeLayers(true);
    const entry = A.stack.pop();
    const prev = A.top();
    A.renderEntry(prev);
    prev.el.classList.remove('hidden', 'exit-under');
    // A card opened from the home stack glides back to its place.
    const src = entry.el.querySelector('[data-shared]');
    if (entry.name === 'card' && prev.name === 'home' && src && !A.reduced()) {
      const target = prev.el.querySelector(`[data-card-id="${CSS.escape(entry.params.id)}"] .pay-card`);
      if (target) {
        const rect = src.getBoundingClientRect();
        entry.el.style.zIndex = 2;
        entry.el.style.animation = 'fade-out 260ms var(--ease-std) both';
        flyCard({ rect, html: src.outerHTML }, target);
        afterAnim(270, () => entry.el.remove());
        return;
      }
    }
    entry.el.classList.remove('enter');
    entry.el.classList.add('pop-exit');
    prev.el.classList.add('pop-reveal');
    afterAnim(300, () => { entry.el.remove(); prev.el.classList.remove('pop-reveal'); });
  };

  // Drops the pages between `name` and the top without animating them, then
  // animates the top page away.
  A.popTo = function (name) {
    const idx = A.stack.map((e) => e.name).lastIndexOf(name);
    if (idx === -1 || idx === A.stack.length - 1) return;
    while (A.stack.length - 2 > idx) {
      const e = A.stack.splice(A.stack.length - 2, 1)[0];
      e.el.remove();
    }
    A.pop();
  };

  // Shared-element flight: a clone of the card glides from `from.rect` to the
  // target element's box while the pages cross-fade.
  function flyCard(from, targetEl) {
    if (!targetEl) return;
    const to = targetEl.getBoundingClientRect();
    const clone = document.createElement('div');
    clone.className = 'flight';
    clone.innerHTML = from.html.replace('data-shared="1"', '');
    Object.assign(clone.style, { left: `${from.rect.left}px`, top: `${from.rect.top}px`, width: `${from.rect.width}px` });
    document.body.appendChild(clone);
    targetEl.style.visibility = 'hidden';
    const s = to.width / from.rect.width;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clone.style.transform = `translate(${to.left - from.rect.left}px, ${to.top - from.rect.top}px) scale(${s})`;
    }));
    let ended = false;
    const end = () => { if (ended) return; ended = true; targetEl.style.visibility = ''; clone.remove(); };
    clone.addEventListener('transitionend', end, { once: true });
    setTimeout(end, A.motionMs(560));
  }

  // ---------------- Overlay layer ----------------
  A.closeTopLayer = function () {
    const l = A.layers[A.layers.length - 1];
    if (l) { l.close(); return true; }
    return false;
  };
  A.closeLayers = function (instant) {
    while (A.layers.length) A.layers[A.layers.length - 1].close(instant);
  };

  A.openLayer = function (el, { scrim = true, outClass = 'out', outMs = 250, onClose } = {}) {
    let scrimEl = null;
    if (scrim) {
      scrimEl = document.createElement('div');
      scrimEl.className = 'scrim';
      layerEl.appendChild(scrimEl);
    }
    layerEl.appendChild(el);
    const entry = {
      el,
      extra: [],
      close(instant) {
        const i = A.layers.indexOf(entry);
        if (i === -1) return;
        A.layers.splice(i, 1);
        if (onClose) onClose();
        entry.extra.forEach((x) => x.remove());
        if (instant || A.reduced()) { el.remove(); if (scrimEl) scrimEl.remove(); return; }
        el.classList.add(outClass);
        if (scrimEl) scrimEl.classList.add('out');
        setTimeout(() => { el.remove(); if (scrimEl) scrimEl.remove(); }, outMs);
      }
    };
    if (scrimEl) scrimEl.addEventListener('click', () => entry.close());
    A.layers.push(entry);
    return entry;
  };

  A.sheet = function (title, bodyHtml) {
    const el = document.createElement('div');
    el.className = 'sheet';
    el.setAttribute('role', 'dialog');
    el.innerHTML = `<div class="handle" data-drag title="Drag down to close"></div>${title ? `<div class="sheet-title">${esc(title)}</div>` : ''}<div class="sheet-body">${bodyHtml}</div>`;
    const l = A.openLayer(el);
    // Drag the handle down to dismiss.
    const handle = el.querySelector('[data-drag]');
    handle.addEventListener('pointerdown', (e) => {
      const y0 = e.clientY;
      let dy = 0;
      handle.setPointerCapture(e.pointerId);
      el.style.animation = 'none';
      el.style.transition = 'none';
      const move = (ev) => { dy = Math.max(0, ev.clientY - y0); el.style.transform = `translateY(${dy}px)`; };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        el.style.transition = `transform ${A.motionMs(220)}ms var(--ease-emph-dec)`;
        if (dy > 90) { el.style.transform = 'translateY(100%)'; l.close(); } else el.style.transform = '';
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
    return l;
  };

  A.dialog = function ({ title, body = '', iconName, actions }) {
    const el = document.createElement('div');
    el.className = 'dialog';
    el.setAttribute('role', 'alertdialog');
    el.innerHTML = `${iconName ? `<div class="dicon">${icon(iconName)}</div>` : ''}<h3 class="${iconName ? 'center' : ''}">${esc(title)}</h3>${body}
      <div class="actions">${actions.map((a, i) => `<button class="text-btn" data-dlg="${i}" ${a.danger ? 'style="color:var(--error)"' : ''}>${esc(a.label)}</button>`).join('')}</div>`;
    const l = A.openLayer(el, { outMs: 180 });
    el.querySelectorAll('[data-dlg]').forEach((b) => b.addEventListener('click', () => {
      const a = actions[Number(b.dataset.dlg)];
      if (a.keepOpen) { if (a.run) a.run(el); return; }
      l.close();
      if (a.run) a.run(el);
    }));
    setTimeout(() => { const inp = el.querySelector('input'); if (inp) inp.focus(); }, 50);
    return l;
  };

  A.confirmDialog = (title, text, okLabel, run, danger) =>
    A.dialog({ title, body: `<p>${text}</p>`, actions: [{ label: 'Cancel' }, { label: okLabel, run, danger }] });

  A.menu = function (anchor, items) {
    const el = document.createElement('div');
    el.className = 'menu';
    el.setAttribute('role', 'menu');
    el.innerHTML = items.map((it, i) => `<button role="menuitem" data-mi="${i}" class="${it.danger ? 'danger' : ''}">${icon(it.icon)}${esc(it.label)}</button>`).join('');
    const r = anchor.getBoundingClientRect();
    el.style.top = `${r.bottom - 8}px`;
    el.style.right = `${Math.max(8, window.innerWidth - r.right + 8)}px`;
    const away = document.createElement('div');
    away.style.cssText = 'position:absolute;inset:0;';
    layerEl.appendChild(away);
    const l = A.openLayer(el, { scrim: false, outMs: 120 });
    l.extra.push(away);
    away.addEventListener('click', () => l.close());
    el.querySelectorAll('[data-mi]').forEach((b) => b.addEventListener('click', () => { l.close(); items[Number(b.dataset.mi)].run(); }));
    return l;
  };

  let snackTimer = null;
  A.snackbar = function (msg, actionLabel, action) {
    const old = layerEl.querySelector('.snackbar');
    if (old) old.remove();
    clearTimeout(snackTimer);
    const el = document.createElement('div');
    el.className = 'snackbar';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="msg">${esc(msg)}</span>${actionLabel ? `<button class="text-btn">${esc(actionLabel)}</button>` : ''}`;
    layerEl.appendChild(el);
    const hide = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
    if (actionLabel) el.querySelector('button').addEventListener('click', () => { hide(); action(); });
    snackTimer = setTimeout(hide, actionLabel ? 6000 : 3500);
  };
})();
