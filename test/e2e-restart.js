// Second launch after e2e-flows.js: checks everything was saved to disk and
// that the vault comes back locked.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const t = Date.now();
  while (!(window.App && window.App.W && document.querySelector('.page[data-page="home"]')) && Date.now() - t < 8000) await sleep(50);
  await sleep(900);
  const A = window.App;
  const W = A.W;
  const card = W.cards.find((c) => c.issuerId === 'axis');
  const movie = W.passes.find((p) => p.fields.title === 'Test Movie');
  const steps = [
    ['no welcome dialog on second launch', !document.querySelector('.dialog')],
    ['card persisted', !!card && card.productId === 'magnus' && card.transactions.length === 1],
    ['movie persisted with edit, favourite and exact code', !!movie && movie.fields.seat === '8' && movie.favorite && movie.barcode.value === 'TKT|H7|2031-05-06 19:00|ÄØ'],
    ['gift persisted', W.passes.some((p) => p.providerId === 'gift.dominos' && p.fields.balance === '500')],
    ['calendar pass persisted', W.passes.some((p) => p.source === 'calendar' && p.sourceRef === 'ics:s1')],
    ['theme persisted', W.settings.theme === 'dark' && document.documentElement.dataset.theme === 'dark'],
    ['vault exists and is locked after restart', A.vault.status && A.vault.status.exists && !A.vault.unlocked],
    ['home shows 4 cards', document.querySelectorAll('.car-item').length === 4]
  ].map(([name, ok]) => ({ name, ok }));
  const r = await window.walletApi.vault.unlock('2580', 5);
  const d = await window.walletApi.vault.docs();
  steps.push({ name: 'vault opens with the PIN and keeps the document', ok: r.ok && d.ok && d.docs.length === 1 && d.docs[0].number === 'ABCDE1234F' });
  await window.walletApi.vault.lock();
  return { ok: steps.every((s) => s.ok), passed: steps.filter((s) => s.ok).length, total: steps.length, failed: steps.filter((s) => !s.ok) };
})();
