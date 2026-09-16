/**
 * @fileoverview Manages the Electron transparent desktop overlay window,
 * positioning it top-center without taskbar presence.
 */

import path from 'node:path';
import { BrowserWindow, screen, shell, app } from 'electron';
import { logger } from '../services/logger.js';
import { ApplicationConfig } from '../types/config.js';

export class WindowManager {
  private widgetWindow: BrowserWindow | null = null;
  private resourceBaseDirectory: string;

  /**
   * @param resourceBaseDirectory Read-only application resources (asar in packaged builds).
   */
  public constructor(resourceBaseDirectory: string) {
    this.resourceBaseDirectory = resourceBaseDirectory;
  }

  public createWidgetWindow(config: ApplicationConfig): BrowserWindow {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    const windowWidth = 680;
    const windowHeight = Math.floor(screenHeight * 0.95);
    const windowXPosition = Math.floor((screenWidth - windowWidth) / 2);
    const windowYPosition = 12;

    this.widgetWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: windowXPosition,
      y: windowYPosition,
      frame: false,
      transparent: true,
      skipTaskbar: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      fullscreenable: false,
      focusable: false,
      alwaysOnTop: false,
      backgroundColor: '#00000000',
      icon: path.join(this.resourceBaseDirectory, 'public', 'tray_icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(this.resourceBaseDirectory, 'dist', 'main', 'preload.js'),
      },
    });

    const widgetUrl = `http://127.0.0.1:${config.port}/widget`;
    logger.info(`Loading Desktop Widget from: ${widgetUrl}`);

    this.widgetWindow.loadURL(widgetUrl).catch((loadError: Error) => {
      logger.error('Failed to load widget URL in BrowserWindow', loadError);
    });

    this.widgetWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: 'deny' };
    });

    this.widgetWindow.on('closed', () => {
      this.widgetWindow = null;
    });

    return this.widgetWindow;
  }

  public getWidgetWindow(): BrowserWindow | null {
    return this.widgetWindow;
  }

  public reloadWidget(): void {
    if (this.widgetWindow && !this.widgetWindow.isDestroyed()) {
      this.widgetWindow.reload();
    }
  }

  public closeAllWindows(): void {
    if (this.widgetWindow && !this.widgetWindow.isDestroyed()) {
      this.widgetWindow.close();
      this.widgetWindow = null;
    }
  }
}
