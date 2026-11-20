#!/usr/bin/env node
// `npm run e2e`: launches the real app twice with a throw-away data folder.
// Run 1 clicks through the main flows; run 2 restarts and checks persistence.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-wallet-e2e-'));
let failed = false;

for (const script of ['test/e2e-flows.js', 'test/e2e-restart.js']) {
  const r = spawnSync(electron, ['.', '--user-data', dataDir, '--e2e', script], { cwd: root, encoding: 'utf8', timeout: 180000 });
  const out = (r.stdout || '').trim();
  console.log(`--- ${script} (exit ${r.status})\n${out}`);
  if (r.status !== 0) failed = true;
}
fs.rmSync(dataDir, { recursive: true, force: true });
if (failed) { console.error('E2E FAILED'); process.exit(1); }
console.log('E2E passed.');
