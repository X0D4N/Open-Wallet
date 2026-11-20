// Open Wallet — Identity & documents: PIN lock, document list, document type
// chooser, add/edit form and document detail. Records and files are
// decrypted only in memory while the vault is unlocked.
(function () {
  'use strict';

  const A = window.App;
  const L = window.WalletLib;
  const I = window.Icons;
  const api = window.walletApi;
  const esc = L.escapeHtml;
  const icon = I.icon;
  const C = A.C;
  const V = A.vault;

  const groupIcon = (g) => (g === 'health' ? 'health' : g === 'vehicle' ? 'car' : 'id');
  const touch = () => { if (V.unlocked) api.vault.touch(A.W.settings.vaultTimeout); };

  // ---------------- State ----------------
  A.vaultSync = async function () {
    V.status = await api.vault.status();
    const was = V.unlocked;
    V.unlocked = V.status.exists && !V.status.locked;
    if (V.unlocked) { const r = await api.vault.docs(); V.docs = r.ok ? r.docs : []; } else V.docs = [];
    A.ui.docCount = V.unlocked ? V.docs.length : A.ui.docCount;
    api.protect(V.unlocked);
    return was !== V.unlocked;
  };
  function onLocked(message) {
    V.unlocked = false; V.docs = []; V.reveal = {};
    api.protect(false);
    // Close every page that shows document contents.
    const idx = A.stack.findIndex((e) => ['vault', 'doc', 'doc-form'].includes(e.name));
    if (idx > 0) { while (A.stack.length - 1 > idx) { const e = A.stack.pop(); e.el.remove(); } A.renderEntry(A.top()); A.top().el.classList.remove('hidden'); }
    A.closeLayers(true);
    if (message) A.snackbar(message);
  }
  A.lockVault = async function (message) { await api.vault.lock(); onLocked(message || 'Vault locked'); };
  api.onVaultLocked(() => onLocked('Vault locked after inactivity'));
  api.onBlur(() => { if (V.unlocked && A.W && A.W.settings.lockOnBlur && !V.busy) A.lockVault('Vault locked when you switched apps'); });
  async function busy(fn) { V.busy = true; try { return await fn(); } finally { setTimeout(() => { V.busy = false; }, 400); } }
  const saveDocs = async () => { const r = await api.vault.save(V.docs); A.ui.docCount = V.docs.length; if (!r.ok) { if (r.reason === 'locked') onLocked('Vault locked'); else A.snackbar('Couldn’t save the vault'); } return r.ok; };
  const findDoc = (id) => V.docs.find((d) => d.id === id);

  // ---------------- Vault page ----------------
  A.PAGES.vault = {
    render(params) {
      const st = V.status;
      if (!st) return `${A.topbar({ title: 'IDs & documents' })}<div class="page-scroll"><div class="empty"><div class="progress" role="progressbar" aria-label="Opening"></div></div></div>`;
      if (!st.exists) return setupHtml(params);
      if (!V.unlocked) return lockHtml(params);
      const g = params.group || 'all';
      const q = C.norm(params.q || '');
      const s = A.W.settings;
      const docs = V.docs.filter((d) => { const t = C.docType(d.typeId) || {}; return (g === 'all' || t.group === g) && (!q || C.norm(`${d.label || ''} ${t.name} ${d.holder || ''} ${t.authority} ${C.regionName(d.region)}`).includes(q)); })
        .sort((a, b) => (Number(!!b.favorite) - Number(!!a.favorite)) ||String(b.createdAt).localeCompare(String(a.createdAt)));
      const soon = s.expiryReminders ? V.docs.filter((d) => d.expiry && (new Date(`${d.expiry}T00:00`) - Date.now()) < 60 * 86400000) : [];
      return `${A.topbar({ title: 'IDs & documents', actions: `<button class="icon-btn" data-act="vault-lock" aria-label="Lock now" title="Lock now">${icon('lock')}</button><button class="icon-btn" data-act="vault-menu" aria-label="More options" title="More options">${icon('more')}</button>` })}
        <div class="page-scroll">
          <div class="add-tools"><div class="search-pill inline">${icon('search')}<input data-vault-search type="search" placeholder="Search documents" value="${esc(params.q || '')}" aria-label="Search documents"></div></div>
          <div class="chips">${[['all', 'All'], ['identity', 'IDs'], ['health', 'Health'], ['vehicle', 'Vehicle']].map(([k, l]) => `<button class="chip-f ${g === k ? 'sel' : ''}" data-act="vault-group" data-group="${k}">${l}</button>`).join('')}</div>
          ${soon.length ? `<div class="notice warn">${icon('bell')}<span>${soon.map((d) => `${esc(d.label || C.docType(d.typeId).name)}: ${new Date(`${d.expiry}T00:00`) < Date.now() ? 'expired' : 'expires'} ${esc(A.Art.fmtDate(d.expiry, { day: 'numeric', month: 'short', year: 'numeric' }))}`).join('<br>')}</span></div>` : ''}
          ${docs.length ? `<div class="doc-list">${docs.map((d) => `<button class="doc-item" data-act="open-doc" data-id="${esc(d.id)}">${A.Art.docCard(d)}${d.favorite ? `<span class="doc-fav">${icon('star')}</span>` : ''}</button>`).join('')}</div>`
            : `<div class="empty"><span class="hero-icon">${icon('id')}</span><h3>${V.docs.length ? 'No documents match' : 'No documents yet'}</h3><span>Keep copies of IDs, licences, health and vehicle documents. They’re encrypted and locked with your PIN.</span></div>`}
          <div class="notice">${icon('shield')}<span>Personal copies for your own reference. Open Wallet doesn’t verify documents, and a stored copy isn’t an official digital ID. Numbers are hidden until you show them. While the vault is open, screenshots of this window are blocked where the system allows.</span></div>
        </div>
        <button class="fab" data-act="go-ids" data-group="identity" aria-label="Add document">${icon('add')}<span class="fab-label">Add document</span></button>`;
    },
    mount(el, params) {
      if (!V.status) { A.vaultSync().then(() => A.renderEntry(A.top().name === 'vault' ? A.top() : A.stack.find((e) => e.name === 'vault'))); return; }
      const pin = el.querySelector('[data-pin]');
      if (pin) { setTimeout(() => pin.focus(), A.motionMs(300)); pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.querySelector('[data-act="vault-unlock"],[data-act="vault-create"]').click(); }); }
      const vs = el.querySelector('[data-vault-search]');
      if (vs) vs.addEventListener('input', () => { params.q = vs.value; A.renderEntry(A.stack.find((e) => e.el === el)); const n = el.querySelector('[data-vault-search]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
      el.addEventListener('click', touch);
    }
  };
  function setupHtml() {
    return `${A.topbar({ title: 'IDs & documents' })}<div class="page-scroll"><div class="lock-screen">
        <span class="hero-icon">${icon('shield')}</span><h1 class="display sm">Set up your document vault</h1>
        <p>Your documents are encrypted on this computer and opened only with a PIN you choose${V.status && V.status.osProtected === false ? '' : ', together with your system’s credential store'}.</p>
        <ul class="facts"><li>Nothing is uploaded or shared unless you export it.</li><li>Numbers are hidden in lists and need your PIN to show.</li><li><b>If you forget the PIN, the documents can’t be recovered.</b></li></ul>
        <div class="field"><input data-pin id="pin1" type="password" inputmode="numeric" maxlength="12" placeholder=" " autocomplete="off"><label for="pin1">New PIN (4 to 12 digits)</label></div>
        <div class="field"><input id="pin2" type="password" inputmode="numeric" maxlength="12" placeholder=" " autocomplete="off"><label for="pin2">Repeat the PIN</label><div class="help" data-pin-err></div></div>
        <button class="btn filled block" data-act="vault-create">${icon('lock')}Create vault</button></div></div>`;
  }
  function lockHtml() {
    const blocked = V.status && V.status.blockedFor;
    return `${A.topbar({ title: 'IDs & documents' })}<div class="page-scroll"><div class="lock-screen">
        <span class="hero-icon">${icon('lock')}</span><h1 class="display sm">Vault locked</h1><p>Enter your PIN to see your documents.</p>
        <div class="field"><input data-pin id="pin" type="password" inputmode="numeric" maxlength="12" placeholder=" " autocomplete="off" aria-label="PIN"><label for="pin">PIN</label><div class="help" data-pin-err>${blocked ? `Too many tries. Wait ${blocked} seconds` : ''}</div></div>
        <button class="btn filled block" data-act="vault-unlock">Unlock</button>
        <button class="text-btn" data-act="vault-forgot">Forgot your PIN?</button></div></div>`;
  }

  // ---------------- Document type chooser ("Choose what to add") ----------------
  A.PAGES.ids = {
    render(params) {
      const g = params.group || 'identity';
      const region = A.region() || 'XX';
      const list = C.docsFor(region, g);
      return `${A.topbar({ title: '', cls: 'plain' })}<div class="page-scroll">
          <span class="hero-icon id">${icon(groupIcon(g))}</span><h1 class="display">Choose what to add</h1>
          <div class="add-tools">${`<button class="chip-f region-chip" data-act="pick-region">${icon('globe')}${esc(A.regionLabel())}${icon('expand')}</button>`}</div>
          <div class="chips">${[['identity', 'IDs & personal info'], ['health', 'Health'], ['vehicle', 'Vehicle']].map(([k, l]) => `<button class="chip-f ${g === k ? 'sel' : ''}" data-act="ids-group" data-group="${k}">${l}</button>`).join('')}</div>
          <div class="group">${list.map((t) => `<button class="group-item" data-act="pick-doc" data-type="${t.id}"><span class="gi-icon">${icon(groupIcon(t.group))}</span>
            <span class="gi-body"><b>${esc(t.name)}</b><span>${esc(t.sub || t.authority || 'Personal copy')}</span></span>${t.official ? `<span class="gi-trail" title="Has an official digital version">${icon('external')}</span>` : ''}</button>`).join('')}</div>
          <p class="lead-text small">${icon('info')} Shown for ${esc(A.region() ? C.regionName(A.region()) : 'all regions')}, plus types that exist everywhere. These are personal copies. Where an official digital version exists, you can open its website.</p>
        </div>`;
    }
  };
  A.openDocType = function (typeId) {
    const t = C.docType(typeId);
    if (!t) return;
    const go = () => openDocForm({ typeId });
    if (!t.official) { go(); return; }
    const l = A.sheet(t.name, `<div class="list">
        <button class="list-item" data-o="copy"><span class="lead">${icon('lock')}</span><span class="body"><span class="l1" style="display:block">Keep a personal copy here</span><span class="l2">Import your PDF or photo and the details. Encrypted, not verified</span></span></button>
        <button class="list-item" data-o="official"><span class="lead">${icon('external')}</span><span class="body"><span class="l1" style="display:block">${esc(t.official.label)}</span><span class="l2">Opens the official website in your browser. Open Wallet doesn’t sign in for you</span></span></button></div>`);
    l.el.querySelector('[data-o="copy"]').addEventListener('click', () => { l.close(); go(); });
    l.el.querySelector('[data-o="official"]').addEventListener('click', async () => { l.close(); const ok = await busy(() => api.openExternal(t.official.url)); if (!ok) A.snackbar('Can’t open links in screenshot mode'); });
  };
  function openDocForm(params) {
    if (!V.unlocked) { A.push('vault', { then: params }); return; }
    A.push('doc-form', params);
  }

  // ---------------- Document form ----------------
  A.PAGES['doc-form'] = {
    keep: true,
    render(params) {
      const editing = !!params.id;
      const d = editing ? findDoc(params.id) : null;
      if (editing && !d) return null;
      const t = C.docType(params.typeId || d.typeId);
      if (!params.values) params.values = d ? JSON.parse(JSON.stringify(d)) : { typeId: t.id, region: t.region === 'XX' ? (A.region() || 'XX') : t.region, fields: {}, files: [], label: '', holder: '', number: '', expiry: '', authority: '' };
      const v = params.values;
      const errors = params.errors || {};
      const F = A.formHelpers.input;
      const sides = t.sides === 2 ? [['front', 'Front'], ['back', 'Back']] : [['page', 'Document']];
      const fileRow = ([side, label]) => {
        const f = v.files.find((x) => x.side === side);
        return `<div class="file-row"><span class="lead plain">${icon(f ? (f.mime === 'application/pdf' ? 'generic' : 'photo') : 'upload')}</span><span class="body"><span class="l1">${label}</span><span class="l2">${f ? `${esc(f.name)} · ${Math.ceil(f.size / 1024)} KB` : 'No file yet'}</span></span>
          <button type="button" class="text-btn" data-act="doc-attach" data-side="${side}">${f ? 'Replace' : 'Add photo or PDF'}</button>${f ? `<button type="button" class="icon-btn sm" data-act="doc-detach" data-side="${side}" aria-label="Remove ${label}">${icon('close')}</button>` : ''}</div>`;
      };
      return `<header class="topbar"><button class="icon-btn" data-act="back" aria-label="Close" title="Close">${icon('close')}</button>
          <div class="topbar-title">${editing ? 'Edit' : 'Add'} ${esc(t.name)}</div><button class="text-btn" data-act="doc-save" style="margin-right:8px">Save</button></header>
        <div class="page-scroll"><form class="form" data-doc-form novalidate autocomplete="off">
          <div class="notice warn" style="margin:0">${icon('shield')}<span>A personal copy for your reference. It isn’t an official or verified ID${t.official ? `. For the official digital version, use ${esc(t.official.label.replace(/^(Get|Download|Create or download)\s+/i, ''))}` : ''}.${t.warn ? ` ${esc(t.warn)}` : ''}</span></div>
          ${t.region === 'XX' ? F({ k: 'region', label: 'Issuing country or region', select: C.REGIONS.map((r) => [r.code, r.name]) }, v) : ''}
          ${F({ k: 'holder', label: 'Name on the document' }, v, errors.holder)}
          ${F({ k: 'number', label: t.numberLabel, spell: false, max: 40, hint: 'Hidden in lists. You need your PIN to show it' }, v, errors.number)}
          ${t.expiry ? F({ k: 'expiry', label: 'Valid until (only if it’s on the document)', type: 'date' }, v, errors.expiry) : ''}
          ${F({ k: 'authority', label: `Issued by${t.authority ? ` (e.g. ${t.authority})` : ''}` }, v)}
          ${(t.fields || []).map((k) => F({ k: `f_${k}`, label: C.DOC_FIELD_LABELS[k] || k, type: k === 'dob' || k === 'validTo' ? 'date' : 'text' }, Object.assign({}, { [`f_${k}`]: v.fields[k] || '' }))).join('')}
          ${F({ k: 'label', label: 'Your own label (optional)' }, v)}
          <div class="form-label">Original document</div>
          ${sides.map(fileRow).join('')}
          <p class="lead-text small" style="padding:0">Files are kept exactly as they are (encrypted). Nothing is cropped, edited or read automatically, so type in the details yourself.</p>
          <button type="submit" class="btn filled block">${editing ? 'Save changes' : 'Save to vault'}</button>
        </form></div>`;
    },
    mount(el, params) {
      const form = el.querySelector('[data-doc-form]');
      if (!form) return;
      form.addEventListener('input', (e) => {
        const k = e.target.dataset.field;
        if (!k) return;
        if (k.startsWith('f_')) params.values.fields[k.slice(2)] = e.target.value; else params.values[k] = e.target.value;
        touch();
      });
      form.addEventListener('submit', (e) => { e.preventDefault(); saveDoc(); });
    }
  };

  async function saveDoc(force) {
    const e = A.top();
    if (!e || e.name !== 'doc-form') return;
    const v = e.params.values;
    const t = C.docType(v.typeId);
    const errors = {};
    v.number = String(v.number || '').trim().toUpperCase();
    if (!v.number && !v.files.length && !String(v.holder || '').trim()) errors.number = `Enter the ${t.numberLabel.toLowerCase()}, or add the original file`;
    if (v.expiry && isNaN(new Date(`${v.expiry}T00:00`))) errors.expiry = 'Enter a valid date';
    if (Object.keys(errors).length) { e.params.errors = errors; A.renderEntry(e); return; }
    const warn = A.E.checkDocNumber(t, v.number);
    if (warn && !force) { A.confirmDialog('Check the number', `${esc(warn)}. Open Wallet only checks the format. It doesn’t verify documents.`, 'Save anyway', () => saveDoc(true)); return; }
    const now = new Date().toISOString();
    const rec = Object.assign({}, v, { holder: String(v.holder || '').trim(), label: String(v.label || '').trim(), status: 'personal-copy', updatedAt: now });
    // Files replaced or removed in this edit are wiped once the change is saved.
    const keep = new Set(rec.files.map((f) => f.fileId));
    const before = e.params.id ? (findDoc(e.params.id).files || []).map((f) => f.fileId) : [];
    const drop = [...new Set(before.concat(e.params.removed || []))].filter((fid) => !keep.has(fid));
    if (e.params.id) { const i = V.docs.findIndex((d) => d.id === e.params.id); V.docs[i] = rec; }
    else { rec.id = A.uid('doc'); rec.createdAt = now; rec.favorite = false; V.docs.push(rec); }
    if (!(await saveDocs())) return;
    for (const fid of drop) await api.vault.deleteFile(fid);
    if (e.params.id) A.pop(); else { A.popTo('vault'); A.push('doc', { id: rec.id }); }
    A.refreshAll();
    A.snackbar(e.params.id ? 'Document updated' : 'Saved to your vault');
  }

  // ---------------- Document detail ----------------
  A.PAGES.doc = {
    render({ id }) {
      if (!V.unlocked) return null;
      const d = findDoc(id);
      if (!d) return null;
      const t = C.docType(d.typeId) || C.docType('XX.other');
      const shown = !!(V.reveal && V.reveal[id]);
      const kv = (k, val) => (val ? `<div><div class="k">${esc(k)}</div><div class="v">${esc(val)}</div></div>` : '');
      const fields = Object.entries(d.fields || {}).filter(([, x]) => x).map(([k, x]) => kv(C.DOC_FIELD_LABELS[k] || k, shown ? (/^\d{4}-\d{2}-\d{2}$/.test(x) ? A.Art.fmtDate(x, { day: 'numeric', month: 'short', year: 'numeric' }) : x) : '••••')).join('');
      return `${A.topbar({ title: d.label || t.name, actions: `<button class="icon-btn" data-act="doc-fav" data-id="${esc(id)}" aria-label="Favourite" title="Favourite">${icon(d.favorite ? 'star' : 'starOutline')}</button><button class="icon-btn" data-act="doc-menu" data-id="${esc(id)}" aria-label="More options" title="More options">${icon('more')}</button>` })}
        <div class="page-scroll">
          <div class="detail-card">${A.Art.docCard(d, { reveal: shown })}</div>
          <div class="detail-actions wrap"><button class="btn tonal" data-act="doc-reveal" data-id="${esc(id)}">${icon(shown ? 'eyeOff' : 'eye')}${shown ? 'Hide details' : 'Show details'}</button>
            <button class="btn outlined" data-act="doc-edit" data-id="${esc(id)}">${icon('edit')}Edit</button></div>
          <div class="kv" style="padding:8px 24px">${kv('Type', t.name)}${kv('Country or region', C.regionName(d.region || t.region))}${kv('Name', d.holder)}${kv(t.numberLabel, d.number ? (shown ? d.number : A.E.mask(d.number, t.mask)) : '')}
            ${kv('Valid until', d.expiry ? A.Art.fmtDate(d.expiry, { day: 'numeric', month: 'short', year: 'numeric' }) : '')}${kv('Issued by', d.authority || t.authority)}${fields}</div>
          <div class="subhead">Original document</div>
          ${(d.files || []).length ? `<div class="doc-files" data-files>${d.files.map((f) => `<button class="doc-file" data-act="doc-open-file" data-id="${esc(id)}" data-file="${esc(f.fileId)}"><span class="df-thumb" data-thumb="${esc(f.fileId)}" data-mime="${esc(f.mime)}">${icon(f.mime === 'application/pdf' ? 'generic' : 'photo')}</span><span class="df-label">${esc({ front: 'Front', back: 'Back', page: 'Document' }[f.side] || 'File')}<small>${f.mime === 'application/pdf' ? 'PDF' : 'Image'} · ${Math.ceil(f.size / 1024)} KB</small></span></button>`).join('')}</div>`
            : `<div class="empty small"><span>No file yet. Add the PDF or photos so you always have the original.</span><button class="btn tonal" data-act="doc-edit" data-id="${esc(id)}">${icon('upload')}Add file</button></div>`}
          <div class="notice">${icon(d.files && d.files.length ? 'upload' : 'edit')}<span><b>${d.files && d.files.length ? 'Imported copy' : 'Manual record'}.</b> Not verified. Open Wallet can’t check that a document is genuine or still valid.${t.official ? ` For the official digital version: ` : ''}${t.official ? `<button class="text-btn inline" data-act="open-official" data-type="${esc(t.id)}">${esc(t.official.label)}</button>` : ''}</span></div>
        </div>`;
    },
    mount(el, { id }) {
      el.addEventListener('click', touch);
      const d = findDoc(id);
      if (!d) return;
      el.querySelectorAll('[data-thumb]').forEach(async (th) => {
        if (th.dataset.mime === 'application/pdf') return;
        const r = await api.vault.fileUrl(th.dataset.thumb, th.dataset.mime);
        if (r.ok && r.url) th.innerHTML = `<img alt="" src="${r.url}">`;
      });
    }
  };

  function askPin(title, then) {
    A.dialog({ title, body: '<p>Enter your vault PIN.</p><div class="field" style="margin-top:12px"><input id="vp" type="password" inputmode="numeric" maxlength="12" placeholder=" " autocomplete="off"><label for="vp">PIN</label><div class="help"></div></div>',
      actions: [{ label: 'Cancel' }, { label: 'OK', keepOpen: true, run: async (el) => {
        const ok = await api.vault.verify(el.querySelector('#vp').value);
        if (!ok) { el.querySelector('.field').classList.add('invalid'); el.querySelector('.help').textContent = 'Wrong PIN'; return; }
        A.closeTopLayer();
        then();
      } }] });
  }

  async function viewFile(docId, fileId) {
    const d = findDoc(docId);
    const f = d && d.files.find((x) => x.fileId === fileId);
    if (!f) return;
    if (f.mime === 'application/pdf') {
      A.confirmDialog('Open the PDF?', 'A temporary unencrypted copy opens in your PDF app. It’s deleted when the vault locks or Open Wallet closes.', 'Open', async () => {
        const r = await busy(() => api.vault.openFile(fileId, f.name));
        if (!r.ok) A.snackbar('Couldn’t open the file');
      });
      return;
    }
    const r = await api.vault.fileUrl(fileId, f.mime);
    if (!r.ok) return;
    const el = document.createElement('div');
    el.className = 'viewer image';
    el.innerHTML = `<button class="icon-btn close" aria-label="Close" title="Close">${icon('close')}</button><img alt="${esc(f.name)}" src="${r.url}"><div class="hint">${esc(f.name)} · original, unchanged</div>`;
    const l = A.openLayer(el, { scrim: false, outMs: 10 });
    el.addEventListener('click', () => l.close());
  }

  // ---------------- Actions ----------------
  Object.assign(A.ACTIONS, {
    'go-ids': (b) => A.push('ids', { group: b.dataset.group || 'identity' }),
    'ids-group': (b) => { const e = A.top(); e.params.group = b.dataset.group; A.renderEntry(e); },
    'pick-doc': (b) => A.openDocType(b.dataset.type),
    'vault-group': (b) => { const e = A.top(); e.params.group = b.dataset.group; A.renderEntry(e); },
    'vault-create': async (b) => {
      const page = b.closest('.page');
      const p1 = page.querySelector('#pin1').value, p2 = page.querySelector('#pin2').value;
      const err = page.querySelector('[data-pin-err]');
      if (!/^\d{4,12}$/.test(p1)) { err.textContent = 'Use 4 to 12 digits'; err.closest('.field').classList.add('invalid'); return; }
      if (p1 !== p2) { err.textContent = 'The PINs don’t match'; err.closest('.field').classList.add('invalid'); return; }
      const r = await api.vault.create(p1);
      if (!r.ok) { A.snackbar('Couldn’t create the vault'); return; }
      await api.vault.unlock(p1, A.W.settings.vaultTimeout);
      await A.vaultSync();
      afterUnlock();
    },
    'vault-unlock': async (b) => {
      const page = b.closest('.page');
      const input = page.querySelector('#pin');
      const err = page.querySelector('[data-pin-err]');
      const r = await api.vault.unlock(input.value, A.W.settings.vaultTimeout);
      if (!r.ok) {
        input.value = '';
        err.textContent = r.reason === 'blocked' ? `Too many tries. Wait ${r.blockedFor} seconds` : r.reason === 'os' ? 'This vault was made on another computer or user account' : `Wrong PIN${r.attempts >= 3 ? ` (${r.attempts} tries)` : ''}`;
        err.closest('.field').classList.add('invalid');
        input.focus();
        return;
      }
      await A.vaultSync();
      afterUnlock();
    },
    'vault-forgot': () => A.confirmDialog('Forgot your PIN?', 'The PIN can’t be recovered. The only option is to reset the vault, which permanently deletes every saved document and file. Cards and passes aren’t affected.', 'Reset vault', async () => {
      await api.vault.reset(); V.status = null; await A.vaultSync(); A.renderEntry(A.top()); A.snackbar('Vault reset');
    }, true),
    'vault-lock': () => A.lockVault(),
    'vault-menu': (b) => A.menu(b, [
      { label: 'Change PIN', icon: 'lock', run: () => A.dialog({ title: 'Change PIN', body: '<div class="field" style="margin-top:12px"><input id="op" type="password" inputmode="numeric" maxlength="12" placeholder=" "><label for="op">Current PIN</label></div><div class="field"><input id="np" type="password" inputmode="numeric" maxlength="12" placeholder=" "><label for="np">New PIN (4 to 12 digits)</label><div class="help"></div></div>',
        actions: [{ label: 'Cancel' }, { label: 'Change', keepOpen: true, run: async (el) => { const r = await api.vault.changePin(el.querySelector('#op').value, el.querySelector('#np').value); if (!r.ok) { el.querySelectorAll('.field')[1].classList.add('invalid'); el.querySelector('.help').textContent = r.reason === 'pin' ? 'Use 4 to 12 digits' : 'Current PIN is wrong'; return; } A.closeTopLayer(); A.snackbar('PIN changed'); } }] }) },
      { label: 'Lock now', icon: 'lock', run: () => A.lockVault() },
      { label: 'Reset vault', icon: 'delete', danger: true, run: () => A.confirmDialog('Reset the vault?', 'Every document and file in the vault is permanently deleted.', 'Reset', async () => { await api.vault.reset(); V.status = null; onLocked(); await A.vaultSync(); A.renderEntry(A.top()); A.snackbar('Vault reset'); }, true) }
    ]),
    'open-doc': (b) => A.push('doc', { id: b.dataset.id }),
    'doc-edit': (b) => A.push('doc-form', { id: b.dataset.id }),
    'doc-fav': async (b) => { const d = findDoc(b.dataset.id); d.favorite = !d.favorite; await saveDocs(); A.refreshAll(); },
    'doc-reveal': (b) => {
      const id = b.dataset.id;
      V.reveal = V.reveal || {};
      if (V.reveal[id]) { delete V.reveal[id]; A.refreshAll(); return; }
      askPin('Show details?', () => { V.reveal[id] = true; A.refreshAll(); setTimeout(() => { if (V.reveal && V.reveal[id]) { delete V.reveal[id]; A.refreshAll(); } }, 60000); });
    },
    'doc-open-file': (b) => viewFile(b.dataset.id, b.dataset.file),
    'open-official': async (b) => { const t = C.docType(b.dataset.type); const ok = await busy(() => api.openExternal(t.official.url)); if (!ok) A.snackbar('Can’t open links in screenshot mode'); },
    'doc-menu': (b) => {
      const d = findDoc(b.dataset.id);
      const items = [{ label: 'Edit', icon: 'edit', run: () => A.push('doc-form', { id: d.id }) }];
      (d.files || []).forEach((f) => items.push({ label: `Export ${{ front: 'front', back: 'back', page: 'file' }[f.side] || 'file'}`, icon: 'download', run: () => A.confirmDialog('Save an unencrypted copy?', 'The copy you save isn’t protected by Open Wallet. Keep it somewhere safe, and delete it when you’re done.', 'Choose where', async () => {
        const r = await busy(() => api.vault.exportFile(f.fileId, f.name));
        if (r.ok) A.snackbar(`Saved ${r.file}`); else if (r.reason === 'disabled') A.snackbar('Export is turned off in screenshot mode');
      }) }));
      items.push({ label: 'Delete', icon: 'delete', danger: true, run: () => A.confirmDialog('Delete this document?', 'The record and its files are deleted from this computer. This can’t be undone.', 'Delete', async () => {
        for (const f of d.files || []) await api.vault.deleteFile(f.fileId);
        V.docs = V.docs.filter((x) => x !== d);
        await saveDocs();
        A.popTo('vault');
        A.snackbar('Document deleted');
      }, true) });
      A.menu(b, items);
    },
    'doc-attach': async (b) => {
      const e = A.top();
      const r = await busy(() => api.vault.addFile());
      if (!r.ok) { if (r.message) A.dialog({ title: 'Couldn’t add that file', body: `<p>${esc(r.message)}</p>`, actions: [{ label: 'OK' }] }); else if (r.reason === 'disabled') A.snackbar('Importing is turned off in screenshot mode'); return; }
      const side = b.dataset.side;
      const old = e.params.values.files.find((x) => x.side === side);
      if (old) { e.params.removed = (e.params.removed || []).concat(old.fileId); }
      e.params.values.files = e.params.values.files.filter((x) => x.side !== side).concat([Object.assign({ side }, r.file)]);
      A.renderEntry(e);
      A.snackbar(old ? 'File replaced. Save to keep the change' : 'File added');
    },
    'doc-detach': (b) => { const e = A.top(); const f = e.params.values.files.find((x) => x.side === b.dataset.side); if (f) e.params.removed = (e.params.removed || []).concat(f.fileId); e.params.values.files =e.params.values.files.filter((x) => x.side !== b.dataset.side); A.renderEntry(e); },
    'doc-save': () => saveDoc()
  });

  function afterUnlock() {
    const e = A.stack.find((x) => x.name === 'vault');
    if (e) A.renderEntry(e);
    if (e && e.params.then) { const then = e.params.then; delete e.params.then; A.push('doc-form', then); }
  }
})();
