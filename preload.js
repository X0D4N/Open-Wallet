// Bridges the sandboxed page to the main process. Only these calls exist.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('walletApi', {
  load: call('wallet:load'),
  save: call('wallet:save'),
  reset: call('wallet:reset'),
  exportData: call('wallet:export'),
  importData: call('wallet:import'),
  openDataFolder: call('app:open-data-folder'),
  openExternal: call('app:open-external'),
  protect: call('app:protect'),
  settled: () => ipcRenderer.send('app:settled'),
  onBlur: (fn) => ipcRenderer.on('app:blur', () => fn()),
  onVaultLocked: (fn) => ipcRenderer.on('vault:locked', () => fn()),
  vault: {
    status: call('vault:status'), create: call('vault:create'), unlock: call('vault:unlock'), touch: call('vault:touch'), verify: call('vault:verify'),
    lock: call('vault:lock'), docs: call('vault:docs'), save: call('vault:save'), changePin: call('vault:change-pin'), reset: call('vault:reset'),
    addFile: call('vault:add-file'), fileUrl: call('vault:file-url'), openFile: call('vault:open-file'), deleteFile: call('vault:delete-file'), exportFile: call('vault:export-file')
  },
  originals: { add: call('originals:add'), addData: call('originals:add-data'),url: call('originals:url'), open: call('originals:open'), remove: call('originals:remove') },
  calendar: { connect: call('calendar:connect'), events: call('calendar:events'), disconnect: call('calendar:disconnect'), status: call('calendar:status'), importIcs: call('calendar:import-ics') }
});
