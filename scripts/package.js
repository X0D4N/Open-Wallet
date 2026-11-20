#!/usr/bin/env node
// `npm run package`: makes a portable, ready-to-run copy of the app in
// release/Open Wallet-<platform>-<arch>/ without extra tools. It copies the
// Electron runtime from node_modules, renames the executable and places the
// app's own files in resources/app (the standard Electron layout).
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const dist = path.join(root, 'node_modules', 'electron', 'dist');
if (!fs.existsSync(dist)) {
  console.error('Electron runtime missing. Run `npm install` first.');
  process.exit(1);
}

const name = `${pkg.productName}-${process.platform}-${process.arch}`;
const out = path.join(root, 'release', name);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(dist, out, { recursive: true });

const exeFrom = { win32: 'electron.exe', linux: 'electron', darwin: 'Electron.app' }[process.platform];
const exeTo = { win32: `${pkg.productName}.exe`, linux: 'open-wallet', darwin: `${pkg.productName}.app` }[process.platform];
fs.renameSync(path.join(out, exeFrom), path.join(out, exeTo));

const resources = process.platform === 'darwin' ? path.join(out, exeTo, 'Contents', 'Resources') : path.join(out, 'resources');
fs.rmSync(path.join(resources, 'default_app.asar'), { force: true });
const appDir = path.join(resources, 'app');
fs.mkdirSync(appDir, { recursive: true });
for (const item of ['main.js', 'preload.js', 'src', 'assets', 'LICENSE']) {
  const from = path.join(root, item);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(appDir, item), { recursive: true });
}
const runtimePkg = { name: pkg.name, productName: pkg.productName, version: pkg.version, description: pkg.description, main: pkg.main, license: pkg.license };
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(runtimePkg, null, 2));

console.log(`Packaged ${pkg.productName} ${pkg.version} to ${path.relative(root, out)}`);
console.log(`Run: ${path.join(path.relative(root, out), exeTo)}`);
