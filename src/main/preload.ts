/**
 * @fileoverview Preload script providing a secure IPC bridge between the Electron
 * main process and the widget/dashboard renderer contexts.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopBridge', {
  openDashboard: (url?: string) => {
    ipcRenderer.send('OPEN_DASHBOARD', url);
  },
  onReset: (callback: () => void) => {
    ipcRenderer.on('WIDGET_RESET', () => callback());
  },
});
