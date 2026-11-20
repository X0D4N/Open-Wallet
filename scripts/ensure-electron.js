#!/usr/bin/env node
// Makes sure the Electron runtime is unpacked in node_modules/electron/dist.
//
// Electron's own postinstall step uses extract-zip, which silently stops
// half-way on some recent Node.js releases, leaving dist/ without electron.exe.
// This script re-uses the zip Electron already downloaded (or downloads it
// through @electron/get) and unpacks it with the system `tar`, which reads zip
// files on Windows 10+, macOS and Linux.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
if (!fs.existsSync(path.join(electronDir, 'package.json'))) {
  console.log('[ensure-electron] electron is not installed yet; skipping.');
  process.exit(0);
}

const { version } = require(path.join(electronDir, 'package.json'));
const platformPath = {
  win32: 'electron.exe',
  darwin: 'Electron.app/Contents/MacOS/Electron',
  linux: 'electron'
}[process.platform] || 'electron';

const dist = path.join(electronDir, 'dist');
const exe = path.join(dist, platformPath);

function installed() {
  try {
    const v = fs.readFileSync(path.join(dist, 'version'), 'utf8').trim().replace(/^v/, '');
    return v === version && fs.existsSync(exe) &&
      fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf8') === platformPath;
  } catch {
    return false;
  }
}

async function main() {
  if (installed()) {
    console.log(`[ensure-electron] Electron ${version} is ready.`);
    return;
  }
  const { downloadArtifact } = require(require.resolve('@electron/get', { paths: [electronDir] }));
  const zip = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.platform,
    arch: process.arch,
    checksums: require(path.join(electronDir, 'checksums.json'))
  });
  fs.mkdirSync(dist, { recursive: true });
  execFileSync(process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'unzip',
    process.platform === 'win32' ? ['-xf', zip, '-C', dist] : ['-o', '-q', zip, '-d', dist],
    { stdio: 'inherit' });
  const dts = path.join(dist, 'electron.d.ts');
  if (fs.existsSync(dts)) fs.renameSync(dts, path.join(electronDir, 'electron.d.ts'));
  fs.writeFileSync(path.join(electronDir, 'path.txt'), platformPath);
  if (!installed()) throw new Error('Electron still missing after unpacking ' + zip);
  console.log(`[ensure-electron] Unpacked Electron ${version}.`);
}

main().catch((err) => {
  console.error('[ensure-electron]', err && err.stack ? err.stack : err);
  process.exit(1);
});
