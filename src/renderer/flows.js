// Open Wallet — Add to Wallet chooser, provider directories, ticket-type
// chooser, "Everything else" import, pickers, region, Google Calendar
// settings and the booking review screen.
(function () {
  'use strict';

  const A = window.App;
  const L = window.WalletLib;
  const I = window.Icons;
  const api = window.walletApi;
  const esc = L.escapeHtml;
  const icon = I.icon;
  const C = A.C;

  const CAT_NOUN = { loyalty: 'loyalty programmes', gift: 'gift cards', transit: 'transport options', movie: 'cinemas', flight: 'airlines', train: 'railways', bus: 'bus operators',
    ferry: 'ferry and cruise operators', event: 'ticket sellers', hotel: 'hotels and booking sites', parking: 'parking operators' };
  const CAT_TEMPLATE = { loyalty: 'loyalty', gift: 'gift', transit: 'transit', movie: 'movie', flight: 'flight', train: 'train', bus: 'bus', ferry: 'ferry', event: 'event', hotel: 'hotel', parking: 'parking' };

  const groupItem = (attrs, ic, title, sub, trail = '') => `<button class="group-item" ${attrs}><span class="gi-icon">${ic}</span><span class="gi-body"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span>${trail}</button>`;
  const provLogo = (p) => A.Art.logo(p.cat === 'transit' ? p.sub : p.name, p.color, p.fg, 'lg');
  const regionChip = () => `<button class="chip-f region-chip" data-act="pick-region">${icon('globe')}${esc(A.regionLabel())}${icon('expand')}</button>`;

  // ---------------- Add to Wallet ----------------
  function categories() { return C.ADD_CATEGORIES.filter((c) => !c.regions || !A.region() || c.regions.includes(A.region())); }
  A.PAGES.add = {
    keep: true,
    render(params) {
      const q = params.q || '';
      return `<header class="topbar plain"><button class="icon-btn" data-act="back" aria-label="Back" title="Back">${icon('back')}</button><div class="topbar-title"></div>
          <button class="icon-btn" data-act="add-help" aria-label="Help with adding" title="Help with adding">${icon('feedback')}</button></header>
        <div class="page-scroll">
          <h1 class="display">Add to Wallet</h1>
          <div class="add-tools"><div class="search-pill inline">${icon('search')}<input data-add-search type="search" placeholder="Search categories and providers" value="${esc(q)}" aria-label="Search categories and providers"></div>${regionChip()}</div>
          <div data-add-results>${addResults(q)}</div>
          <div class="promo"><div class="promo-text"><b>Got a ticket as a file or in your calendar?</b><span>Import a photo, a PDF or a calendar file. Nothing is uploaded.</span>
            <button class="text-btn" data-act="add-help">Learn how to add to Wallet</button></div><div class="promo-art" aria-hidden="true">${A.Art.motif('generic') || icon('qr')}</div></div>
        </div>`;
    },
    refresh(e) { e.el.querySelector('[data-add-results]').innerHTML = addResults(e.params.q || ''); const rc = e.el.querySelector('.region-chip'); if (rc) rc.outerHTML = regionChip(); },
    mount(el, params) {
      const input = el.querySelector('[data-add-search]');
      input.addEventListener('input', () => { params.q = input.value; el.querySelector('[data-add-results]').innerHTML = addResults(input.value); });
    }
  };
  function addResults(q) {
    const cats = categories();
    const nq = C.norm(q);
    const hitCats = nq ? cats.filter((c) => C.norm(`${c.label} ${c.hint}`).includes(nq)) : cats;
    let html = hitCats.length ? `<div class="group">${hitCats.map((c) => groupItem(`data-act="add-cat" data-cat="${c.id}"`, icon(c.icon), c.label, c.hint)).join('')}</div>` : '';
    if (nq.length >= 2) {
      const provs = C.PROVIDERS.filter((p) => CAT_TEMPLATE[p.cat] && C.norm(`${p.name} ${p.sub} ${p.city || ''}`).includes(nq)).slice(0, 20);
      const docs = C.DOCS.filter((d) => C.norm(`${d.name} ${d.authority}`).includes(nq)).slice(0, 8);
      if (provs.length) html += `<div class="subhead">Providers</div><div class="group">${provs.map((p) => groupItem(`data-act="pick-prov" data-id="${p.id}"`, provLogo(p), p.name, `${p.sub ? `${p.sub} · ` : ''}${A.TPL[CAT_TEMPLATE[p.cat]].label} · ${C.regionName(p.region)}`)).join('')}</div>`;
      if (docs.length) html += `<div class="subhead">Documents</div><div class="group">${docs.map((d) => groupItem(`data-act="pick-doc" data-type="${d.id}"`, icon(d.group === 'health' ? 'health' : d.group === 'vehicle' ? 'car' : 'id'), d.name, `${d.authority} · ${C.regionName(d.region)}`)).join('')}</div>`;
      if (!hitCats.length && !provs.length && !docs.length) html = `<div class="empty small"><span>Nothing matches “${esc(q)}”. Try “Everything else” to add any pass.</span><button class="btn tonal" data-act="add-cat" data-cat="other">Everything else</button></div>`;
    }
    return html;
  }

  function openCategory(id) {
    const c = C.ADD_CATEGORIES.find((x) => x.id === id);
    if (!c) return;
    if (c.route === 'form') A.push('form', { template: c.template });
    else if (c.route === 'providers') A.push('providers', { cat: c.cat });
    else if (c.route === 'templates') A.push('templates', { cat: c.id });
    else if (c.route === 'ids') A.push('ids', { group: c.group });
    else if (c.route === 'doc') A.openDocType(c.doc);
    else if (c.route === 'other') A.push('other');
  }

  // ---------------- Ticket-type chooser ----------------
  A.PAGES.templates = {
    render({ cat }) {
      const c = C.ADD_CATEGORIES.find((x) => x.id === cat);
      return `${A.topbar({ title: '', cls: 'plain' })}<div class="page-scroll">
          <span class="hero-icon">${icon(c.icon)}</span><h1 class="display">${cat === 'travel' ? 'What are you travelling with?' : 'What’s the ticket for?'}</h1>
          <div class="group">${c.templates.map((k) => { const t = A.TPL[k]; return groupItem(`data-act="pick-template" data-template="${k}"`, icon(t.icon), t.label, templateHint(k)); }).join('')}</div>
          <p class="lead-text">Can’t see it? <button class="text-btn inline" data-act="add-form" data-template="generic">Add a custom pass</button></p></div>`;
    }
  };
  function templateHint(k) {
    return { movie: 'Cinema, show time, seats and booking code', flight: 'Route, gate, seat and boarding pass code', train: 'Stations, coach, seat or berth and PNR', bus: 'Boarding point, seat and booking reference',
      ferry: 'Ports, embarkation and cabin', event: 'Concerts, theatre, festivals, museums and attractions', sports: 'Matches and fixtures, stand and seat', hotel: 'Check-in, check-out and booking reference',
      parking: 'Car park, vehicle and validity' }[k] || '';
  }

  // ---------------- Provider directory ----------------
  A.PAGES.providers = {
    keep: true,
    render(params) {
      const { cat } = params;
      const tpl = CAT_TEMPLATE[cat];
      const regionKey = params.filter != null ? params.filter : A.region();
      const searchLabel = ({ loyalty: 'Search loyalty programmes', gift: 'Search gift cards', transit: 'Search city or transport agency' })[cat] || `Search ${CAT_NOUN[cat]}`;
      return `<header class="topbar search-bar"><div class="search-pill"><button class="icon-btn" data-act="back" aria-label="Back" title="Back">${icon('back')}</button>
          <input data-prov-search type="search" placeholder="${esc(searchLabel)}" value="${esc(params.q || '')}" aria-label="${esc(searchLabel)}"></div></header>
        <div class="page-scroll" data-prov-list>${providerList(cat, params.q || '', regionKey, tpl)}</div>`;
    },
    refresh(e) { e.el.querySelector('[data-prov-list]').innerHTML = providerList(e.params.cat, e.params.q || '', e.params.filter != null ? e.params.filter : A.region(), CAT_TEMPLATE[e.params.cat]); },
    mount(el, params) {
      const input = el.querySelector('[data-prov-search]');
      input.addEventListener('input', () => { params.q = input.value; A.PAGES.providers.refresh({ el, params }); });
    }
  };
  function providerList(cat, q, regionKey, tpl) {
    const region = A.region();
    const popular = !q && region ? C.providers(cat, { region: C.GCC.includes(region) && cat !== 'transit' ? region : region }) : [];
    const all = C.providers(cat, { region: regionKey || '', q });
    const regionsWith = [...new Set(C.PROVIDERS.filter((p) => p.cat === cat).map((p) => p.region))];
    const filters = [['', 'All regions']].concat(regionsWith.map((r) => [r, C.regionName(r)]));
    const item = (p) => groupItem(`data-act="pick-prov" data-id="${p.id}"`, provLogo(p), p.name, cat === 'transit' ? p.sub : p.sub && p.sub !== 'Tickets' && p.sub !== 'Cinemas' ? p.sub : C.regionName(p.region));
    const custom = groupItem(`data-act="add-form" data-template="${tpl}"`, `<span class="wm-logo lg plus">${icon('add')}</span>`, `Add another ${A.TPL[tpl].providerLabel.toLowerCase()}`, 'Type the name yourself');
    return `${cat === 'transit' && !q ? '<h1 class="display">Choose a transport operator</h1>' : ''}
      ${popular.length ? `<div class="subhead with-info">Popular in ${esc(C.regionName(region))}<button class="icon-btn sm" data-act="region-info" aria-label="How suggestions are chosen" title="How suggestions are chosen">${icon('info')}</button></div>
        <div class="group">${popular.slice(0, 6).map(item).join('')}</div>` : ''}
      <div class="subhead">${q ? `Results for “${esc(q)}”` : `All ${esc(CAT_NOUN[cat])}`}</div>
      ${!q ? `<div class="chips wrap">${filters.map(([k, label]) => `<button class="chip-f ${regionKey === k ? 'sel' : ''}" data-act="prov-filter" data-region="${k}">${esc(label)}</button>`).join('')}</div>` : ''}
      ${all.length ? `<div class="group">${all.map(item).join('')}</div>` : `<div class="empty small"><span>No ${esc(CAT_NOUN[cat])} match${q ? ` “${esc(q)}”` : ''} here.</span></div>`}
      <div class="group" style="margin-top:12px">${custom}</div>
      <p class="lead-text small">${icon('info')} Open Wallet keeps your own copy of the card or ticket. It doesn’t sign in to or connect with any provider. Names identify the provider; no logos are used.</p>`;
  }

  // ---------------- Everything else ----------------
  A.PAGES.other = {
    render() {
      return `${A.topbar({ title: '', cls: 'plain' })}<div class="page-scroll">
          <span class="hero-icon">${icon('photo')}</span><h1 class="display">Everything else</h1>
          <p class="lead-text">Keep any pass, card, ticket or receipt. The original file is kept unchanged and encrypted on this computer.</p>
          <div class="group">
            ${groupItem('data-act="import-original"', icon('upload'), 'Import a photo, screenshot or PDF', 'Then choose what it is and check the details')}
            ${groupItem('data-act="camera"', icon('photo'), 'Take a photo with the camera', 'Uses your webcam after you allow it')}
            ${groupItem('data-act="add-form" data-template="generic"', icon('edit'), 'Create a custom pass', 'Your own title, details, colour and code')}
            ${groupItem('data-act="import-ics"', icon('calendar'), 'Find bookings in a calendar file', 'Reads a .ics file on this computer')}
          </div>
          <div class="notice">${icon('info')}<span>Open Wallet doesn’t read text or codes from pictures yet, so you type in the details yourself. Nothing is guessed, and nothing is sent to an online service.</span></div>
        </div>`;
    }
  };

  // After a file is imported: choose what it is, then fill in the form.
  function chooseTemplateFor(original) {
    const opts = ['movie', 'flight', 'train', 'bus', 'ferry', 'event', 'sports', 'hotel', 'parking', 'loyalty', 'gift', 'transit', 'generic'];
    const l = A.sheet('What is it?', `<div class="list">${opts.map((k) => `<button class="list-item" data-pick-tpl="${k}"><span class="lead">${icon(A.TPL[k].icon)}</span><span class="body"><span class="l1" style="display:block">${esc(k === 'generic' ? 'Something else' : A.TPL[k].label)}</span></span></button>`).join('')}</div>`);
    l.el.querySelectorAll('[data-pick-tpl]').forEach((b) => b.addEventListener('click', () => {
      l.close();
      A.push('form', { template: b.dataset.pickTpl, prefill: { source: 'import', original, fields: {}, note: `Imported “${original.name}”. Type in the details from your ticket. Only what you enter is shown.` } });
    }));
  }
  async function importOriginal() {
    const r = await api.originals.add();
    if (!r.ok) { if (r.reason === 'disabled') A.snackbar('Importing is turned off in screenshot mode'); else if (r.message) A.dialog({ title: 'Couldn’t import that file', body: `<p>${esc(r.message)}</p>`, actions: [{ label: 'OK' }] }); return; }
    chooseTemplateFor(r.file);
  }
  function openCamera() {
    const el = document.createElement('div');
    el.className = 'viewer camera';
    el.innerHTML = `<div class="cam-top"><button class="icon-btn" data-cam="close" aria-label="Close">${icon('close')}</button><span>Hold the ticket flat and fill the frame</span></div>
      <video autoplay playsinline muted></video><div class="cam-msg" aria-live="polite">Asking to use the camera…</div>
      <button class="cam-shutter" data-cam="shot" aria-label="Take photo" disabled></button>`;
    const l = A.openLayer(el, { scrim: false, outMs: 10, onClose: () => { if (stream) stream.getTracks().forEach((t) => t.stop()); } });
    let stream = null;
    const video = el.querySelector('video');
    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 } }, audio: false }).then((s) => {
      stream = s; video.srcObject = s; el.querySelector('.cam-msg').textContent = ''; el.querySelector('[data-cam="shot"]').disabled = false;
    }).catch(() => { el.querySelector('.cam-msg').textContent = 'No camera, or permission was denied. You can import a photo instead.'; });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-cam]');
      if (!b) return;
      if (b.dataset.cam === 'close') { l.close(); return; }
      const cv = document.createElement('canvas');
      cv.width = video.videoWidth; cv.height = video.videoHeight;
      cv.getContext('2d').drawImage(video, 0, 0);
      const r = await api.originals.addData(cv.toDataURL('image/png'));
      l.close();
      if (r && r.ok) chooseTemplateFor(r.file); else A.snackbar('Couldn’t save the photo');
    });
  }

  // ---------------- Pickers (sheets) ----------------
  function pickerSheet(title, placeholder, listFn, onPick, extra) {
    const l = A.sheet(title, `<div class="sheet-search"><div class="search-pill inline">${icon('search')}<input type="search" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></div></div><div class="list picker-list" data-list>${listFn('')}</div>${extra || ''}`);
    l.el.classList.add('tall');
    const input = l.el.querySelector('input');
    input.addEventListener('input', () => { l.el.querySelector('[data-list]').innerHTML = listFn(input.value); });
    l.el.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) { l.close(); onPick(b.dataset.pick); } });
    setTimeout(() => input.focus(), 120);
    return l;
  }
  function pickIssuer() {
    const e = A.top();
    const row = (b) => `<button class="list-item" data-pick="${b.id}"><span class="result-swatch" style="background:linear-gradient(135deg,${b.colors[0]},${b.colors[1]})"></span><span class="body"><span class="l1" style="display:block">${esc(b.name)}</span><span class="l2">${esc(C.regionName(b.country))}${b.products.length ? ` · ${b.products.length} products` : ''}</span></span></button>`;
    const list = (q) => {
      const local = A.region() ? C.issuersFor(q, A.region()) : [];
      const rest = C.issuersFor(q).filter((b) => !local.includes(b));
      return `${local.length ? `<div class="subhead">${esc(A.regionLabel())}</div>${local.map(row).join('')}<div class="subhead">Other regions</div>` : ''}${rest.map(row).join('') || '<div class="empty small"><span>No banks match.</span></div>'}`;
    };
    pickerSheet('Choose your bank', 'Search banks and card issuers', list, (id) => {
      if (id === '__other') {
        const d = A.dialog({ title: 'Bank or issuer name', body: '<div class="field" style="margin-top:12px"><input id="iss" placeholder=" " maxlength="60"><label for="iss">Name</label></div>',
          actions: [{ label: 'Cancel' }, { label: 'Use this name', run: (el) => { const n = el.querySelector('#iss').value.trim(); if (n) { Object.assign(e.params.values, { issuerId: '', productId: '', issuerName: n }); A.renderEntry(e); } } }] });
        return d;
      }
      Object.assign(e.params.values, { issuerId: id, issuerName: '', productId: '' });
      const b = C.issuer(id);
      if (b.networkLocked) e.params.values.networkId = b.networkLocked;
      if (e.params.errors) delete e.params.errors.issuer;
      A.renderEntry(e);
    }, `<button class="list-item" data-pick="__other"><span class="lead">${icon('add')}</span><span class="body"><span class="l1">My bank isn’t listed</span><span class="l2" style="display:block">Type the name. It gets a neutral design</span></span></button>`);
  }
  function pickProvider() {
    const e = A.top();
    const t = A.TPL[e.params.template];
    const cat = t.providerCat;
    const row = (p) => `<button class="list-item" data-pick="${p.id}">${provLogo(p)}<span class="body"><span class="l1" style="display:block">${esc(p.name)}</span><span class="l2">${esc(p.sub || C.regionName(p.region))}</span></span></button>`;
    const list = (q) => { const items = cat ? C.providers(cat, { q }) : []; const reg = A.region(); items.sort((a, b) => (b.region === reg) - (a.region === reg)); return items.map(row).join('') || '<div class="empty small"><span>None match. Use “Not in the list”.</span></div>'; };
    pickerSheet(t.providerLabel, `Search ${CAT_NOUN[cat] || 'providers'}`, list, (id) => {
      Object.assign(e.params.values, id === '__none' ? { providerId: '' } : { providerId: id, providerName: '' });
      A.renderEntry(e);
    }, `<button class="list-item" data-pick="__none"><span class="lead">${icon('edit')}</span><span class="body"><span class="l1">Not in the list</span><span class="l2" style="display:block">Type the name in the form</span></span></button>`);
  }
  A.pickRegion = function (after) {
    const cur = A.region();
    const l = A.sheet('Country or region', `<p class="sheet-note">Used to suggest providers and document types. You can still add anything from anywhere. Your location isn’t used.</p>
      <div class="list">${[{ code: '', name: 'All regions' }].concat(C.REGIONS).map((r) => `<button class="radio-row" data-region="${r.code}"><span class="radio ${cur === r.code ? 'on' : ''}"></span>${esc(r.name)}</button>`).join('')}</div>`);
    l.el.classList.add('tall');
    l.el.querySelectorAll('[data-region]').forEach((b) => b.addEventListener('click', () => {
      l.close();
      A.commit((W) => { W.settings.region = b.dataset.region; });
      A.snackbar(`Region: ${A.regionLabel()}`);
      if (after) after();
    }));
  };

  // ---------------- Help ----------------
  function addHelp() {
    A.sheet('Adding to Wallet', `<div class="help-body">
      <p><b>Type it in.</b> Pick a category and a provider, then enter the details from your card or ticket. This always works, offline and without an account.</p>
      <p><b>Import a file.</b> Under “Everything else”, import a photo, screenshot or PDF. The original is kept unchanged and encrypted, and you add the details yourself.</p>
      <p><b>Calendar bookings.</b> Import a .ics file, or connect Google Calendar (optional, read-only) in Settings. You review every booking before it’s saved.</p>
      <p><b>IDs and documents</b> go into a separate vault locked with your PIN. They’re personal copies, not official or verified IDs.</p>
      <p><b>Codes.</b> Barcodes and QR codes are redrawn from the exact text you enter. Open Wallet never invents a code.</p></div>`);
  }

  // ---------------- Calendar ----------------
  A.PAGES.calendar = {
    keep: true,
    refresh(e) { A.renderEntry(e); },
    render(params) {
      const cal = A.W.settings.calendar;
      const imported = A.W.passes.filter((p) => p.source === 'calendar').length;
      const row = A.settingsRow;
      return `${A.topbar({ title: 'Google Calendar' })}
        <div class="page-scroll">
          <div class="cal-status ${cal.connected ? 'on' : ''}">${icon(cal.connected ? 'check' : 'calendar')}<div><b>${cal.connected ? 'Connected (read-only)' : 'Not connected'}</b><span>${cal.lastSync ? `Last synced ${esc(L.relativeDay(cal.lastSync))} at ${esc(L.time(cal.lastSync))}` : 'Never synced'}${cal.lastError ? ` · ${esc(cal.lastError)}` : ''}</span></div></div>
          <div class="notice">${icon('info')}<span><b>What’s read:</b> the title, time, place, organiser name and description of events from yesterday to 6 months ahead, in your main calendar. Only events that look like bookings are suggested, and you review each one. Open Wallet keeps only the details of passes you save, plus the event’s ID to avoid duplicates. It can’t change or delete your events. Nothing is sent anywhere except Google’s own servers.</span></div>
          ${cal.connected ? `
            ${row('data-act="cal-toggle" data-key="enabled"', 'sync', 'Find bookings in my calendar', cal.enabled ? 'On. Only when you tap Sync now' : 'Off. Nothing is read', A.sw(cal.enabled))}
            ${row(`data-act="cal-sync" ${cal.enabled ? '' : 'disabled'}`, 'refresh', 'Sync now', cal.enabled ? 'Look for new and changed bookings' : 'Turn on finding bookings first')}
            ${row('data-act="cal-toggle" data-key="autoImport"', 'check', 'Add confident matches without asking', 'Off by default. Matches with missing details always wait for your review', A.sw(cal.autoImport))}
            ${row('data-act="cal-removed"', 'delete', 'If an event is deleted', cal.onRemoved === 'delete' ? 'Delete its pass too' : 'Keep the pass and mark it')}
            ${row('data-act="cal-disconnect"', 'link', 'Disconnect Google Calendar', 'Revokes access and deletes the sign-in token. Your passes stay')}`
          : `<div class="form" style="padding-top:8px">
              <p class="lead-text" style="padding:0">To connect, use an OAuth client from your own Google Cloud project (type “Desktop app”), with the Google Calendar API turned on. Open Wallet doesn’t include one.
                <button class="text-btn inline" data-act="open-url" data-url="https://developers.google.com/workspace/calendar/api/quickstart/js">How to create one</button></p>
              <div class="field"><input id="cal-client" placeholder=" " value="${esc(cal.clientId)}" spellcheck="false"><label for="cal-client">OAuth client ID</label><div class="help">Ends in .apps.googleusercontent.com</div></div>
              <div class="field"><input id="cal-secret" type="password" placeholder=" " spellcheck="false"><label for="cal-secret">Client secret (if Google gave you one)</label><div class="help">Kept encrypted on this computer, never shared</div></div>
              <button class="btn filled block" data-act="cal-connect">${icon('calendar')}Connect Google Calendar</button>
            </div>`}
          ${imported ? row('data-act="cal-delete-imported"', 'delete', `Delete ${imported} pass${imported === 1 ? '' : 'es'} imported from the calendar`, 'Your calendar events aren’t touched') : ''}
          <div class="subhead">Without connecting</div>
          ${row('data-act="import-ics"', 'upload', 'Import a calendar file (.ics)', 'Export a file from any calendar app and find bookings in it, offline')}
        </div>`;
    }
  };

  // Turns events into proposals: new, changed, already saved or ignored.
  A.proposeFromEvents = function (events, sourceLabel) {
    const S = A.W.settings;
    const out = [];
    let checked = 0;
    for (const ev of events) {
      checked++;
      if (ev.status === 'cancelled') continue;
      const det = A.E.detectBooking(ev);
      if (!det) continue;
      const ref = String(ev.id).includes(':') ? ev.id : `ics:${ev.id}`;
      if (S.calendarIgnored.includes(ref)) continue;
      const existing = A.W.passes.find((p) => p.sourceRef === ref) || A.W.passes.find((p) => det.fields.ref && p.fields.ref === det.fields.ref && p.template === det.template && p.fields.date === det.fields.date);
      let state = 'new', changes = [];
      if (existing) {
        changes = Object.entries(det.fields).filter(([k, v]) => existing.fields[k] !== v).map(([k, v]) => ({ k, from: existing.fields[k] || '', to: v }));
        state = changes.length ? 'changed' : 'saved';
      }
      if (state === 'saved') continue;
      out.push({ ref, det, ev: { title: ev.title, start: ev.start, location: ev.location }, state, changes, existingId: existing ? existing.id : '' });
    }
    return { proposals: out, checked, sourceLabel };
  };

  A.PAGES.review = {
    render(params) {
      const { proposals, checked, sourceLabel } = params;
      const live = proposals.filter((x) => !x.done);
      return `${A.topbar({ title: 'Review bookings' })}<div class="page-scroll">
          <p class="lead-text">${checked} event${checked === 1 ? '' : 's'} checked in ${esc(sourceLabel)}. ${proposals.length} looked like booking${proposals.length === 1 ? '' : 's'}. Meetings and personal events are skipped.</p>
          ${live.length ? live.map((x) => { const t = A.TPL[x.det.template]; const prov = x.det.provider ? C.provider(x.det.provider) : null; const i = proposals.indexOf(x);
            return `<div class="review-card">
              <div class="rc-head"><span class="lead">${icon(t.icon)}</span><div><b>${esc(x.ev.title || t.label)}</b><span>${esc(t.label)}${prov ? ` · ${esc(prov.name)}` : ''} · ${esc(L.longDate(x.ev.start))}</span></div>${x.state === 'changed' ? '<span class="tag info">Changed</span>' : ''}</div>
              <div class="rc-fields">${Object.entries(x.det.fields).map(([k, v]) => { const f = t.fields.find((ff) => ff.k === k); const shown = f && f.type === 'date' ? A.Art.fmtDate(v) : f && f.type === 'time' ? A.Art.fmtTime(v) : v; return `<span><i>${esc(f ? f.label : k)}</i>${esc(shown)}</span>`; }).join('')}</div>
              ${x.state === 'changed' ? `<div class="rc-changes">${x.changes.map((c) => `${esc(c.k)}: <s>${esc(c.from || '—')}</s> → <b>${esc(c.to)}</b>`).join('<br>')}</div>` : ''}
              ${x.det.missing.length ? `<div class="rc-missing">${icon('info')}Missing: ${x.det.missing.map((k) => esc((t.fields.find((f) => f.k === k) || { label: k }).label)).join(', ')}. You can add them before saving</div>` : ''}
              <div class="rc-actions"><button class="text-btn" data-act="rv-ignore" data-i="${i}">Ignore</button>
                ${x.state === 'changed' ? `<button class="btn tonal" data-act="rv-update" data-i="${i}">Update pass</button>` : `<button class="btn filled" data-act="rv-add" data-i="${i}">Review &amp; add</button>`}</div>
            </div>`; }).join('') : `<div class="empty"><h3>All done</h3><span>No more bookings to review.</span></div>`}
        </div>`;
    }
  };

  async function syncCalendar() {
    const cal = A.W.settings.calendar;
    if (!cal.connected || !cal.enabled) { A.snackbar('Turn on finding bookings first'); return; }
    A.snackbar('Syncing…');
    const r = await api.calendar.events();
    if (!r.ok) {
      A.commit((W) => { W.settings.calendar.lastError = r.message || 'Sync failed'; if (r.reason === 'expired' || r.reason === 'disconnected') W.settings.calendar.connected = false; });
      A.dialog({ title: 'Couldn’t sync', body: `<p>${esc(r.message || 'Something went wrong.')}</p>`, actions: [{ label: 'OK' }] });
      return;
    }
    const ids = new Set(r.events.map((e) => e.id));
    // Passes whose event disappeared from the synced window.
    const now = Date.now() - 86400000;
    const gone = A.W.passes.filter((p) => p.source === 'calendar' && p.sourceRef.startsWith('gcal:') && !ids.has(p.sourceRef) && (A.passWhen(p) || 0) >= now);
    A.commit((W) => {
      W.settings.calendar.lastSync = new Date().toISOString();
      W.settings.calendar.lastError = '';
      if (W.settings.calendar.onRemoved === 'delete') W.passes = W.passes.filter((p) => !gone.includes(p));
      else gone.forEach((p) => { p.sourceStatus = 'removed'; });
    });
    const res = A.proposeFromEvents(r.events, 'Google Calendar');
    if (cal.autoImport) {
      const sure = res.proposals.filter((x) => x.state === 'new' && !x.det.missing.length && x.det.confidence >= 8);
      if (sure.length) {
        A.commit((W) => sure.forEach((x) => { W.passes.push(proposalToPass(x)); x.done = true; }));
        A.snackbar(`${sure.length} booking${sure.length === 1 ? '' : 's'} added automatically`);
      }
    }
    if (res.proposals.some((x) => !x.done)) A.push('review', res);
    else if (!cal.autoImport) A.snackbar(gone.length ? `${gone.length} pass${gone.length === 1 ? '' : 'es'} marked: event deleted` : 'No new bookings found');
  }
  function proposalToPass(x) {
    const now = new Date().toISOString();
    return { id: A.uid('pass'), template: x.det.template, providerId: x.det.provider, fields: x.det.fields, barcode: { value: '', format: 'none', source: 'entered' },
      source: 'calendar', sourceRef: x.ref, createdAt: now, updatedAt: now, history: [] };
  }

  async function importIcs() {
    const r = await api.calendar.importIcs();
    if (!r.ok) { if (r.reason === 'disabled') A.snackbar('Importing is turned off in screenshot mode'); else if (r.message) A.snackbar(r.message); return; }
    const events = A.E.parseIcs(r.text).map((e) => Object.assign(e, { id: `ics:${e.id}` }));
    if (!events.length) { A.dialog({ title: 'No events found', body: '<p>That file has no calendar events Open Wallet can read.</p>', actions: [{ label: 'OK' }] }); return; }
    const res = A.proposeFromEvents(events, r.name);
    if (!res.proposals.length) { A.snackbar(`${events.length} events checked. None looked like bookings`); return; }
    A.push('review', res);
  }

  // ---------------- Actions ----------------
  Object.assign(A.ACTIONS, {
    add: () => { A.closeLayers(true); A.push('add', {}); },
    'add-help': () => addHelp(),
    'add-cat': (b) => openCategory(b.dataset.cat),
    'pick-template': (b) => { const k = b.dataset.template; const cat = A.TPL[k].providerCat; if (cat && C.providers(cat).length) A.push('providers', { cat, template: k }); else A.push('form', { template: k }); },
    'pick-prov': (b) => {
      const p = C.provider(b.dataset.id);
      const e = A.top();
      const tpl = e.name === 'providers' && e.params.template ? e.params.template : CAT_TEMPLATE[p.cat];
      A.push('form', { template: tpl, providerId: p.id });
    },
    'prov-filter': (b) => { const e = A.top(); e.params.filter = b.dataset.region; A.PAGES.providers.refresh(e); },
    'region-info': () => A.dialog({ title: 'How suggestions are chosen', body: `<p>Suggestions come from the region you picked (${esc(A.regionLabel())}), not from your location. Change it any time.</p>`, actions: [{ label: 'Change region', run: () => A.pickRegion(() => A.refreshAll()) }, { label: 'OK' }] }),
    'pick-region': () => A.pickRegion(() => A.refreshAll()),
    'add-form': (b) => { A.closeLayers(true); A.push('form', { template: b.dataset.template || 'generic' }); },
    'pick-issuer': () => pickIssuer(),
    'pick-provider': () => pickProvider(),
    'pick-color': (b) => { const e = A.top(); e.params.values.color = b.dataset.color || null; e.el.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('sel', s === b)); A.refreshFormPreview(e); },
    'form-toggle': (b) => { const e = A.top(); const k = b.dataset.key; e.params.values[k] = !e.params.values[k]; b.querySelector('.switch').classList.toggle('on', e.params.values[k]); A.refreshFormPreview(e); },
    'add-extra': () => { const e = A.top(); e.params.values.extra.push({ label: '', value: '' }); A.renderEntry(e); const ins = e.el.querySelectorAll('[data-part="label"]'); if (ins.length) ins[ins.length - 1].focus(); },
    'remove-extra': (b) => { const e = A.top(); e.params.values.extra.splice(Number(b.dataset.i), 1); A.renderEntry(e); },
    'import-original': () => importOriginal(),
    camera: () => openCamera(),
    'import-ics': () => importIcs(),
    'open-url': async (b) => { const ok = await api.openExternal(b.dataset.url); if (!ok) A.snackbar('Can’t open links in screenshot mode'); },
    'cal-connect': (b) => {
      const page = b.closest('.page');
      const clientId = page.querySelector('#cal-client').value.trim();
      const clientSecret = page.querySelector('#cal-secret').value.trim();
      A.dialog({ title: 'Connect Google Calendar?', iconName: 'calendar',
        body: '<p>Your browser opens Google’s sign-in page. Open Wallet asks only for <b>read-only</b> access to calendar events. It can’t create, change or delete them.</p><p>You can disconnect at any time. Passes you saved stay.</p>',
        actions: [{ label: 'Cancel' }, { label: 'Continue', run: async () => {
          A.commit((W) => { W.settings.calendar.clientId = clientId; });
          A.snackbar('Finish signing in in your browser…');
          const r = await api.calendar.connect({ clientId, clientSecret });
          if (r.ok) { A.commit((W) => Object.assign(W.settings.calendar, { connected: true, enabled: true, lastError: '' })); A.snackbar('Google Calendar connected'); }
          else if (r.reason === 'disabled') A.snackbar('Connecting is turned off in screenshot mode');
          else A.dialog({ title: 'Not connected', body: `<p>${esc(r.message || 'Something went wrong.')}</p>`, actions: [{ label: 'OK' }] });
        } }] });
    },
    'cal-toggle': (b) => { const k = b.dataset.key; A.commit((W) => { W.settings.calendar[k] = !W.settings.calendar[k]; }); if (k === 'enabled' && !A.W.settings.calendar.enabled) A.snackbar('Calendar reading is off. Saved passes stay'); },
    'cal-sync': () => syncCalendar(),
    'cal-removed': () => {
      const cur = A.W.settings.calendar.onRemoved;
      const l = A.dialog({ title: 'If an event is deleted', body: [['mark', 'Keep the pass and mark it'], ['delete', 'Delete its pass too']].map(([k, label]) => `<button class="radio-row" data-opt="${k}"><span class="radio ${cur === k ? 'on' : ''}"></span>${label}</button>`).join(''), actions: [{ label: 'Close' }] });
      l.el.querySelectorAll('[data-opt]').forEach((x) => x.addEventListener('click', () => { l.close(); A.commit((W) => { W.settings.calendar.onRemoved = x.dataset.opt; }); }));
    },
    'cal-disconnect': () => A.confirmDialog('Disconnect Google Calendar?', 'Open Wallet asks Google to revoke its access and deletes the sign-in token from this computer. Passes you already saved stay.', 'Disconnect', async () => {
      const r = await api.calendar.disconnect();
      A.commit((W) => Object.assign(W.settings.calendar, { connected: false, enabled: false, autoImport: false }));
      A.snackbar(r.revoked ? 'Disconnected and access revoked' : 'Disconnected. Token deleted (Google couldn’t be reached to revoke it)');
    }, true),
    'cal-delete-imported': () => A.confirmDialog('Delete calendar passes?', 'Passes imported from your calendar are removed from Open Wallet. Your calendar events aren’t touched.', 'Delete', () => {
      A.commit((W) => { W.passes = W.passes.filter((p) => p.source !== 'calendar'); });
      A.snackbar('Calendar passes deleted');
    }, true),
    'rv-ignore': (b) => { const e = A.top(); const x = e.params.proposals[Number(b.dataset.i)]; x.done = true; A.commit((W) => { W.settings.calendarIgnored.push(x.ref); }); A.renderEntry(e); },
    'rv-add': (b) => {
      const e = A.top();
      const x = e.params.proposals[Number(b.dataset.i)];
      A.push('form', { template: x.det.template, prefill: { source: 'calendar', sourceRef: x.ref, providerId: x.det.provider, fields: Object.assign({}, x.det.fields),
        note: `Found in “${x.ev.title}”. Only details from the event are filled in. Check them and add anything missing.` }, onSaved: () => { x.done = true; } });
    },
    'rv-update': (b) => {
      const e = A.top();
      const x = e.params.proposals[Number(b.dataset.i)];
      const p = A.findPass(x.existingId);
      const apply = () => { A.commit(() => { Object.assign(p.fields, x.det.fields); p.sourceStatus = ''; p.updatedAt = new Date().toISOString(); }); x.done = true; A.renderEntry(e); A.snackbar('Pass updated'); };
      if (p && p.edited) A.confirmDialog('You edited this pass', 'Updating replaces the changed details with the ones from the calendar.', 'Update anyway', apply);
      else if (p) apply();
    }
  });
  A.importIcs = importIcs;
})();
