#!/usr/bin/env node
// Writes the shared catalogue (src/renderer/catalog.js) as JSON for the
// Android app: android/app/src/main/assets/catalog.json. Run after editing
// the catalogue: `node scripts/export-catalog.js`.
'use strict';

const fs = require('fs');
const path = require('path');
const C = require('../src/renderer/catalog.js');

const out = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'catalog.json');
const data = {
  version: C.VERSION,
  regions: C.REGIONS,
  gcc: C.GCC,
  categories: C.ADD_CATEGORIES,
  templates: Object.entries(C.TEMPLATES).map(([id, t]) => Object.assign({ id }, t)),
  providers: C.PROVIDERS.map((p) => { const o = Object.assign({}, p); delete o.art; return o; }),
  networks: C.NETWORKS,
  issuers: C.ISSUERS.map((b) => { const o = Object.assign({}, b); delete o.art; return o; }),
  docs: C.DOCS,
  docFieldLabels: C.DOC_FIELD_LABELS,
  art: C.ART_SOURCE
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(data));
console.log(`Wrote ${path.relative(process.cwd(), out)} (${data.providers.length} providers, ${data.issuers.length} issuers, ${data.docs.length} document types)`);
