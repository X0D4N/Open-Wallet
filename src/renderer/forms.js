// Open Wallet — add/edit forms. Pass forms are generated from the catalogue
// templates; the payment-card form never asks for a full card number.
(function () {
  'use strict';

  const A = window.App;
  const L = window.WalletLib;
  const I = window.Icons;
  const esc = L.escapeHtml;
  const icon = I.icon;

  const pad2 = (n) => String(n).padStart(2, '0');
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

  // ---------------- Field rendering ----------------
  function input(f, v, err) {
    const val = v[f.k] == null ? '' : String(v[f.k]);
    const id = `f_${f.k}`;
    let el;
    if (f.select) el = `<select id="${id}" data-field="${f.k}">${f.select.map(([o, label]) => `<option value="${esc(o)}" ${o === val ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
    else if (f.textarea) el = `<textarea id="${id}" data-field="${f.k}" placeholder=" " maxlength="${f.max || 1000}">${esc(val)}</textarea>`;
    else {
      const type = f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text';
      const mode = f.type === 'money' ? 'decimal' : f.inputmode;
      el = `<input id="${id}" data-field="${f.k}" type="${f.secret && !A.ui.showSecret ? 'password' : type}" placeholder=" " value="${esc(val)}" autocomplete="off" ${mode ? `inputmode="${mode}"` : ''} maxlength="${f.max || 120}" ${f.spell === false ? 'spellcheck="false"' : ''}>`;
    }
    const help = err || f.hint || '';
    return `<div class="field ${err ? 'invalid' : ''}">${el}<label for="${id}">${esc(f.label)}${f.req ? ' *' : ''}</label>${help ? `<div class="help">${esc(help)}</div>` : ''}</div>`;
  }
  // Short fields share a row, long ones get the full width.
  function fieldsHtml(list, v, errors) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i], nx = list[i + 1];
      const short = (x) => x && !x.textarea && (x.type === 'date' || x.type === 'time' || x.type === 'money' || x.max <= 4 || /seat|row|gate|coach|class|screen|section|terminal|platform|zone|tier|points|format|language|fare|space|pin/i.test(x.k));
      if (short(f) && short(nx)) { out.push(`<div class="field-row">${input(f, v, errors[f.k])}${input(nx, v, errors[nx.k])}</div>`); i++; }
      else out.push(input(f, v, errors[f.k]));
    }
    return out.join('');
  }
  const swatches = (sel) => `<div class="form-label">Colour</div><div class="swatches">${A.COLORS.map((c) => `<button type="button" class="swatch ${c ? '' : 'auto'} ${(sel || null) === c ? 'sel' : ''}" ${c ? `style="background:${c}"` : ''} data-act="pick-color" data-color="${c || ''}" aria-label="${c ? `Colour ${c}` : 'Provider colours'}" title="${c ? c : 'Provider colours'}">${c ? '' : 'Auto'}</button>`).join('')}</div>`;

  // ---------------- Payment card ----------------
  const PAY_FIELDS = [
    { k: 'prefix', label: 'First 6 to 8 digits (optional)', inputmode: 'numeric', max: 9, hint: 'Shows the card network. Only these digits are checked, and they aren’t sent anywhere' },
    { k: 'last4', label: 'Last 4 digits', req: true, inputmode: 'numeric', max: 4 },
    { k: 'kind', label: 'Type', select: [['credit', 'Credit'], ['debit', 'Debit'], ['prepaid', 'Prepaid']] },
    { k: 'holder', label: 'Name on card (optional)' },
    { k: 'expiry', label: 'Expiry MM/YY (optional)', max: 7 },
    { k: 'nickname', label: 'Nickname (optional)' }
  ];
  function payValues(c) {
    return c ? { issuerId: c.issuerId, issuerName: c.issuerName, productId: c.productId, productName: c.productName, networkId: c.networkId, kind: c.kind, last4: c.last4, holder: c.holder,
      expiry: c.expMonth ? `${pad2(c.expMonth)}/${String(c.expYear).slice(-2)}` : '', nickname: c.nickname, color: c.color || null, showHolder: c.showHolder, showExpiry: c.showExpiry, contactless: c.contactless }
      : { kind: 'credit', color: null, showHolder: false, showExpiry: false, contactless: false };
  }
  function payPreviewCard(v) {
    const exp = L.parseExpiry(v.expiry);
    const net = v.networkId || (A.E.networkFor(v.prefix) || {}).id || '';
    return { issuerId: v.issuerId, issuerName: v.issuerName, productId: v.productId, productName: v.productName, networkId: net, kind: v.kind,
      last4: (L.digitsOnly(v.last4) || '').padStart(4, '•'), holder: v.holder, showHolder: v.showHolder, expMonth: exp ? exp.month : 0, expYear: exp ? exp.year : 0,
      showExpiry: v.showExpiry && !!exp, contactless: v.contactless, color: v.color };
  }
  function payForm(params, item) {
    const v = params.values;
    const errors = params.errors || {};
    const m = A.E.identifyCard({ prefix: v.prefix, issuerId: v.issuerId, productId: v.productId, networkId: v.networkId, learned: A.W.settings.learnedIins });
    if (!v.issuerId && m.issuer && m.issuerSource === 'learned') v.issuerId = m.issuer.id;
    const iss = v.issuerId ? A.C.issuer(v.issuerId) : null;
    const prods = iss ? iss.products : [];
    const toggle = (k, label, sub) => `<button type="button" class="list-item toggle-row" data-act="form-toggle" data-key="${k}"><span class="body"><span class="l1">${label}</span>${sub ? `<span class="l2" style="display:block">${sub}</span>` : ''}</span>${A.sw(!!v[k])}</button>`;
    return `<div class="notice warn" style="margin:0">${icon('lock')}<span>This is a display copy and can’t pay. Never enter the full card number, the security code (CVV) or your PIN. Open Wallet doesn’t need them.</span></div>
      <button type="button" class="list-item pick-row ${errors.issuer ? 'invalid' : ''}" data-act="pick-issuer"><span class="lead plain">${icon('card')}</span>
        <span class="body"><span class="l2" style="display:block">Bank or card issuer *</span><span class="l1">${esc(iss ? iss.name : v.issuerName || 'Choose your bank')}</span>${errors.issuer ? `<span class="err">${esc(errors.issuer)}</span>` : ''}</span><span class="text-btn">${iss || v.issuerName ? 'Change' : 'Choose'}</span></button>
      ${iss && prods.length ? input({ k: 'productId', label: 'Card product', select: [['', 'Not sure / other']].concat(prods.map((p) => [p.id, p.name])) }, v, errors.productId) : ''}
      ${fieldsHtml(PAY_FIELDS.slice(0, 2), v, errors)}
      ${input({ k: 'networkId', label: 'Card network', select: [['', m.network && !v.networkId ? `Detected: ${m.network.name}` : 'Not sure']].concat(A.C.NETWORKS.map((n) => [n.id, n.name])) }, v, errors.networkId)}
      <div class="match-line" data-match>${icon('palette')}<span>${esc(A.E.MATCH_TEXT[m.level])}${m.productNetworkMismatch ? '. This product isn’t usually on that network, so check it' : ''}</span></div>
      ${fieldsHtml(PAY_FIELDS.slice(2), v, errors)}
      ${toggle('showHolder', 'Show name on the card')}${toggle('showExpiry', 'Show expiry on the card')}
      ${toggle('contactless', 'Card has the contactless symbol', 'Only turn on if it’s printed on your card. It doesn’t enable payments')}
      ${swatches(v.color)}`;
  }

  // ---------------- Passes ----------------
  function passValues(p, params) {
    if (p) return Object.assign({ providerId: p.providerId, providerName: p.providerName, color: p.color || null, code: p.barcode.value, codeFormat: p.barcode.value ? p.barcode.format : 'none',
      currency: p.currency, extra: (p.extraFields || []).map((x) => Object.assign({}, x)) }, p.fields);
    const pre = params.prefill || {};
    return Object.assign({ providerId: params.providerId || pre.providerId || '', providerName: pre.providerName || '', color: null, code: (pre.barcode && pre.barcode.value) || '',
      codeFormat: pre.barcode && pre.barcode.value ? pre.barcode.format || 'qr' : 'none', currency: ({ IN: 'INR', AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', GB: 'GBP', EU: 'EUR', CA: 'CAD', AU: 'AUD', SG: 'SGD' })[A.region()] || 'USD', extra: [] }, pre.fields || {});
  }
  function passFromValues(template, v) {
    const t = A.TPL[template];
    const fields = {};
    for (const f of t.fields) if (String(v[f.k] || '').trim()) fields[f.k] = String(v[f.k]).trim();
    if (v.date && !fields.date) fields.date = v.date;
    return {
      template, providerId: v.providerId || '', providerName: v.providerId ? '' : String(v.providerName || '').trim(), color: v.color || '', fields,
      extraFields: (v.extra || []).filter((x) => x.label && x.value), currency: v.currency || 'USD',
      barcode: { value: v.codeFormat !== 'none' ? String(v.code || '') : '', format: v.codeFormat === 'none' ? 'none' : v.codeFormat, source: v.codeSource || 'entered' }
    };
  }
  function passForm(params, item) {
    const { template } = params;
    const t = A.TPL[template];
    const v = params.values;
    const errors = params.errors || {};
    const prov = v.providerId ? A.C.provider(v.providerId) : null;
    const provRow = t.providerCat || template === 'generic' ? `<button type="button" class="list-item pick-row" data-act="pick-provider"><span class="lead plain">${icon(t.icon)}</span>
        <span class="body"><span class="l2" style="display:block">${esc(t.providerLabel)}</span><span class="l1">${esc(prov ? (prov.cat === 'transit' ? `${prov.sub} · ${prov.city}` : prov.name) : v.providerName || 'Not set (optional)')}</span></span><span class="text-btn">Change</span></button>
        ${!prov ? input({ k: 'providerName', label: `${t.providerLabel} name (if not in the list)` }, v, errors.providerName) : ''}` : '';
    const codeErr = errors.code;
    const extra = (v.extra || []).map((x, i) => `<div class="field-row extra"><div class="field"><input data-extra="${i}" data-part="label" placeholder=" " value="${esc(x.label)}" maxlength="40"><label>Label</label></div>
        <div class="field"><input data-extra="${i}" data-part="value" placeholder=" " value="${esc(x.value)}" maxlength="200"><label>Value</label></div>
        <button type="button" class="icon-btn sm" data-act="remove-extra" data-i="${i}" aria-label="Remove field">${icon('close')}</button></div>`).join('');
    return `${params.prefill && params.prefill.note ? `<div class="notice" style="margin:0">${icon('info')}<span>${esc(params.prefill.note)}</span></div>` : ''}
      ${provRow}
      ${fieldsHtml(t.fields, v, errors)}
      ${['gift', 'transit'].includes(template) ? input({ k: 'currency', label: 'Currency', select: ['INR', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'USD', 'CAD', 'GBP', 'EUR', 'AUD', 'SGD'].map((c) => [c, c]) }, v) : ''}
      ${extra}<button type="button" class="text-btn add-extra" data-act="add-extra">${icon('add')}Add another detail</button>
      <div class="form-label">Barcode or QR code</div>
      ${input({ k: 'codeFormat', label: 'Code type', select: [['none', 'No code'], ['qr', 'QR code'], ['code128', 'Barcode (Code 128)']] }, v)}
      ${v.codeFormat !== 'none' ? `${input({ k: 'code', label: 'Code text, exactly as on your ticket', textarea: true, max: 1200, spell: false, hint: 'Copy it from your ticket, email or app. It’s kept character for character. Open Wallet never makes up a code' }, v, codeErr)}` : ''}
      ${swatches(v.color)}`;
  }

  // ---------------- Page ----------------
  const itemFor = (params) => (params.id ? (params.template === 'payment' ? A.findCard(params.id) : A.findPass(params.id)) : null);
  function preview(params) {
    const v = params.values;
    if (params.template === 'payment') return A.payCardHtml(payPreviewCard(v));
    const p = Object.assign({ id: 'preview', favorite: false, archived: false }, passFromValues(params.template, v));
    return A.Art.passTile(p, 0).replace(' enter', '').replace('data-act="open-pass"', 'tabindex="-1"');
  }

  A.PAGES.form = {
    keep: true,
    render(params) {
      const { template, id } = params;
      const editing = !!id;
      const item = itemFor(params);
      if (editing && !item) return null;
      if (!params.values) params.values = template === 'payment' ? payValues(item) : passValues(item, params);
      const errors = params.errors || {};
      const label = template === 'payment' ? 'payment card' : A.TPL[template].label.toLowerCase();
      return `<header class="topbar">
          <button class="icon-btn" data-act="back" aria-label="Close" title="Close">${icon('close')}</button>
          <div class="topbar-title">${editing ? 'Edit' : 'Add'} ${esc(label)}</div>
          <button class="text-btn" data-act="save-form" style="margin-right:8px">Save</button>
        </header>
        <div class="page-scroll">
          <div class="form-preview ${template === 'payment' ? 'card' : 'tile'}" data-preview>${preview(params)}</div>
          ${Object.keys(errors).length ? '<div class="form-error" style="margin-top:16px">Check the highlighted fields.</div>' : ''}
          <form class="form" data-form autocomplete="off" novalidate>
            ${template === 'payment' ? payForm(params, item) : passForm(params, item)}
            <button type="submit" class="btn filled block" style="margin-top:8px">${editing ? 'Save changes' : 'Add to Wallet'}</button>
            ${editing ? `<button type="button" class="btn outlined block danger-btn" data-act="${template === 'payment' ? 'remove-card' : 'delete-pass'}" data-id="${esc(id)}">${icon('delete')}${template === 'payment' ? 'Remove card' : 'Delete pass'}</button>` : ''}
          </form>
        </div>`;
    },
    mount(el, params) {
      const form = el.querySelector('[data-form]');
      if (!form) return;
      const rerenderOn = new Set(['codeFormat', 'productId', 'networkId']);
      form.addEventListener('input', (e) => {
        const t = e.target;
        if (t.dataset.extra != null) { params.values.extra[Number(t.dataset.extra)][t.dataset.part] = t.value; return; }
        const k = t.dataset.field;
        if (!k) return;
        let val = t.value;
        if (k === 'prefix' || k === 'last4') { const d = L.digitsOnly(val).slice(0, k === 'prefix' ? 8 : 4); if (d !== val) { t.value = d; val = d; } }
        if (k === 'expiry') { let d = val.replace(/[^\d/]/g, ''); if (/^\d{3,4}$/.test(d)) d = `${d.slice(0, 2)}/${d.slice(2)}`; if (d !== val) { t.value = d; val = d; } }
        const def = params.template !== 'payment' && A.TPL[params.template].fields.find((f) => f.k === k);
        if (def && def.upper && val !== val.toUpperCase()) { const pos = t.selectionStart; val = val.toUpperCase(); t.value = val; t.setSelectionRange(pos, pos); }
        params.values[k] = val;
        if (params.errors && params.errors[k]) {
          delete params.errors[k];
          const fe = t.closest('.field');
          fe.classList.remove('invalid');
          const h = fe.querySelector('.help');
          if (h) h.textContent = (def && def.hint) || '';
        }
        if (rerenderOn.has(k) && t.tagName === 'SELECT') { A.renderEntry(A.top()); return; }
        if (k === 'prefix') {
          const m = A.E.identifyCard({ prefix: val, issuerId: params.values.issuerId, productId: params.values.productId, networkId: params.values.networkId, learned: A.W.settings.learnedIins });
          const ml = el.querySelector('[data-match] span');
          if (ml) ml.textContent = A.E.MATCH_TEXT[m.level];
          const sel = el.querySelector('#f_networkId option[value=""]');
          if (sel) sel.textContent = m.network && !params.values.networkId ? `Detected: ${m.network.name}` : 'Not sure';
          if (m.issuerSource === 'learned' && !params.values.issuerId) { params.values.issuerId = m.issuer.id; A.renderEntry(A.top()); return; }
        }
        el.querySelector('[data-preview]').innerHTML = preview(params);
      });
      form.addEventListener('submit', (e) => { e.preventDefault(); A.saveForm(); });
      if (!params.id && !params.focused) {
        params.focused = true;
        setTimeout(() => { const first = form.querySelector('input,textarea'); if (first && params.template !== 'payment') first.focus(); }, A.motionMs(460));
      }
      if (params.errors) { const bad = form.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea'); if (bad) bad.focus(); }
    }
  };

  A.refreshFormPreview = (entry) => { entry.el.querySelector('[data-preview]').innerHTML = preview(entry.params); };

  function showErrors(entry, errors) {
    entry.params.errors = errors;
    A.renderEntry(entry);
    const bad = entry.el.querySelector('.field.invalid, .pick-row.invalid');
    if (bad) bad.scrollIntoView({ block: 'center', behavior: A.reduced() ? 'auto' : 'smooth' });
  }

  // ---------------- Save ----------------
  A.saveForm = function () {
    const entry = A.top();
    if (!entry || entry.name !== 'form') return;
    const { template, id, values: v } = entry.params;
    const editing = !!id;
    const errors = {};

    if (template === 'payment') {
      if (!v.issuerId && !String(v.issuerName || '').trim()) errors.issuer = 'Choose the bank or card issuer';
      const last4 = L.digitsOnly(v.last4);
      if (last4.length !== 4) errors.last4 = 'Enter the last 4 digits';
      const prefix = L.digitsOnly(v.prefix);
      if (prefix && (prefix.length < 6 || prefix.length > 8)) errors.prefix = 'Enter 6 to 8 digits, or leave it empty';
      let exp = null;
      if (String(v.expiry || '').trim()) { exp = L.parseExpiry(v.expiry); if (!exp) errors.expiry = 'Use MM/YY'; else if (!editing && !L.expiryInFuture(exp)) errors.expiry = 'This card has expired'; }
      if (Object.keys(errors).length) return showErrors(entry, errors);
      const net = v.networkId || (A.E.networkFor(prefix) || {}).id || '';
      const iss = v.issuerId ? A.C.issuer(v.issuerId) : null;
      const data = { issuerId: v.issuerId || '', issuerName: iss ? '' : String(v.issuerName || '').trim(), productId: v.productId || '', networkId: net, kind: v.kind || 'credit',
        last4, holder: String(v.holder || '').trim(), showHolder: !!v.showHolder, expMonth: exp ? exp.month : 0, expYear: exp ? exp.year : 0, showExpiry: !!(v.showExpiry && exp),
        contactless: !!v.contactless, color: v.color || '', nickname: String(v.nickname || '').trim() };
      const learn = (W) => { if (prefix.length >= 6 && iss) W.settings.learnedIins[prefix.slice(0, 6)] = iss.id; };
      v.prefix = ''; // digits are never kept on the card
      if (editing) {
        A.pop();
        A.commit((W) => { Object.assign(A.findCard(id), data); learn(W); });
        A.snackbar('Card updated');
        return;
      }
      if (A.W.cards.some((c) => c.last4 === last4 && (c.issuerId || c.issuerName) === (data.issuerId || data.issuerName))) {
        return showErrors(entry, { last4: `A card from this issuer ending in ${last4} is already in your wallet` });
      }
      const card = Object.assign({ id: A.uid('card'), addedAt: new Date().toISOString(), transactions: [] }, data);
      A.popTo('home');
      A.commit((W) => { W.cards.push(card); learn(W); if (!W.settings.defaultCardId) W.settings.defaultCardId = card.id; });
      A.ui.cardIndex = A.W.cards.length - 1;
      A.refreshAll();
      A.snackbar(`${A.cardName(card)} •• ${card.last4} added`);
      return;
    }

    // Passes
    const t = A.TPL[template];
    for (const f of t.fields) {
      const val = String(v[f.k] || '').trim();
      if (f.req && !val) errors[f.k] = `Enter ${f.label.replace(/\s*\(.*\)$/, '').toLowerCase()}`;
      if (val && f.type === 'money') { const m = L.validateMoney(val); if (m) errors[f.k] = m; }
      if (val && f.type === 'date' && isNaN(new Date(`${val}T00:00`))) errors[f.k] = 'Enter a valid date';
    }
    if (template === 'flight') ['from', 'to'].forEach((k) => { if (v[k] && !/^[A-Z]{3,4}$/.test(v[k])) errors[k] = 'Use the 3-letter airport code, like DEL'; });
    if (v.checkout && v.date && v.checkout < v.date) errors.checkout = 'Check-out is before check-in';
    if (v.validTo && v.validFrom && v.validTo < v.validFrom) errors.validTo = 'This is before the start date';
    if (v.codeFormat !== 'none') {
      const code = String(v.code || '');
      if (!code.trim()) errors.code = 'Enter the code text, or choose “No code”';
      else if (v.codeFormat === 'code128' && L.validateBarcode(code)) errors.code = L.validateBarcode(code);
      else if (v.codeFormat === 'qr' && !A.E.qrEncode(code)) errors.code = 'This is too long for a QR code here (about 600 characters max)';
    }
    if (!v.providerId && t.providerCat && String(v.providerName || '').length > 60) errors.providerName = 'Use 60 characters or fewer';
    if (Object.keys(errors).length) return showErrors(entry, errors);

    const data = passFromValues(template, v);
    data.updatedAt = new Date().toISOString();
    if (editing) {
      A.pop();
      A.commit(() => { const p = A.findPass(id); Object.assign(p, data, { edited: true }); });
      A.snackbar('Pass updated');
      return;
    }
    const pre = entry.params.prefill || {};
    const pass = Object.assign({ id: A.uid('pass'), archived: false, favorite: false, createdAt: data.updatedAt, history: [], source: pre.source || 'manual', sourceRef: pre.sourceRef || '', original: pre.original || null }, data);
    const dupe = A.W.passes.find((p) => p.template === pass.template && (p.providerId || p.providerName) === (pass.providerId || pass.providerName)
      && ((pass.fields.ref && p.fields.ref === pass.fields.ref) || (pass.barcode.value && p.barcode.value === pass.barcode.value)) && (p.fields.date || '') === (pass.fields.date || ''));
    const finish = () => {
      A.popTo('home');
      A.commit((W) => W.passes.push(pass));
      if (entry.params.onSaved) entry.params.onSaved(pass);
      A.snackbar(`${A.Art.passInfo(pass).title} added to Wallet`, 'View', () => A.push('pass', { id: pass.id }));
    };
    if (dupe) A.confirmDialog('Already in your Wallet?', 'A pass with the same provider, booking reference and date is already saved.', 'Add anyway', finish);
    else finish();
  };

  // Shared by flows.js
  A.formHelpers = { input, fieldsHtml, swatches, passFromValues };
  A.cap = cap;
})();
