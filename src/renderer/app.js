// Open Wallet — account sheet, demo tap-to-pay, transaction details, code
// viewer, item actions and start-up.
(function () {
  'use strict';

  const A = window.App;
  const L = window.WalletLib;
  const I = window.Icons;
  const api = window.walletApi;
  const esc = L.escapeHtml;
  const icon = I.icon;

  // ---------------- Account sheet ----------------
  function openAccountSheet() {
    const def = A.defaultCard();
    const name = def && def.holder ? def.holder : 'Local profile';
    const item = (attrs, ic, label) => `<button class="list-item" ${attrs}><span class="lead plain">${icon(ic)}</span><span class="body"><span class="l1">${label}</span></span></button>`;
    return A.sheet('', `<div class="acct-head">
        <span class="avatar lg">${esc(L.initials(def && def.holder ? def.holder : 'You'))}</span>
        <div><div class="acct-name">${esc(name)}</div><div class="acct-sub">No account · data stays on this computer</div></div></div>
      <hr class="divider">
      <div class="list">
        ${item('data-act="go" data-page="settings"', 'settings', 'Settings')}
        ${item('data-act="go" data-page="cards"', 'card', 'Payment cards')}
        ${item('data-act="go" data-page="vault"', 'lock', 'IDs &amp; documents')}
        ${item('data-act="search"', 'search', 'Search your Wallet')}
        ${item('data-act="pick-region"', 'globe', `Region: ${esc(A.regionLabel())}`)}
        ${item('data-act="go" data-page="archived"', 'archive', 'Archived passes')}
        ${item('data-act="go" data-page="about"', 'help', 'About &amp; limitations')}
      </div>`);
  }

  // ---------------- Demo tap-to-pay ----------------
  function openPay(cardId) {
    const c = A.findCard(cardId);
    if (!c) return;
    const start = () => {
      A.closeLayers(true);
      const el = document.createElement('div');
      el.className = 'pay-screen';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Demo tap to pay');
      let state = 'waiting';
      let timeout = null;
      const amount = Number((2 + Math.random() * 38).toFixed(2));
      const draw = () => {
        const body = {
          waiting: `<div class="pulse"><i></i><i></i><i></i><span class="core">${I.contactless()}</span></div>
            <h2>Hold near the reader</h2><p>This is a demonstration. Your computer doesn’t send anything. Press the button to act out a reader tap.</p>
            <button class="btn filled" data-pay="tap">${I.contactless()}Simulate reader tap</button>`,
          processing: `<div class="pulse"><span class="core">${I.contactless()}</span></div><h2>Connecting…</h2><div class="progress" role="progressbar" aria-label="Processing"></div><p>Demo only. No bank or card network is contacted.</p>`,
          done: `<div class="pulse done"><span class="core">${icon('check')}</span></div><h2>Demo complete</h2>
            <p><b>${esc(L.money(amount, 'USD'))}</b> at Demo reader. No money moved. The entry is added to the card’s activity and marked as a demo.</p>
            <button class="btn filled" data-pay="close">Done</button>`,
          timeout: `<div class="pulse"><span class="core">${icon('info')}</span></div><h2>No reader found</h2><p>The demo timed out. Try again when you’re ready.</p>
            <div class="btn-row"><button class="btn outlined" data-pay="close">Close</button><button class="btn filled" data-pay="retry">Try again</button></div>`
        }[state];
        el.innerHTML = `<div class="pay-top"><button class="icon-btn" data-pay="close" aria-label="Close" title="Close">${icon('close')}</button><div class="topbar-title">${esc(A.cardName(c))} •• ${esc(c.last4)}</div></div>
          <div class="demo-banner">${icon('info')}<span><b>Demo mode.</b> Open Wallet can’t make real payments.</span></div>
          <div class="pay-card-wrap">${A.payCardHtml(c)}</div>
          <div class="reader" aria-live="polite">${body}</div>`;
        if (state !== 'waiting') { const pc = el.querySelector('.pay-card-wrap .pay-card'); if (pc) pc.style.animation = 'none'; }
      };
      const armTimeout = () => { clearTimeout(timeout); timeout = setTimeout(() => { if (state === 'waiting') { state = 'timeout'; draw(); } }, 30000); };
      draw();
      armTimeout();
      const l = A.openLayer(el, { scrim: false, outMs: 220, onClose: () => clearTimeout(timeout) });
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-pay]');
        if (!b) return;
        const what = b.dataset.pay;
        if (what === 'close') { l.close(); return; }
        if (what === 'retry') { state = 'waiting'; draw(); armTimeout(); return; }
        if (what === 'tap' && state === 'waiting') {
          clearTimeout(timeout);
          state = 'processing';
          draw();
          await A.wait(A.motionMs(1400));
          if (!A.layers.includes(l)) return;
          state = 'done';
          draw();
          A.commit(() => {
            const card = A.findCard(c.id);
            if (card) card.transactions.push({ id: A.uid('tx'), merchant: 'Demo reader', amount: -amount, currency: 'USD', date: new Date().toISOString(), status: 'completed', category: 'Demo', demo: true });
          });
          if (A.W.settings.notifyTransactions) A.snackbar(`Demo payment of ${L.money(amount, 'USD')} recorded. No money moved`);
        }
      });
    };
    if (A.W.settings.confirmBeforeDemoTap) {
      A.dialog({ title: 'Start the demo tap?', iconName: 'info',
        body: '<p>This shows what paying with your phone looks like. No real payment is made and no card details are sent anywhere.</p>',
        actions: [{ label: 'Cancel' }, { label: 'Start demo', run: start }] });
    } else start();
  }

  // ---------------- Transaction details ----------------
  function openTx(ownerType, ownerId, txId) {
    const owner = ownerType === 'card' ? A.findCard(ownerId) : A.findPass(ownerId);
    if (!owner) return;
    const list = ownerType === 'card' ? owner.transactions : owner.history;
    const t = list.find((x) => x.id === txId);
    if (!t) return;
    const isDemo = t.category === 'Demo' || t.merchant === 'Demo reader';
    A.sheet('', `<div class="tx-head">
        <div class="tx-avatar">${esc(t.merchant[0])}</div><div style="font-size:16px">${esc(t.merchant)}</div>
        <div class="tx-amount">${t.amount > 0 ? '+' : ''}${esc(L.money(t.amount, t.currency))}</div>
        <div style="color:var(--on-surface-variant)">${esc(L.longDate(t.date))} · ${esc(L.time(t.date))}</div>
        <div style="margin-top:8px"><span class="tag" style="margin:0">${isDemo ? 'Demo' : 'Sample'}. Not a real transaction</span></div></div>
      <div class="kv" style="padding:16px 24px">
        <div><div class="k">Status</div><div class="v">${esc(A.cap(t.status))}</div></div>
        <div><div class="k">Category</div><div class="v">${esc(t.category || '—')}</div></div>
        <div><div class="k">${ownerType === 'card' ? 'Card' : 'Pass'}</div><div class="v">${esc(ownerType === 'card' ? `${A.cardName(owner)} •• ${owner.last4}` : A.Art.passInfo(owner).title)}</div></div>
      </div>
      <div style="padding:0 24px"><button class="btn outlined block" data-act="remove-tx" data-owner="${ownerType}" data-id="${esc(ownerId)}" data-tx="${esc(t.id)}">${icon('delete')}Remove from activity</button></div>`);
  }

  // ---------------- Code viewer (full screen, high contrast) ----------------
  function openBarcode(p) {
    const b = p.barcode;
    if (!b || !b.value) return;
    const v = A.Art.passInfo(p);
    const el = document.createElement('div');
    el.className = 'viewer code';
    const svg = b.format === 'code128' ? L.code128Svg(b.value, { height: 160 }) : A.E.qrSvg(b.value);
    el.innerHTML = `<button class="icon-btn close" aria-label="Close" title="Close">${icon('close')}</button>
      <div class="vw-title">${esc(v.title)}</div><div class="vw-sub">${esc(v.sub)}</div>
      <div class="vw-code ${b.format}">${svg}</div><div class="code-text">${esc(b.value)}</div>
      ${b.source === 'demo' ? '<div class="pc-demo">Sample code: not valid for entry</div>' : ''}
      <div class="hint">Turn your screen brightness up for scanners. Press Esc or click to close.</div>`;
    const l = A.openLayer(el, { scrim: false, outMs: 10 });
    el.addEventListener('click', () => l.close());
  }

  // ---------------- Item actions with undo ----------------
  function removeCard(id) {
    const c = A.findCard(id);
    if (!c) return;
    A.confirmDialog('Remove this card?', `${esc(A.cardName(c))} •• ${esc(c.last4)} and its demo activity will be removed from this computer.`, 'Remove', () => {
      const idx = A.W.cards.indexOf(c);
      const wasDefault = A.W.settings.defaultCardId === c.id;
      A.popTo('home');
      A.ui.cardIndex = 0;
      A.commit((W) => { W.cards.splice(idx, 1); });
      A.snackbar('Card removed', 'Undo', () => A.commit((W) => { W.cards.splice(idx, 0, c); if (wasDefault) W.settings.defaultCardId = c.id; }));
    }, true);
  }

  function deletePass(id) {
    const p = A.findPass(id);
    if (!p) return;
    const title = A.Art.passInfo(p).title;
    A.confirmDialog('Delete this pass?', `“${esc(title)}” will be removed from this computer${p.original ? ', with its imported original file' : ''}.`, 'Delete', () => {
      const idx = A.W.passes.indexOf(p);
      A.popTo(p.archived && A.stack.some((e) => e.name === 'archived') ? 'archived' : 'home');
      A.commit((W) => { W.passes.splice(idx, 1); });
      let undone = false;
      A.snackbar('Pass deleted', 'Undo', () => { undone = true; A.commit((W) => W.passes.splice(idx, 0, p)); });
      if (p.original) setTimeout(() => { if (!undone) api.originals.remove(p.original.fileId); }, 7000);
    }, true);
  }

  function toggleArchive(id) {
    const p = A.findPass(id);
    if (!p) return;
    const now = !p.archived;
    A.commit(() => { p.archived = now; });
    A.snackbar(now ? 'Pass archived' : 'Pass moved back to your wallet', 'Undo', () => A.commit(() => { p.archived = !now; }));
  }

  async function replaceWallet(w, message) {
    A.W = w;
    A.ui.cardIndex = null;
    A.applyTheme();
    A.popTo('home');
    A.refreshAll();
    A.snackbar(message);
  }

  async function openOriginal(p) {
    const o = p.original;
    if (!o) return;
    if (o.mime === 'application/pdf') {
      A.confirmDialog('Open the original PDF?', 'A temporary copy opens in your PDF app and is deleted when Open Wallet closes.', 'Open', async () => { const r = await api.originals.open(o.fileId, o.name); if (!r.ok) A.snackbar('Couldn’t open the file'); });
      return;
    }
    const r = await api.originals.url(o.fileId, o.mime);
    if (!r.ok) { A.snackbar('The original file is missing'); return; }
    const el = document.createElement('div');
    el.className = 'viewer image';
    el.innerHTML = `<button class="icon-btn close" aria-label="Close" title="Close">${icon('close')}</button><img alt="${esc(o.name)}" src="${r.url}">
      <div class="hint">${esc(o.name)} · original, unchanged${o.sha256 ? ` · SHA-256 ${esc(o.sha256.slice(0, 12))}…` : ''}</div>`;
    const l = A.openLayer(el, { scrim: false, outMs: 10 });
    el.addEventListener('click', () => l.close());
  }

  const radioDialog = (title, opts, cur, run) => {
    const l = A.dialog({ title, body: opts.map(([k, label]) => `<button class="radio-row" data-opt="${k}"><span class="radio ${String(cur) === String(k) ? 'on' : ''}"></span>${label}</button>`).join(''), actions: [{ label: 'Close' }] });
    l.el.querySelectorAll('[data-opt]').forEach((btn) => btn.addEventListener('click', () => { l.close(); run(btn.dataset.opt); }));
  };

  // ---------------- Actions ----------------
  const ACTIONS = A.ACTIONS;
  Object.assign(ACTIONS, {
    back: () => A.pop(),
    go: (b) => { A.closeLayers(true); A.push(b.dataset.page); },
    search: () => { A.closeLayers(true); A.ui.search = { q: '', filter: 'all', sort: A.W.settings.sortPasses }; A.push('search'); },
    account: () => openAccountSheet(),
    'open-card': (b) => {
      const card = b.querySelector('.pay-card');
      const shared = card && b.classList.contains('car-item') ? { rect: card.getBoundingClientRect(), html: card.outerHTML } : null;
      A.push('card', { id: b.dataset.id }, { shared });
    },
    'open-pass': (b) => A.push('pass', { id: b.dataset.id }),
    pay: (b) => openPay(b.dataset.id),
    'set-default': (b) => { A.commit((W) => { W.settings.defaultCardId = b.dataset.id; }); A.snackbar('Default card for demo tap updated'); },
    'toggle-details': (b) => {
      const id = b.dataset.id;
      const ex = b.closest('.page').querySelector('[data-expander]');
      const open = !A.ui.expanded[id];
      A.ui.expanded[id] = open;
      b.setAttribute('aria-expanded', String(open));
      const full = ex.scrollHeight;
      if (open) {
        ex.style.height = '0px';
        requestAnimationFrame(() => { ex.style.height = `${full}px`; });
        setTimeout(() => { if (A.ui.expanded[id]) ex.style.height = 'auto'; }, A.motionMs(320));
      } else {
        ex.style.height = `${full}px`;
        requestAnimationFrame(() => requestAnimationFrame(() => { ex.style.height = '0px'; }));
      }
    },
    'identify-card': (b) => A.push('form', { template: 'payment', id: b.dataset.id }),
    'card-menu': (b) => {
      const c = A.findCard(b.dataset.id);
      if (!c) return;
      const items = [{ label: 'Edit card', icon: 'edit', run: () => A.push('form', { template: 'payment', id: c.id }) }];
      if (A.W.settings.defaultCardId !== c.id) items.push({ label: 'Make default', icon: 'star', run: () => ACTIONS['set-default']({ dataset: { id: c.id } }) });
      items.push({ label: 'Demo tap to pay', icon: 'card', run: () => openPay(c.id) });
      items.push({ label: 'Remove card', icon: 'delete', danger: true, run: () => removeCard(c.id) });
      A.menu(b, items);
    },
    'move-card': (b) => {
      const i = A.W.cards.findIndex((c) => c.id === b.dataset.id);
      const j = i + Number(b.dataset.dir);
      if (i < 0 || j < 0 || j >= A.W.cards.length) return;
      A.ui.cardIndex = null;
      A.commit((W) => { const [c] = W.cards.splice(i, 1); W.cards.splice(j, 0, c); });
    },
    'pass-menu': (b) => {
      const p = A.findPass(b.dataset.id);
      if (!p) return;
      const items = [{ label: 'Edit', icon: 'edit', run: () => A.push('form', { template: p.template, id: p.id }) }];
      if (p.barcode.value) items.push({ label: 'Show code full screen', icon: 'fullscreen', run: () => openBarcode(p) });
      items.push({ label: p.favorite ? 'Remove from favourites' : 'Add to favourites', icon: 'star', run: () => ACTIONS.favorite({ dataset: { id: p.id } }) });
      items.push({ label: p.archived ? 'Unarchive' : 'Archive', icon: p.archived ? 'unarchive' : 'archive', run: () => toggleArchive(p.id) });
      items.push({ label: 'Delete', icon: 'delete', danger: true, run: () => deletePass(p.id) });
      A.menu(b, items);
    },
    favorite: (b) => { const p = A.findPass(b.dataset.id); if (!p) return; A.commit(() => { p.favorite = !p.favorite; }); A.snackbar(p.favorite ? 'Added to favourites. Favourites come first' : 'Removed from favourites'); },
    'reveal-pass': (b) => { const id = b.dataset.id; A.ui.reveal[id] = Object.keys(A.ui.reveal[id] || {}).length ? {} : { number: true, pin: true }; A.refreshAll(); },
    'open-original': (b) => { const p = A.findPass(b.dataset.id); if (p) openOriginal(p); },
    'edit-pass': (b) => { const p = A.findPass(b.dataset.id); if (p) A.push('form', { template: p.template, id: p.id }); },
    'remove-card': (b) => removeCard(b.dataset.id),
    'delete-pass': (b) => deletePass(b.dataset.id),
    archive: (b) => toggleArchive(b.dataset.id),
    barcode: (b) => { const p = A.findPass(b.dataset.id); if (p) openBarcode(p); },
    tx: (b) => openTx(b.dataset.owner, b.dataset.id, b.dataset.tx),
    'remove-tx': (b) => {
      const { owner, id, tx } = b.dataset;
      const o = owner === 'card' ? A.findCard(id) : A.findPass(id);
      if (!o) return;
      const list = owner === 'card' ? o.transactions : o.history;
      const idx = list.findIndex((t) => t.id === tx);
      if (idx === -1) return;
      const [removed] = list.splice(idx, 1);
      A.closeLayers();
      A.commit();
      A.snackbar('Removed from activity', 'Undo', () => A.commit(() => list.splice(idx, 0, removed)));
    },
    'add-value': (b) => {
      const p = A.findPass(b.dataset.id);
      if (!p) return;
      A.sheet('Add value (demo)', `<div class="notice warn" style="margin:0 24px 16px">${icon('info')}<span>Demo only. No money is charged and the transport operator isn’t contacted. This only updates the balance note you keep here.</span></div>
        <div class="chips" style="padding:0 24px 16px;flex-wrap:wrap">${[5, 10, 20, 50, 100, 500].map((a) => `<button class="chip-f" data-act="do-add-value" data-id="${esc(p.id)}" data-amount="${a}">${esc(L.money(a, p.currency))}</button>`).join('')}</div>`);
    },
    'do-add-value': (b) => {
      const p = A.findPass(b.dataset.id);
      if (!p) return;
      const a = Number(b.dataset.amount);
      A.closeLayers();
      A.commit(() => {
        p.fields.balance = String(Number(((Number(p.fields.balance) || 0) + a).toFixed(2)));
        p.history.push({ id: A.uid('th'), merchant: 'Added value (demo)', amount: a, currency: p.currency, date: new Date().toISOString(), status: 'completed', category: 'Demo' });
      });
      A.snackbar(`Balance note is now ${L.money(Number(p.fields.balance), p.currency)} (demo)`);
    },
    'edit-balance': (b) => {
      const p = A.findPass(b.dataset.id);
      if (!p) return;
      const l = A.dialog({ title: 'Update balance', body: `<p>Enter the balance from your latest receipt or the store’s app. Open Wallet can’t check it.</p>
          <div class="field" style="margin-top:16px"><input id="bal" type="text" inputmode="decimal" placeholder=" " value="${esc(p.fields.balance || '')}"><label for="bal">Balance (${esc(p.currency)})</label><div class="help"></div></div>`,
        actions: [{ label: 'Cancel' }, { label: 'Save', keepOpen: true, run: (el) => {
          const v = el.querySelector('#bal').value.trim();
          const err = L.validateMoney(v, { allowEmpty: false });
          if (err) { el.querySelector('.field').classList.add('invalid'); el.querySelector('.help').textContent = err; return; }
          l.close();
          A.commit(() => { p.fields.balance = v; p.updatedAt = new Date().toISOString(); });
          A.snackbar('Balance updated');
        } }] });
    },
    'save-form': () => A.saveForm(),
    'home-group': (b) => { A.ui.homeGroup = b.dataset.group; A.renderEntry(A.stack[0]); },
    filter: (b) => {
      A.ui.search.filter = b.dataset.filter;
      const e = A.top();
      e.el.querySelector('[data-chips]').innerHTML = A.chipsHtml();
      e.el.querySelector('[data-results]').innerHTML = A.resultsHtml();
    },
    'search-sort': () => {
      A.ui.search.sort = A.ui.search.sort === 'recent' ? 'upcoming' : 'recent';
      const e = A.top();
      e.el.querySelector('[data-chips]').innerHTML = A.chipsHtml();
      e.el.querySelector('[data-results]').innerHTML = A.resultsHtml();
    },
    'clear-search': () => { A.ui.search.q = ''; A.ui.search.filter = 'all'; const e = A.top(); A.renderEntry(e); },
    theme: () => radioDialog('Choose theme', [['system', 'System default'], ['light', 'Light'], ['dark', 'Dark']], A.W.settings.theme, (k) => A.commit((W) => { W.settings.theme = k; })),
    'sort-passes': () => radioDialog('Sort passes', [['upcoming', 'Upcoming first'], ['recent', 'Recently added first']], A.W.settings.sortPasses, (k) => A.commit((W) => { W.settings.sortPasses = k; })),
    'vault-timeout': () => radioDialog('Lock the vault after', [[1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [60, '1 hour']], A.W.settings.vaultTimeout, (k) => { A.commit((W) => { W.settings.vaultTimeout = Number(k); }); api.vault.touch(Number(k)); }),
    'clear-learned': () => {
      if (!Object.keys(A.W.settings.learnedIins).length) { A.snackbar('No card prefixes are saved'); return; }
      A.confirmDialog('Forget card prefixes?', 'Open Wallet remembers which bank goes with the first 6 digits you confirmed, so it can suggest the bank next time. Only those 6 digits and the bank are saved.', 'Forget', () => { A.commit((W) => { W.settings.learnedIins = {}; }); A.snackbar('Prefixes forgotten'); });
    },
    'toggle-setting': (b) => { const k = b.dataset.key; A.commit((W) => { W.settings[k] = !W.settings[k]; }); },
    'choose-default': () => {
      if (!A.W.cards.length) { A.snackbar('Add a payment card first', 'Add', () => A.push('form', { template: 'payment' })); return; }
      A.sheet('Default card for demo tap', `<div class="list">${A.W.cards.map((c) => `<button class="list-item" data-act="pick-default" data-id="${esc(c.id)}">
          <span class="mini-card">${A.payCardHtml(c)}</span>
          <span class="body"><span class="l1" style="display:block">${esc(A.cardName(c))}</span><span class="l2">•••• ${esc(c.last4)}</span></span>
          <span class="radio ${A.W.settings.defaultCardId === c.id ? 'on' : ''}"></span></button>`).join('')}</div>`);
    },
    'pick-default': (b) => { A.closeLayers(); A.commit((W) => { W.settings.defaultCardId = b.dataset.id; }); A.snackbar('Default card updated'); },
    export: async () => {
      const r = await api.exportData(A.W);
      if (r.ok) A.snackbar(`Saved ${r.file}`);
      else if (r.reason === 'disabled') A.snackbar('Export is turned off in screenshot mode');
    },
    import: () => A.confirmDialog('Import a backup?', 'Your cards and passes will be replaced by the backup you choose. The document vault isn’t affected.', 'Choose file', async () => {
      const r = await api.importData();
      if (r.ok) replaceWallet(r.wallet, 'Backup imported');
      else if (r.reason === 'invalid') A.dialog({ title: 'Couldn’t import', body: `<p>${esc(r.message)}</p>`, actions: [{ label: 'OK' }] });
      else if (r.reason === 'disabled') A.snackbar('Import is turned off in screenshot mode');
    }),
    'open-folder': async () => { const ok = await api.openDataFolder(); if (!ok) A.snackbar('Not available in screenshot mode'); },
    'reset-sample': () => A.confirmDialog('Restore sample data?', 'Your cards and passes will be replaced with the demo set.', 'Restore',
      async () => replaceWallet(await api.reset('sample'), 'Sample data restored'), true),
    'delete-all': () => A.confirmDialog('Delete all cards and passes?', 'Every card, pass and setting will be removed from this computer. The document vault is separate. This can’t be undone.', 'Delete all',
      async () => replaceWallet(await api.reset('empty'), 'All cards and passes deleted'), true)
  });

  // ---------------- Input wiring ----------------
  const RIPPLE = '.btn, .icon-btn, .list-item, .chip-f, .text-btn, .fab, .menu button, .ready-chip, .radio-row, .group-item, .pass-tile, .pass-featured, .vault-tile, .doc-item';
  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest(RIPPLE);
    if (!t || A.reduced()) return;
    const r = t.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const span = document.createElement('span');
    span.className = 'ripple';
    Object.assign(span.style, { width: `${size}px`, height: `${size}px`, left: `${e.clientX - r.left - size / 2}px`, top: `${e.clientY - r.top - size / 2}px` });
    t.appendChild(span);
    setTimeout(() => span.remove(), 560);
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !A.W || b.disabled) return;
    const fn = ACTIONS[b.dataset.act];
    if (fn) { e.preventDefault(); fn(b, e); }
  });

  document.addEventListener('keydown', (e) => {
    if (!A.W) return;
    if (e.key === 'Escape') { if (!A.closeTopLayer()) A.pop(); }
    else if (e.key === 'BrowserBack' || (e.altKey && e.key === 'ArrowLeft')) A.pop();
    else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); if (A.top().name !== 'search') ACTIONS.search(); }
  });

  // ---------------- Start-up ----------------
  function showError(message) {
    A.pagesEl.innerHTML = `<section class="page"><div class="empty" style="margin:auto"><div class="art"><i></i><i></i><i></i></div>
      <h3>Wallet couldn’t open</h3><span>${esc(message)}</span><button class="btn filled" id="retry">Try again</button></div></section>`;
    document.getElementById('retry').addEventListener('click', () => { A.pagesEl.innerHTML = ''; boot(); });
  }

  // Screenshot runs can start on any screen (`--screen <name>`).
  async function openStartScreen(name) {
    const pass = (id) => A.push('pass', { id });
    const firstCard = () => (A.defaultCard() || {}).id;
    const tap = async (sel) => { await A.wait(500); const el = A.top().el.querySelector(sel); if (el) el.click(); };
    switch (name) {
      case 'card': A.push('card', { id: firstCard() }); break;
      case 'card-details': A.push('card', { id: firstCard() }); await tap('[data-act="toggle-details"]'); break;
      case 'cards': A.push('cards'); break;
      case 'flight': case 'boarding': case 'pass': pass('pass_ai'); break;
      case 'salamair': pass('pass_salam'); break;
      case 'movie': pass('pass_movie'); break;
      case 'train': pass('pass_train'); break;
      case 'event': pass('pass_concert'); break;
      case 'hotel': pass('pass_hotel'); break;
      case 'transit': pass('pass_metro'); break;
      case 'loyalty': pass('pass_yes'); break;
      case 'gift': pass('pass_gift'); break;
      case 'barcode': pass('pass_movie'); await A.wait(500); openBarcode(A.findPass('pass_movie')); break;
      case 'add': A.push('add', {}); break;
      case 'add-gift': A.push('providers', { cat: 'gift' }); break;
      case 'add-loyalty': A.push('providers', { cat: 'loyalty' }); break;
      case 'add-transport': A.push('providers', { cat: 'transit' }); break;
      case 'add-tickets': A.push('templates', { cat: 'tickets' }); break;
      case 'add-ids': A.push('ids', { group: 'identity' }); break;
      case 'add-abha': A.push('add', {}); await A.wait(400); A.openDocType('IN.abha'); break;
      case 'add-other': A.push('other'); break;
      case 'account': openAccountSheet(); break;
      case 'menu': A.push('card', { id: firstCard() }); await tap('[data-act="card-menu"]'); break;
      case 'form': A.push('form', { template: 'payment', values: { kind: 'credit', issuerId: 'axis', productId: 'magnus', prefix: '4111 11', last4: '1111', color: null, contactless: true } }); break;
      case 'form-error': A.push('form', { template: 'payment' }); await A.wait(500); A.saveForm(); break;
      case 'form-pass': A.push('form', { template: 'flight', providerId: 'flight.airindia' }); break;
      case 'search': A.ui.search = { q: '', filter: 'all', sort: 'upcoming' }; A.push('search'); break;
      case 'settings': A.push('settings'); break;
      case 'calendar': A.push('calendar'); break;
      case 'about': A.push('about'); break;
      case 'archived': A.push('archived'); break;
      case 'vault': case 'vault-locked': A.push('vault', {}); break;
      case 'doc': A.push('vault', {}); await A.wait(300); A.push('doc', { id: 'doc_aadhaar' }); break;
      case 'doc-form': A.push('vault', {}); await A.wait(300); A.push('doc-form', { typeId: 'IN.pan' }); break;
      case 'review': A.push('review', A.proposeFromEvents(A.E.parseIcs(SAMPLE_ICS), 'sample-bookings.ics')); break;
      case 'pay': A.W.settings.confirmBeforeDemoTap = false; openPay(firstCard()); break;
      case 'pay-done': A.W.settings.confirmBeforeDemoTap = false; openPay(firstCard()); await A.wait(400); document.querySelector('[data-pay="tap"]').click(); await A.wait(1700); break;
      case 'pay-confirm': openPay(firstCard()); break;
      case 'empty': A.W.cards = []; A.W.passes = []; A.refreshAll(); break;
      default: break;
    }
  }
  // A small synthetic calendar used by the review screenshot and tests.
  const d = (n, h) => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(h, 0, 0, 0); return x.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'); };
  const SAMPLE_ICS = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:s1', `DTSTART:${d(6, 9)}`, `DTEND:${d(6, 11)}`, 'SUMMARY:Flight EK 512 DXB → BOM', 'DESCRIPTION:Emirates booking reference: QX7P2L\\nSeat 32A', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:s2', `DTSTART:${d(2, 10)}`, `DTEND:${d(2, 11)}`, 'SUMMARY:Weekly team sync', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:s3', `DTSTART:${d(4, 18)}`, 'SUMMARY:Movie: Night Train', 'LOCATION:VOX Cinemas Mall', 'DESCRIPTION:Screen 7 Row F Seats F11\\, F12 Booking ID: VX88213', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

  async function boot() {
    const splash = document.getElementById('splash');
    if (splash) splash.querySelector('.splash-mark').innerHTML = I.appMark();
    const t0 = performance.now();
    let res;
    try {
      res = await api.load();
    } catch (err) {
      console.error(err);
      if (splash) splash.classList.add('hide');
      showError('Your wallet file could not be loaded. Check that the app can read its data folder, then try again.');
      return;
    }
    A.W = res.wallet;
    A.meta = { screenshot: res.screenshot, startScreen: res.startScreen, version: res.version };
    A.applyTheme();
    try { await A.vaultSync(); } catch { /* vault unavailable: the page explains */ }
    await A.wait(Math.max(0, A.motionMs(650) - (performance.now() - t0)));
    A.stack.push(A.makePage('home', {}));
    if (splash) { splash.classList.add('hide'); setTimeout(() => splash.remove(), 700); }
    if (res.status === 'recovered') A.snackbar('Your saved wallet couldn’t be read. It was set aside and sample data was loaded.');
    if (res.status === 'migrated') A.snackbar('Your wallet was updated to the new format. A backup of the old file was kept.');
    if (!A.W.settings.onboarded && !A.meta.screenshot) {
      await A.wait(A.motionMs(700));
      A.dialog({ title: 'Welcome to Open Wallet', iconName: 'wallet',
        body: `<p>Keep cards, passes, tickets and personal documents on this computer. No account needed, and it works offline.</p>
          <p>Payment cards are display copies with a <b>demo</b> tap screen. Open Wallet can’t make payments and never asks for full card numbers.</p>`,
        actions: [{ label: 'Choose region', run: () => { A.commit((W) => { W.settings.onboarded = true; }); A.pickRegion(() => A.refreshAll()); } }, { label: 'Got it', run: () => A.commit((W) => { W.settings.onboarded = true; }) }] });
    }
    if (A.meta.screenshot) {
      await A.wait(900);
      if (A.meta.startScreen && A.meta.startScreen !== 'home') { await openStartScreen(A.meta.startScreen); await A.wait(1100); }
      api.settled();
    }
  }

  A.openBarcode = openBarcode;
  A.SAMPLE_ICS = SAMPLE_ICS;
  boot();
})();
