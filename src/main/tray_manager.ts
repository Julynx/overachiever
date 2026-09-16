/**
 * @fileoverview Manages the Windows system tray icon and contextual quick actions.
 */

import path from 'node:path';
import { app, Tray, Menu, shell, nativeImage } from 'electron';
import { StateManager } from '../services/state_manager.js';
import { logger } from '../services/logger.js';
import { StartupManager } from './startup_manager.js';

export class TrayManager {
  private tray: Tray | null = null;
  private stateManager: StateManager;
  private startupManager: StartupManager;
  private resourceBaseDirectory: string;
  private serverPort: number;
  private startupEnabled: boolean = false;

  public constructor(
    stateManager: StateManager,
    startupManager: StartupManager,
    serverPort: number,
    resourceBaseDirectory: string
  ) {
    this.stateManager = stateManager;
    this.startupManager = startupManager;
    this.serverPort = serverPort;
    this.resourceBaseDirectory = resourceBaseDirectory;
  }

  public async initialize(): Promise<Tray> {
    const iconPath = path.join(this.resourceBaseDirectory, 'public', 'tray_icon.png');
    let icon = nativeImage.createFromPath(iconPath);

    if (icon.isEmpty()) {
      const fallbackSvgPath = path.join(
        this.resourceBaseDirectory,
        'public',
        'images',
        'default_badge.svg'
      );
      icon = nativeImage.createFromPath(fallbackSvgPath).resize({ width: 24, height: 24 });
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('OverAchiever - Desktop achievements for your daily goals');

    this.startupEnabled = await this.startupManager.isEnabled();
    this.rebuildContextMenu();

    this.tray.on('double-click', () => {
      this.openDashboardInBrowser();
    });

    return this.tray;
  }

  public rebuildContextMenu(): void {
    if (!this.tray) {
      return;
    }

    const isStartupEnabled = this.startupEnabled;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'OverAchiever',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Open dashboard',
        click: () => {
          this.openDashboardInBrowser();
        },
      },
      {
        label: "Reset today's achievements",
        click: () => {
          this.stateManager.performMidnightReset();
        },
      },
      { type: 'separator' },
      {
        label: 'Launch on Windows startup',
        type: 'checkbox',
        checked: isStartupEnabled,
        click: (menuItem) => {
          this.toggleWindowsStartup(menuItem.checked);
        },
      },
      {
        label: 'View logs',
        click: () => {
          shell.openPath(logger.getLogFilePath());
        },
      },
      { type: 'separator' },
      {
        label: 'Exit',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  private openDashboardInBrowser(): void {
    const url = `http://localhost:${this.serverPort}/dashboard`;
    logger.info(`Opening dashboard in default browser: ${url}`);
    shell.openExternal(url);
  }

  private async toggleWindowsStartup(enable: boolean): Promise<void> {
    try {
      await this.startupManager.setEnabled(enable);
      this.startupEnabled = enable;
      this.stateManager.updateConfig({ launchOnStartup: enable });
    } catch (startupError) {
      logger.error('Failed to toggle Windows startup registration', startupError);
      this.startupEnabled = await this.startupManager.isEnabled();
    }
    this.rebuildContextMenu();
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
