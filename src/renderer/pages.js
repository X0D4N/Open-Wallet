// Open Wallet — main screens: home, card detail, all cards, pass detail,
// search, settings, archived passes and about.
(function () {
  'use strict';

  const A = window.App;
  const L = window.WalletLib;
  const I = window.Icons;
  const esc = L.escapeHtml;
  const icon = I.icon;

  A.PASS_GROUPS = [
    ['all', 'All', null], ['travel', 'Travel', ['flight', 'train', 'bus', 'ferry', 'hotel', 'parking']], ['tickets', 'Tickets', ['movie', 'event', 'sports']],
    ['loyalty', 'Loyalty', ['loyalty']], ['gift', 'Gift cards', ['gift']], ['transit', 'Transport', ['transit']], ['other', 'Other', ['generic']]
  ];
  const inGroup = (p, g) => { const grp = A.PASS_GROUPS.find((x) => x[0] === g); return !grp || !grp[2] || grp[2].includes(p.template); };
  const soon = (p) => { const w = A.passWhen(p); if (!w) return false; const d = w - Date.now(); return d > -3 * 3600000 && d < 14 * 86400000; };

  // ---------------- Home ----------------
  A.PAGES.home = {
    render() {
      const W = A.W;
      const cards = W.cards;
      const def = A.defaultCard();
      if (A.ui.cardIndex == null || A.ui.cardIndex >= cards.length) A.ui.cardIndex = Math.max(0, cards.indexOf(def));
      const cur = cards[A.ui.cardIndex] || null;
      const all = A.sortedPasses(W.passes.filter((p) => !p.archived));
      const featured = W.settings.notifyPassUpdates ? all.find((p) => ['flight', 'train', 'bus', 'ferry', 'movie', 'event', 'sports', 'hotel'].includes(p.template) && soon(p)) : null;
      const g = A.ui.homeGroup || 'all';
      const passes = all.filter((p) => p !== featured && inGroup(p, g));
      const archived = W.passes.filter((p) => p.archived).length;
      const docCount = A.ui.docCount || 0;

      const carousel = cards.length ? `<div class="carousel" data-carousel tabindex="0" aria-roledescription="carousel" aria-label="Payment cards">
          <div class="track" data-track>${cards.map((c, i) => `<div class="car-item ${i === A.ui.cardIndex ? 'on' : ''}" data-act="open-card" data-id="${esc(c.id)}" data-card-id="${esc(c.id)}" role="button" tabindex="-1" aria-label="${esc(A.cardName(c))} ending ${esc(c.last4)}">${A.payCardHtml(c)}</div>`).join('')}</div>
        </div>
        ${cards.length > 1 ? `<div class="dots" aria-hidden="true">${cards.map((c, i) => `<i class="${i === A.ui.cardIndex ? 'on' : ''}"></i>`).join('')}</div>` : ''}`
        : `<button class="stack-empty" data-act="add-form" data-template="payment">${icon('card')}<b>Add a payment card</b><span>Shows the card’s design and last 4 digits. It can’t pay.</span></button>`;

      const chips = A.PASS_GROUPS.filter(([k, , list]) => !list || all.some((p) => list.includes(p.template)))
        .map(([k, label]) => `<button class="chip-f ${g === k ? 'sel' : ''}" data-act="home-group" data-group="${k}" aria-pressed="${g === k}">${label}</button>`).join('');

      return `<header class="topbar home">
          <div class="brand"><span class="brand-name">Wallet</span></div>
          <button class="icon-btn" data-act="search" aria-label="Search" title="Search">${icon('search')}</button>
          <button class="icon-btn" data-act="account" aria-label="Account and settings" title="Account and settings"><span class="avatar">${esc(L.initials(cur && cur.holder ? cur.holder : 'You'))}</span></button>
        </header>
        <div class="page-scroll" data-scroll="home">
          ${carousel}
          ${cur ? `<div class="hold-row"><button class="ready-chip" data-act="pay" data-id="${esc(cur.id)}"><span class="hold-dot">${I.contactless()}</span><span>Hold to reader · demo</span></button>
            <button class="icon-btn sm" data-act="go" data-page="cards" aria-label="All payment cards" title="All payment cards">${icon('stack')}</button></div>` : ''}
          ${featured ? `<div class="featured-wrap">${A.Art.passFeatured(featured)}</div>` : ''}
          <div class="section-head"><h2>Passes</h2>${all.length ? `<button class="text-btn" data-act="search">Search</button>` : ''}</div>
          ${all.length > 2 ? `<div class="chips home-chips" role="toolbar" aria-label="Filter passes">${chips}</div>` : ''}
          ${passes.length ? `<div class="pass-grid">${passes.map(A.passTileHtml).join('')}</div>`
            : all.length ? `<div class="empty small"><span>No passes in this group.</span></div>` : `
            <div class="empty"><div class="art"><i></i><i></i><i></i></div><h3>Your passes show up here</h3>
              <span>Add boarding passes, tickets, loyalty and gift cards.</span>
              <button class="btn tonal" data-act="add" style="margin-top:8px">${icon('add')}Add a pass</button></div>`}
          <div class="section-head"><h2>IDs &amp; documents</h2></div>
          <button class="vault-tile" data-act="go" data-page="vault"><span class="vt-icon">${icon('lock')}</span>
            <span class="vt-body"><b>Identity &amp; documents</b><span>${docCount ? `${docCount} saved · ` : ''}Locked with your PIN. Personal copies, not verified IDs</span></span>${icon('chevron')}</button>
          ${archived ? `<div class="center-row"><button class="text-btn" data-act="go" data-page="archived">Archived passes (${archived})</button></div>` : ''}
        </div>
        <button class="fab enter ${A.ui.fabCollapsed ? 'collapsed' : ''}" data-act="add" aria-label="Add to Wallet">${icon('add')}<span class="fab-label">Add to Wallet</span></button>`;
    },
    mount(el, params) {
      const sc = el.querySelector('.page-scroll');
      const bar = el.querySelector('.topbar');
      const fab = el.querySelector('.fab');
      const ui = A.ui;
      sc.addEventListener('scroll', () => {
        const y = sc.scrollTop;
        bar.classList.toggle('scrolled', y > 4);
        if (y > ui.lastScroll + 6 && y > 40) ui.fabCollapsed = true;
        else if (y < ui.lastScroll - 6 || y < 40) ui.fabCollapsed = false;
        fab.classList.toggle('collapsed', ui.fabCollapsed);
        ui.lastScroll = y;
      }, { passive: true });
      mountCarousel(el);
      if (params.shown) el.querySelectorAll('.enter').forEach((n) => n.classList.remove('enter'));
      else setTimeout(() => { params.shown = true; el.querySelectorAll('.enter').forEach((n) => n.classList.remove('enter')); }, 1200);
    }
  };

  // Swipeable card carousel: the selected card fills the width and the next
  // one peeks in from the right. Drag, arrow keys or the dots change it.
  function mountCarousel(el) {
    const car = el.querySelector('[data-carousel]');
    if (!car) return;
    const track = car.querySelector('[data-track]');
    const items = [...track.children];
    const n = items.length;
    const geom = () => { const w = car.clientWidth - 32 - (n > 1 ? 28 : 0); return { w, step: w + 10 }; };
    const layout = (dx = 0, animate = true) => {
      const { w, step } = geom();
      items.forEach((it) => { it.style.width = `${w}px`; });
      track.style.transition = animate && !A.reduced() ? 'transform 380ms var(--ease-emph)' : 'none';
      track.style.transform = `translateX(${16 - A.ui.cardIndex * step + dx}px)`;
      car.style.height = `${w / 1.586 + 4}px`;
    };
    const select = (i) => {
      const next = Math.max(0, Math.min(n - 1, i));
      if (next !== A.ui.cardIndex) {
        A.ui.cardIndex = next;
        items.forEach((it, k) => it.classList.toggle('on', k === next));
        el.querySelectorAll('.dots i').forEach((d, k) => d.classList.toggle('on', k === next));
        const chip = el.querySelector('.ready-chip');
        if (chip) chip.dataset.id = A.W.cards[next].id;
        const av = el.querySelector('.topbar .avatar');
        if (av) av.textContent = L.initials(A.W.cards[next].holder || 'You');
      }
      layout();
    };
    layout(0, false);
    new ResizeObserver(() => layout(0, false)).observe(car);
    let x0 = null, dx = 0, dragged = false;
    track.addEventListener('pointerdown', (e) => { if (n < 2) return; x0 = e.clientX; dx = 0; dragged = false; track.setPointerCapture(e.pointerId); });
    track.addEventListener('pointermove', (e) => {
      if (x0 == null) return;
      dx = e.clientX - x0;
      if (Math.abs(dx) > 6) dragged = true;
      const edge = (A.ui.cardIndex === 0 && dx > 0) || (A.ui.cardIndex === n - 1 && dx < 0);
      layout(edge ? dx / 3 : dx, false);
    });
    const end = () => {
      if (x0 == null) return;
      x0 = null;
      const { step } = geom();
      if (Math.abs(dx) > Math.min(60, step / 5)) select(A.ui.cardIndex + (dx < 0 ? 1 : -1)); else layout();
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('click', (e) => {
      if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; return; }
      const it = e.target.closest('.car-item');
      const i = items.indexOf(it);
      if (i !== A.ui.cardIndex) { e.stopPropagation(); e.preventDefault(); select(i); } // tapping the peeking card brings it forward
    }, true);
    car.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); select(A.ui.cardIndex + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); select(A.ui.cardIndex - 1); }
      else if (e.key === 'Enter') items[A.ui.cardIndex].click();
    });
  }

  // ---------------- Payment card detail ----------------
  A.PAGES.card = {
    render({ id }) {
      const c = A.findCard(id);
      if (!c) return null;
      const m = A.Art.cardMatch(c);
      const isDef = A.W.settings.defaultCardId === c.id;
      const open = !!A.ui.expanded[c.id];
      const txs = c.transactions.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const exp = c.expMonth ? `${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}` : '—';
      const cap = (s) => s[0].toUpperCase() + s.slice(1);
      return `${A.topbar({ title: c.nickname || A.cardName(c), actions: `<button class="icon-btn" data-act="card-menu" data-id="${esc(c.id)}" aria-label="More options" title="More options">${icon('more')}</button>` })}
        <div class="page-scroll">
          <div class="detail-card">${A.payCardHtml(c, { shared: true })}</div>
          ${isDef ? `<div class="status-line good">${icon('check')}Default card for demo tap</div>`
            : `<div class="status-line"><button class="text-btn" data-act="set-default" data-id="${esc(c.id)}">Make default for demo tap</button></div>`}
          <div class="detail-actions">
            <button class="btn filled" data-act="pay" data-id="${esc(c.id)}">${I.contactless()}Demo tap to pay</button>
            <button class="btn tonal expander-btn" data-act="toggle-details" data-id="${esc(c.id)}" aria-expanded="${open}">Card details${icon('expand', 'rot')}</button>
          </div>
          <div class="expander" data-expander style="height:${open ? 'auto' : '0px'}">
            <div class="kv" style="padding-top:16px">
              <div><div class="k">Card number</div><div class="v">•••• ${esc(c.last4)}</div></div>
              <div><div class="k">Expires</div><div class="v">${esc(exp)}</div></div>
              <div><div class="k">Issuer</div><div class="v">${esc(m.issuer ? m.issuer.name : c.issuerName || 'Not set')}</div></div>
              <div><div class="k">Network</div><div class="v">${esc(m.network ? m.network.name : 'Not set')}</div></div>
              <div><div class="k">Product</div><div class="v">${esc(m.product ? m.product.name : c.productName || 'Not set')}</div></div>
              <div><div class="k">Type</div><div class="v">${esc(cap(c.kind))}</div></div>
              <div><div class="k">Name on card</div><div class="v">${esc(c.holder || '—')}</div></div>
              <div><div class="k">Added</div><div class="v">${esc(L.shortDate(c.addedAt))}</div></div>
            </div>
          </div>
          <button class="list-item match-row" data-act="identify-card" data-id="${esc(c.id)}"><span class="lead plain">${icon('palette')}</span>
            <span class="body"><span class="l1" style="display:block">Card design</span><span class="l2">${esc(A.E.MATCH_TEXT[m.level])}${m.productNetworkMismatch ? '. This product isn’t usually on this network, so check it' : ''}</span></span><span class="text-btn">Change</span></button>
          <div class="subhead" style="display:flex;align-items:center">Recent activity <span class="tag">Sample &amp; demo</span></div>
          ${txs.length ? `<div class="list">${txs.map((t) => A.txItem(t, 'card', c.id)).join('')}</div>`
            : '<div class="empty" style="padding:16px 32px"><span>No activity yet. Demo taps you make show up here.</span></div>'}
          <div class="notice">${icon('info')}<span>A display copy, not a payment credential. Open Wallet can’t pay, and it only keeps the last 4 digits. It never keeps the full number or the security code. Bank names and colours identify the card. The design is Open Wallet’s own, not the bank’s card art.</span></div>
        </div>`;
    }
  };

  // ---------------- All cards (selection + order) ----------------
  A.PAGES.cards = {
    render() {
      const cards = A.W.cards;
      return `${A.topbar({ title: 'Payment cards', actions: `<button class="icon-btn" data-act="add-form" data-template="payment" aria-label="Add a card" title="Add a card">${icon('add')}</button>` })}
        <div class="page-scroll">
          <p class="lead-text">Pick a card to see it. Use the arrows to change the order on your home screen.</p>
          ${cards.length ? `<div class="card-list">${cards.map((c, i) => `<div class="card-row" style="animation-delay:${i * 50}ms">
              <div class="card-thumb" data-act="open-card" data-id="${esc(c.id)}" role="button" tabindex="0" aria-label="${esc(A.cardName(c))} ending ${esc(c.last4)}">${A.payCardHtml(c)}</div>
              <div class="card-row-side"><b>${esc(A.cardName(c))}</b><span>•••• ${esc(c.last4)}${A.W.settings.defaultCardId === c.id ? ' · Default' : ''}</span>
                <div class="row-btns"><button class="icon-btn sm" data-act="move-card" data-id="${esc(c.id)}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up" title="Move up">${icon('arrowUp')}</button>
                <button class="icon-btn sm" data-act="move-card" data-id="${esc(c.id)}" data-dir="1" ${i === cards.length - 1 ? 'disabled' : ''} aria-label="Move down" title="Move down">${icon('arrowDown')}</button></div></div>
            </div>`).join('')}</div>`
            : `<div class="empty"><h3>No payment cards</h3><span>Add one to see its design here.</span><button class="btn tonal" data-act="add-form" data-template="payment">${icon('add')}Add a card</button></div>`}
        </div>`;
    }
  };

  // ---------------- Pass detail ----------------
  const SOURCE_NOTE = {
    manual: ['edit', 'Manual record. You entered these details on this computer.'],
    import: ['upload', 'Imported copy. The original file is kept unchanged and encrypted on this computer.'],
    calendar: ['calendar', 'From Google Calendar. Only details found in the event, or that you added, are shown.'],
    sample: ['info', 'Sample pass with made-up details. Its code is a demo and won’t work at a gate or scanner.']
  };
  A.PAGES.pass = {
    render({ id }) {
      const p = A.findPass(id);
      if (!p) return null;
      const t = A.TPL[p.template];
      const reveal = A.ui.reveal[p.id] || {};
      const hasSecret = (p.template === 'gift' && (p.fields.pin || p.fields.number)) || (['loyalty', 'transit'].includes(p.template) && p.fields.number);
      const history = (p.history || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const [sic, stext] = SOURCE_NOTE[p.source] || SOURCE_NOTE.manual;
      return `${A.topbar({ title: t.label, actions: `<button class="icon-btn" data-act="favorite" data-id="${esc(p.id)}" aria-pressed="${p.favorite}" aria-label="${p.favorite ? 'Remove from favourites' : 'Add to favourites'}" title="${p.favorite ? 'Favourite' : 'Add to favourites'}">${icon(p.favorite ? 'star' : 'starOutline')}</button>
          <button class="icon-btn" data-act="pass-menu" data-id="${esc(p.id)}" aria-label="More options" title="More options">${icon('more')}</button>` })}
        <div class="page-scroll">
          ${p.archived ? `<div class="notice">${icon('archive')}<span>This pass is archived, so it’s hidden from your home screen.</span></div>` : ''}
          ${p.sourceStatus === 'removed' ? `<div class="notice warn">${icon('calendar')}<span>The calendar event for this pass was deleted. The pass is kept until you delete it.</span></div>` : ''}
          ${p.sourceStatus === 'changed' ? `<div class="notice warn">${icon('calendar')}<span>The calendar event changed. Review it from Settings › Google Calendar › Sync now.</span></div>` : ''}
          <div class="pass-wrap">${A.Art.passCard(p, { shared: true, reveal })}</div>
          <div class="detail-actions wrap">
            ${hasSecret ? `<button class="btn tonal" data-act="reveal-pass" data-id="${esc(p.id)}">${icon(Object.keys(reveal).length ? 'eyeOff' : 'eye')}${Object.keys(reveal).length ? 'Hide numbers' : 'Show numbers'}</button>` : ''}
            ${p.original ? `<button class="btn tonal" data-act="open-original" data-id="${esc(p.id)}">${icon('generic')}Original file</button>` : ''}
            ${p.template === 'gift' ? `<button class="btn tonal" data-act="edit-balance" data-id="${esc(p.id)}">${icon('edit')}Update balance</button>` : ''}
            ${p.template === 'transit' ? `<button class="btn tonal" data-act="add-value" data-id="${esc(p.id)}">${icon('add')}Add value (demo)</button>` : ''}
            <button class="btn outlined" data-act="edit-pass" data-id="${esc(p.id)}">${icon('edit')}Edit</button>
          </div>
          ${p.template === 'transit' && history.length ? `<div class="subhead" style="display:flex;align-items:center">Trips and top-ups <span class="tag">Sample &amp; demo</span></div>
            <div class="list">${history.map((tx) => A.txItem(tx, 'pass', p.id)).join('')}</div>` : ''}
          <div class="notice">${icon(sic)}<span>${esc(stext)}</span></div>
          ${p.barcode.value && p.barcode.source !== 'demo' ? `<div class="notice">${icon('qr')}<span>The code text is kept exactly as ${p.barcode.source === 'import' ? 'imported' : 'you entered it'}. Some tickets use a different barcode type or a code that changes. If a scanner won’t read this one, show the original ticket.</span></div>` : ''}
          ${['transit', 'loyalty', 'gift'].includes(p.template) ? `<div class="notice">${icon('info')}<span>Balances and points are your own notes. Open Wallet doesn’t connect to ${esc(t.providerLabel.toLowerCase())}s, so it can’t show live values or pay fares.</span></div>` : ''}
        </div>`;
    }
  };

  // ---------------- Search ----------------
  A.FILTERS = [['all', 'All'], ['payment', 'Payment']].concat(A.PASS_GROUPS.slice(1).map(([k, l]) => [k, l]));

  function searchResults() {
    const { q, filter } = A.ui.search;
    const items = [
      ...A.W.cards.map((c) => ({ type: 'card', group: 'payment', id: c.id, title: A.cardName(c), subtitle: `${c.nickname ? `${c.nickname} · ` : ''}•••• ${c.last4}`, color: (A.Art.cardMatch(c).issuer || { colors: ['#3c4043'] }).colors[0], ic: 'card', src: c })),
      ...A.sortedPasses(A.W.passes, A.ui.search.sort).map((p) => {
        const v = A.Art.passInfo(p);
        const grp = (A.PASS_GROUPS.find((g) => g[2] && g[2].includes(p.template)) || ['other'])[0];
        return { type: 'pass', group: grp, id: p.id, title: v.title, subtitle: `${v.sub || v.t.label}`, color: v.color, ic: v.icon, archived: p.archived, favorite: p.favorite,
          src: { title: v.title, subtitle: v.sub, issuer: v.provName, kind: v.t.label, fields: Object.fromEntries(Object.entries(p.fields).filter(([k]) => !['number', 'pin'].includes(k))) } };
      })
    ];
    return items.filter((it) => (filter === 'all' || it.group === filter) && L.matchesQuery(Object.assign({}, it.src, { title: it.title, subtitle: it.subtitle }), q));
  }

  A.resultsHtml = function () {
    const res = searchResults();
    if (!res.length) {
      return `<div class="empty"><div class="art"><i></i><i></i><i></i></div><h3>No matches</h3><span>${A.ui.search.q ? `Nothing in your wallet matches “${esc(A.ui.search.q)}”.` : 'Nothing of this type yet.'}</span>
        <button class="btn tonal" data-act="clear-search">Clear search</button></div>`;
    }
    return `<div class="list">${res.map((r) => `<button class="list-item" data-act="${r.type === 'card' ? 'open-card' : 'open-pass'}" data-id="${esc(r.id)}">
        <span class="result-swatch" style="background:${esc(r.color)};color:${esc(A.Art.inkOn(r.color))}">${icon(r.ic)}</span>
        <span class="body"><span class="l1" style="display:block">${esc(r.title)}${r.favorite ? `<span class="tag fav">${icon('star')}</span>` : ''}${r.archived ? '<span class="tag info">Archived</span>' : ''}</span><span class="l2">${esc(r.subtitle)}</span></span>
        <span class="trail">${icon('chevron')}</span></button>`).join('')}</div>
      <p class="search-foot">${icon('lock')}ID documents are searched inside the locked vault, not here.</p>`;
  };

  A.chipsHtml = () => A.FILTERS.map(([k, label]) => {
    const on = A.ui.search.filter === k;
    return `<button class="chip-f ${on ? 'sel' : ''}" data-act="filter" data-filter="${k}" role="tab" aria-selected="${on}">${on ? icon('check') : ''}${label}</button>`;
  }).join('') + `<button class="chip-f" data-act="search-sort" title="Change sort order">${icon('sort')}${A.ui.search.sort === 'recent' ? 'Recently added' : 'Upcoming first'}</button>`;

  A.PAGES.search = {
    keep: true,
    refresh(e) { e.el.querySelector('[data-results]').innerHTML = A.resultsHtml(); },
    render() {
      return `<header class="topbar search-bar">
          <div class="search-pill"><button class="icon-btn" data-act="back" aria-label="Back" title="Back">${icon('back')}</button>
          <input class="search-field" data-search type="search" placeholder="Search your Wallet" value="${esc(A.ui.search.q)}" aria-label="Search your Wallet"></div>
        </header>
        <div class="chips" role="tablist" data-chips>${A.chipsHtml()}</div>
        <div class="page-scroll" data-results>${A.resultsHtml()}</div>`;
    },
    mount(el) {
      const input = el.querySelector('[data-search]');
      input.addEventListener('input', () => { A.ui.search.q = input.value; el.querySelector('[data-results]').innerHTML = A.resultsHtml(); });
      setTimeout(() => input.focus(), A.motionMs(300));
    }
  };

  // ---------------- Settings ----------------
  A.settingsRow = (attrs, ic, l1, l2, trail = '') => `<button class="list-item" ${attrs}><span class="lead plain">${icon(ic)}</span><span class="body"><span class="l1" style="display:block">${l1}</span>${l2 ? `<span class="l2">${l2}</span>` : ''}</span>${trail}</button>`;
  A.PAGES.settings = {
    render() {
      const s = A.W.settings;
      const def = A.defaultCard();
      const row = A.settingsRow;
      const archived = A.W.passes.filter((p) => p.archived).length;
      const themeLabel = { system: 'System default', light: 'Light', dark: 'Dark' }[s.theme];
      const toggle = (key) => `data-act="toggle-setting" data-key="${key}"`;
      const learned = Object.keys(s.learnedIins).length;
      return `${A.topbar({ title: 'Settings' })}
        <div class="page-scroll">
          <div class="subhead">Appearance</div>
          ${row('data-act="theme"', 'palette', 'Theme', esc(themeLabel))}
          ${row(toggle('reduceMotion'), 'motion', 'Reduce motion', 'Turn off page and card animations', A.sw(s.reduceMotion))}
          ${row('data-act="pick-region"', 'globe', 'Country or region', `${esc(A.regionLabel())}. Used to suggest providers and ID types. Your location isn’t used`)}
          <div class="subhead">Payment cards</div>
          ${row('data-act="choose-default"', 'card', 'Default card', def ? `${esc(A.cardName(def))} •• ${esc(def.last4)}` : 'No cards yet')}
          ${row(toggle('confirmBeforeDemoTap'), 'lock', 'Confirm before demo tap', 'Explain the demo before the tap screen opens', A.sw(s.confirmBeforeDemoTap))}
          ${row('data-act="clear-learned"', 'refresh', 'Card prefixes you confirmed', learned ? `${learned} saved on this computer. Tap to forget them` : 'None saved')}
          <div class="subhead">Passes</div>
          ${row('data-act="sort-passes"', 'sort', 'Sort passes', s.sortPasses === 'recent' ? 'Recently added first' : 'Upcoming first')}
          ${row(toggle('notifyPassUpdates'), 'bell', 'Show what’s next', 'Feature the next trip or event on the home screen', A.sw(s.notifyPassUpdates))}
          ${row(toggle('notifyTransactions'), 'bell', 'Demo payment alerts', 'Show a message after each demo tap', A.sw(s.notifyTransactions))}
          <div class="subhead">IDs &amp; documents</div>
          ${row('data-act="go" data-page="vault"', 'lock', 'Open the document vault', 'Locked with a PIN, encrypted on this computer')}
          ${row('data-act="vault-timeout"', 'lock', 'Lock automatically', `After ${s.vaultTimeout} minute${s.vaultTimeout === 1 ? '' : 's'}`)}
          ${row(toggle('lockOnBlur'), 'eyeOff', 'Lock when you switch apps', 'Lock the vault when this window loses focus', A.sw(s.lockOnBlur))}
          ${row(toggle('expiryReminders'), 'bell', 'Expiry reminders', 'Show documents that expire within 60 days in the vault', A.sw(s.expiryReminders))}
          <div class="subhead">Connections</div>
          ${row('data-act="go" data-page="calendar"', 'calendar', 'Google Calendar', s.calendar.connected ? `Connected${s.calendar.enabled ? '' : ' · importing off'}` : 'Off. Optional, read-only')}
          ${row('data-act="import-ics"', 'upload', 'Import from a calendar file', 'Find bookings in a .ics file, offline')}
          <div class="subhead">Your data</div>
          ${row('data-act="go" data-page="archived"', 'archive', 'Archived passes', archived ? `${archived} archived` : 'None')}
          ${row('data-act="export"', 'download', 'Export a backup', 'Cards and passes as a JSON file. ID documents stay in the vault')}
          ${row('data-act="import"', 'upload', 'Import a backup', 'Replace cards and passes with a saved backup')}
          ${row('data-act="open-folder"', 'folder', 'Open data folder', 'Where your wallet file is kept')}
          ${row('data-act="reset-sample"', 'refresh', 'Restore sample data', 'Replace cards and passes with the demo set')}
          <button class="list-item" data-act="delete-all"><span class="lead plain" style="color:var(--error)">${icon('delete')}</span><span class="body"><span class="l1" style="display:block;color:var(--error)">Delete all cards and passes</span><span class="l2">The document vault is separate (Vault › Reset)</span></span></button>
          <div class="subhead">About</div>
          ${row('data-act="go" data-page="about"', 'info', 'About Open Wallet', `Version ${esc(A.meta.version)} · catalogue ${esc(A.C.VERSION)} · what works and what’s simulated`)}
        </div>`;
    }
  };

  // ---------------- Archived ----------------
  A.PAGES.archived = {
    render() {
      const list = A.sortedPasses(A.W.passes.filter((p) => p.archived));
      return `${A.topbar({ title: 'Archived passes' })}
        <div class="page-scroll">
          ${list.length ? `<div class="list">${list.map((p) => { const v = A.Art.passInfo(p); return `<div style="display:flex;align-items:center">
              <button class="list-item" data-act="open-pass" data-id="${esc(p.id)}" style="flex:1">
                <span class="result-swatch" style="background:${esc(v.color)};color:${esc(A.Art.inkOn(v.color))}">${icon(v.icon)}</span>
                <span class="body"><span class="l1" style="display:block">${esc(v.title)}</span><span class="l2">${esc(v.sub || v.t.label)}</span></span></button>
              <button class="icon-btn" style="margin-right:8px" data-act="archive" data-id="${esc(p.id)}" aria-label="Unarchive ${esc(v.title)}" title="Unarchive">${icon('unarchive')}</button></div>`; }).join('')}</div>`
            : '<div class="empty"><div class="art"><i></i><i></i><i></i></div><h3>No archived passes</h3><span>Passes you archive move here, out of your home screen.</span></div>'}
        </div>`;
    }
  };

  // ---------------- About & limitations ----------------
  A.PAGES.about = {
    render() {
      const r = (f, s, cls) => `<tr><td>${f}</td><td class="${cls}">${s}</td></tr>`;
      const C = A.C;
      const cats = ['loyalty', 'gift', 'transit', 'movie', 'flight', 'train', 'bus', 'ferry', 'event', 'hotel', 'parking'];
      return `${A.topbar({ title: 'About' })}
        <div class="page-scroll"><div class="about">
          <div class="hero"><span class="about-mark">${I.appMark()}</span><b>Open Wallet</b><span>Version ${esc(A.meta.version)} · Open source (MIT)</span></div>
          <p>Open Wallet is an independent, local-first wallet for cards, passes, tickets and personal documents. It is not made by, endorsed by or affiliated with Google, any bank, airline, cinema, transport operator or government. Provider names identify whose card or ticket it is. No logos or official artwork are included.</p>
          <h3>What works and what’s simulated</h3>
          <table class="feature-table">
            ${r('Cards, passes, tickets: add, edit, favourite, archive, delete', 'Works', 'ok')}
            ${r('Card network from the first digits, issuer and product you choose', 'Works', 'ok')}
            ${r('QR and Code 128 codes redrawn from the exact text you enter', 'Works', 'ok')}
            ${r('ID &amp; document vault (PIN, encryption, masking, originals)', 'Works', 'ok')}
            ${r('Calendar file (.ics) booking import with review', 'Works', 'ok')}
            ${r('Google Calendar (read-only, your own OAuth client)', 'Optional', 'sim')}
            ${r('Tap to pay, transit top-ups, card activity', 'Demo only', 'sim')}
            ${r('Real payments, NFC, payment tokens, bank sign-in', 'Not possible', 'no')}
            ${r('Live balances, gate changes, ticket validation', 'Not possible', 'no')}
            ${r('Official or verified digital IDs', 'Not possible', 'no')}
          </table>
          <h3>Catalogue ${esc(C.VERSION)}</h3>
          <p>${C.ISSUERS.length} banks and card issuers, ${C.NETWORKS.length} card networks, ${C.DOCS.length} document types and ${C.PROVIDERS.length} providers: ${cats.map((k) => `${C.PROVIDERS.filter((p) => p.cat === k).length} ${k}`).join(', ')}.
            Every provider is drawn as a text wordmark in approximate brand colours. No artwork is verified against the brand. No bank BIN ranges are bundled. Banks are matched from your choice or from prefixes you confirmed.</p>
          <h3>Privacy</h3>
          <ul><li>No account, no analytics, no tracking.</li><li>Cards and passes are one JSON file in the app’s data folder. ID documents and imported originals are encrypted.</li>
            <li>The only network use is Google Calendar, if you connect it, and official websites you choose to open.</li></ul>
          <h3>Credits</h3>
          <p>Icons follow the Material Icons set (Apache License 2.0). Illustrations, card and pass designs are original to Open Wallet. People, bookings and codes in the sample data are made up.</p>
        </div></div>`;
    }
  };
})();
