#!/usr/bin/env node
// `npm run build`: syntax-checks every source file, makes sure the page
// references only files that exist, and validates the catalogue and sample
// data. Exits non-zero on any problem.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const problems = [];

const jsFiles = [
  'main.js', 'preload.js', 'src/store.js', 'src/sample-data.js', 'src/vault.js', 'src/calendar.js',
  'src/renderer/lib.js', 'src/renderer/catalog.js', 'src/renderer/engines.js', 'src/renderer/icons.js', 'src/renderer/art.js',
  'src/renderer/core.js', 'src/renderer/pages.js', 'src/renderer/forms.js', 'src/renderer/flows.js', 'src/renderer/vault-ui.js', 'src/renderer/app.js',
  'scripts/ensure-electron.js'
];

for (const rel of jsFiles) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) { problems.push(`missing ${rel}`); continue; }
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    problems.push(`syntax error in ${rel}:\n${String(err.stderr || err.message)}`);
  }
}

const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (!fs.existsSync(path.join(root, 'src/renderer', m[1]))) problems.push(`index.html references missing ${m[1]}`);
}
if (!fs.existsSync(path.join(root, 'assets', 'icon.png'))) problems.push('assets/icon.png is missing (run scripts/make-launcher-icons.ps1)');

// Catalogue integrity: unique ids, valid regions, colours and templates.
const C = require(path.join(root, 'src/renderer/catalog.js'));
const seen = new Set();
const regions = new Set(C.REGIONS.map((r) => r.code));
for (const p of C.PROVIDERS) {
  if (seen.has(p.id)) problems.push(`duplicate provider id ${p.id}`);
  seen.add(p.id);
  if (!regions.has(p.region)) problems.push(`provider ${p.id} has unknown region ${p.region}`);
  if (!/^#[0-9a-f]{6}$/i.test(p.color)) problems.push(`provider ${p.id} has a bad colour`);
}
for (const b of C.ISSUERS) if (!regions.has(b.country)) problems.push(`issuer ${b.id} has unknown region`);
for (const d of C.DOCS) if (d.pattern) { try { new RegExp(d.pattern); } catch { problems.push(`doc ${d.id} has a bad pattern`); } }
for (const c of C.ADD_CATEGORIES) for (const t of c.templates || []) if (!C.TEMPLATES[t]) problems.push(`category ${c.id} uses unknown template ${t}`);

// The sample data must pass the store's own validation unchanged.
const { normalizeWallet } = require(path.join(root, 'src/store.js'));
const { sampleWallet } = require(path.join(root, 'src/sample-data.js'));
const w = normalizeWallet(sampleWallet());
const raw = sampleWallet();
if (w.cards.length !== raw.cards.length || w.passes.length !== raw.passes.length) problems.push('sample data did not survive validation');

if (problems.length) {
  console.error(`Build check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Build check passed: ${jsFiles.length} scripts, page assets, catalogue (${C.PROVIDERS.length} providers, ${C.ISSUERS.length} issuers, ${C.DOCS.length} document types) and sample data OK.`);
