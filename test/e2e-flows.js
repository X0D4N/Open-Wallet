// End-to-end click-through, run inside the app window by `npm run e2e`.
// Drives the real UI with DOM events and checks the wallet state after each
// step. The value of the last expression (a promise) is the report.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const steps = [];
  const check = (name, cond, extra) => { steps.push({ name, ok: !!cond, ...(extra !== undefined ? { extra } : {}) }); };
  const waitFor = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(50); } return null; };
  const click = async (sel, ms = 500) => { const el = typeof sel === 'string' ? await waitFor(() => $(sel)) : sel; if (!el) throw new Error(`missing ${sel}`); el.click(); await sleep(ms); return el; };
  const type = (sel, value) => { const el = typeof sel === 'string' ? $(sel) : sel; if (!el) throw new Error(`missing ${sel}`); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const top = () => window.App.top();
  const inTop = (s) => top().el.querySelector(s);
  const btnText = (sel, text) => $$(sel).find((b) => b.textContent.includes(text));
  const A = () => window.App;

  try {
    await waitFor(() => window.App && window.App.W && $('.page[data-page="home"]'), 8000);
    await sleep(1700);
    const welcome = await waitFor(() => $$('.dialog h3').find((h) => h.textContent.includes('Welcome')), 2500);
    check('welcome dialog on first run', welcome);
    if (welcome) await click('.dialog [data-dlg="1"]', 400);
    check('onboarded saved', A().W.settings.onboarded === true);
    check('sample data loaded', A().W.cards.length === 3 && A().W.passes.length === 9, [A().W.cards.length, A().W.passes.length]);
    check('home shows carousel, featured pass and grid', $('.carousel') && $('.pass-featured') && $$('.pass-tile').length >= 4);

    // Carousel selection with the keyboard.
    const i0 = A().ui.cardIndex;
    $('.carousel').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await sleep(450);
    check('carousel moves to the next card', A().ui.cardIndex === i0 + 1 && $$('.car-item')[i0 + 1].classList.contains('on'));
    check('hold-to-reader follows the selected card', $('.ready-chip').dataset.id === A().W.cards[i0 + 1].id);

    // Add to Wallet chooser.
    await click('.fab', 700);
    check('add chooser opens', top().name === 'add' && $$('.page[data-page="add"] .group-item').length >= 10);
    type(inTop('[data-add-search]'), 'domino');
    await sleep(150);
    check('chooser search finds providers', !!inTop('[data-act="pick-prov"][data-id="gift.dominos"]'));
    type(inTop('[data-add-search]'), '');
    await sleep(100);

    // Payment card: no full number is ever asked for.
    await click(inTop('[data-cat="payment"]'), 700);
    check('payment form open', top().name === 'form' && top().params.template === 'payment');
    check('form has no full card number field', !$('#f_number') && !!$('#f_prefix') && !!$('#f_last4'));
    await click('[data-act="save-form"]', 400);
    check('empty card form shows errors', $('.pick-row.invalid') && $('.field.invalid #f_last4'));
    await click('[data-act="pick-issuer"]', 500);
    type('.sheet input[type="search"]', 'axis');
    await sleep(150);
    await click('.sheet [data-pick="axis"]', 500);
    check('issuer chosen', top().params.values.issuerId === 'axis');
    const prod = $('#f_productId');
    prod.value = 'magnus'; prod.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300);
    type('#f_prefix', '411111');
    await sleep(100);
    check('network detected from first digits', /Visa/.test($('#f_networkId').selectedOptions[0].textContent));
    type('#f_last4', '1111');
    await click('[data-act="save-form"]', 900);
    const card = A().W.cards.find((c) => c.issuerId === 'axis');
    check('card added with issuer, product and network', card && card.productId === 'magnus' && card.networkId === 'visa' && card.last4 === '1111');
    check('first digits not kept on the card', card && !('prefix' in card) && !JSON.stringify(card).includes('411111'));
    check('confirmed prefix remembered (6 digits only)', A().W.settings.learnedIins['411111'] === 'axis');
    check('back on home after add', top().name === 'home');

    // Card detail + demo tap.
    await click(`.car-item[data-id="${card.id}"]`, 400);
    if (top().name !== 'card') await click(`.car-item[data-id="${card.id}"]`, 800);
    check('card detail open', top().name === 'card');
    check('match level shown', inTop('.match-row') && inTop('.match-row').textContent.includes('Issuer and product'));
    await click(inTop('[data-act="pay"]'), 400);
    await click('.dialog [data-dlg="1"]', 500);
    await click('[data-pay="tap"]', 1900);
    check('demo payment recorded', card.transactions.length === 1 && card.transactions[0].merchant === 'Demo reader');
    await click('[data-pay="close"]', 400);
    await click(inTop('[data-act="back"]'), 700);

    // Movie ticket through Tickets & events → Movie → cinema directory.
    await click('.fab', 700);
    await click(inTop('[data-cat="tickets"]'), 700);
    check('ticket types listed', top().name === 'templates' && inTop('[data-template="movie"]'));
    await click(inTop('[data-template="movie"]'), 700);
    check('cinema directory opens', top().name === 'providers' && inTop('[data-id="movie.pvrinox"]'));
    await click(inTop('[data-id="movie.pvrinox"]'), 700);
    check('movie form with provider', top().name === 'form' && top().params.values.providerId === 'movie.pvrinox');
    type('#f_title', 'Test Movie');
    type('#f_date', '2031-05-06');
    type('#f_time', '19:00');
    type('#f_row', 'H');
    type('#f_seat', '7');
    const fmt = $('#f_codeFormat');
    fmt.value = 'qr'; fmt.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300);
    const payload = 'TKT|H7|2031-05-06 19:00|ÄØ';
    type('#f_code', payload);
    await click('[data-act="save-form"]', 900);
    const movie = A().W.passes.find((p) => p.fields.title === 'Test Movie');
    check('movie pass saved', movie && movie.template === 'movie' && movie.providerId === 'movie.pvrinox');
    check('code kept exactly', movie && movie.barcode.value === payload && movie.barcode.format === 'qr' && movie.barcode.source === 'entered');
    const view = await waitFor(() => btnText('.snackbar button', 'View'));
    await click(view, 800);
    check('pass detail shows template and QR', top().name === 'pass' && inTop('.pass-card.tpl-movie') && inTop('.qr-svg') && inTop('.pc-motif svg'));
    await click(inTop('[data-act="barcode"]'), 300);
    check('full-screen code viewer', $('.viewer .qr-svg'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await sleep(200);
    check('Esc closes viewer', !$('.viewer'));
    await click(inTop('[data-act="favorite"]'), 300);
    check('favourite toggled', movie.favorite === true);
    await click(inTop('[data-act="edit-pass"]'), 700);
    type('#f_seat', '8');
    await click('[data-act="save-form"]', 800);
    check('pass edited', movie.fields.seat === '8' && top().name === 'pass');

    // Duplicate warning.
    await click(inTop('[data-act="back"]'), 600);
    await click('.fab', 600);
    await click(inTop('[data-cat="gift"]'), 700);
    type(inTop('[data-prov-search]'), 'domino');
    await sleep(150);
    await click(inTop('[data-id="gift.dominos"]'), 700);
    type('#f_number', '1234567890');
    type('#f_balance', 'abc');
    await click('[data-act="save-form"]', 400);
    check('bad balance rejected', $('.field.invalid #f_balance'));
    type('#f_balance', '500');
    await click('[data-act="save-form"]', 800);
    const gift = A().W.passes.find((p) => p.providerId === 'gift.dominos');
    check('gift card added from directory', gift && gift.fields.balance === '500');

    // Search and filters.
    await click('.page[data-page="home"] [data-act="search"]', 600);
    type('[data-search]', 'monsoon');
    await sleep(100);
    check('search finds a pass', $$('[data-results] .list-item').length >= 1);
    await click('[data-filter="payment"]', 200);
    check('payment filter hides passes', $$('[data-results] .list-item').length === 0);
    await click('[data-act="clear-search"]', 300);
    check('clear search shows everything', $$('[data-results] .list-item').length === A().W.cards.length + A().W.passes.length);
    await click(inTop('[data-act="back"]'), 600);

    // Document vault.
    await click('.page[data-page="home"] .vault-tile', 900);
    check('vault setup shown', top().name === 'vault' && inTop('#pin1'));
    type('#pin1', '2580'); type('#pin2', '2581');
    await click(inTop('[data-act="vault-create"]'), 400);
    check('mismatched PINs rejected', inTop('[data-pin-err]').textContent.includes('match'));
    type('#pin2', '2580');
    await click(inTop('[data-act="vault-create"]'), 1500);
    check('vault created and open', A().vault.unlocked && inTop('[data-act="go-ids"]'));
    await click(inTop('[data-act="go-ids"]'), 700);
    check('document chooser for the region', top().name === 'ids' && inTop('[data-type="IN.pan"]'));
    await click(inTop('[data-type="IN.pan"]'), 500);
    await click('.sheet [data-o="copy"]', 800);
    check('document form open', top().name === 'doc-form');
    type('#f_holder', 'Test Person');
    type('#f_number', 'ABC1');
    await click('[data-act="doc-save"]', 500);
    check('format warning shown', $$('.dialog h3').some((h) => h.textContent.includes('Check the number')));
    await click('.dialog [data-dlg="0"]', 300);
    type('#f_number', 'ABCDE1234F');
    await click('[data-act="doc-save"]', 1200);
    check('document saved and opened', top().name === 'doc' && A().vault.docs.length === 1);
    check('number masked by default', inTop('.doc-card').textContent.includes('XXXX XXXX 234F') && !inTop('.doc-card').textContent.includes('ABCDE1234F'));
    await click(inTop('[data-act="doc-reveal"]'), 400);
    type('#vp', '0000');
    await click('.dialog [data-dlg="1"]', 500);
    check('wrong PIN does not reveal', $('.dialog .field.invalid'));
    type('#vp', '2580');
    await click('.dialog [data-dlg="1"]', 600);
    check('right PIN reveals', inTop('.doc-card').textContent.includes('ABCDE1234F'));
    check('documents not in the wallet file', !JSON.stringify(A().W).includes('ABCDE1234F'));
    await window.App.lockVault();
    await sleep(500);
    check('locking closes document pages', top().name === 'vault' && inTop('#pin'));
    type('#pin', '1111');
    await click(inTop('[data-act="vault-unlock"]'), 900);
    check('wrong PIN keeps it locked', !A().vault.unlocked && inTop('[data-pin-err]').textContent.includes('Wrong'));
    type('#pin', '2580');
    await click(inTop('[data-act="vault-unlock"]'), 1200);
    check('right PIN unlocks', A().vault.unlocked && A().vault.docs.length === 1);
    await window.App.lockVault();
    await sleep(300);
    await click(inTop('[data-act="back"]'), 600);

    // Calendar booking review (sample .ics, offline).
    const res = A().proposeFromEvents(A().E.parseIcs(A().SAMPLE_ICS), 'test.ics');
    check('meeting skipped, 2 bookings found', res.checked === 3 && res.proposals.length === 2);
    A().push('review', res);
    await sleep(700);
    await click(inTop('[data-act="rv-add"]'), 800);
    check('review opens a prefilled form', top().name === 'form' && $('#f_from').value === 'DXB' && $('#f_ref').value === 'QX7P2L');
    check('missing details stay empty', $('#f_gate').value === '' && $('#f_seat').value === '32A');
    await click('[data-act="save-form"]', 900);
    const cal = A().W.passes.find((p) => p.source === 'calendar');
    check('calendar pass saved with source', cal && cal.sourceRef === 'ics:s1' && cal.providerId === 'flight.emirates');
    const again = A().proposeFromEvents(A().E.parseIcs(A().SAMPLE_ICS), 'test.ics');
    check('no duplicate on re-import', again.proposals.length === 1 && again.proposals[0].det.template === 'movie');
    A().popTo('home');
    await sleep(500);

    // Settings.
    await click('[data-act="account"]', 400);
    await click('.sheet [data-page="settings"]', 700);
    await click(inTop('[data-act="theme"]'), 300);
    await click('.dialog [data-opt="dark"]', 400);
    check('dark theme applied', document.documentElement.dataset.theme === 'dark' && A().W.settings.theme === 'dark');
    await click(inTop('[data-key="reduceMotion"]'), 300);
    check('reduce motion on', document.documentElement.dataset.motion === 'reduced');
    await click(inTop('[data-page="calendar"]'), 600);
    check('calendar page: off by default with explanation', top().name === 'calendar' && !A().W.settings.calendar.connected && inTop('#cal-client') && inTop('.notice').textContent.includes('read'));
    await click(inTop('[data-act="back"]'), 400);
    await click(inTop('[data-act="back"]'), 400);
    check('back to home', top().name === 'home');

    await sleep(600);
    const ok = steps.every((s) => s.ok);
    return { ok, passed: steps.filter((s) => s.ok).length, total: steps.length, failed: steps.filter((s) => !s.ok) };
  } catch (err) {
    return { ok: false, error: String((err && err.stack) || err), passed: steps.filter((s) => s.ok).length, failed: steps.filter((s) => !s.ok), at: steps.length };
  }
})();
