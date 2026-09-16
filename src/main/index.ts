/**
 * @fileoverview Application entry point initializing the Electron lifecycle,
 * embedded LAN server, desktop overlay window, and system tray.
 */

import path from 'node:path';
import { app, ipcMain, shell } from 'electron';
import { StateManager } from '../services/state_manager.js';
import { AppServer } from '../server/app_server.js';
import { FileStorageManager } from '../server/file_storage.js';
import { WindowManager } from './window_manager.js';
import { TrayManager } from './tray_manager.js';
import { ResetDaemon } from './reset_daemon.js';
import { StartupManager } from './startup_manager.js';
import { LoudErrorHandler } from '../services/error_handler.js';
import { logger } from '../services/logger.js';

LoudErrorHandler.registerGlobalHandlers();

class ApplicationBootstrap {
  private resourceBaseDirectory: string;
  private stateManager: StateManager;
  private appServer: AppServer;
  private windowManager: WindowManager;
  private startupManager: StartupManager;
  private trayManager: TrayManager | null = null;
  private resetDaemon: ResetDaemon;
  private serverPort: number = 3030;

  public constructor() {
    app.name = 'OverAchiever';

    const resourceBaseDirectory = app.getAppPath();
    const userDataDirectory = app.getPath('userData');
    const dataDirectory = path.join(userDataDirectory, 'data');
    this.resourceBaseDirectory = resourceBaseDirectory;

    logger.relocate(path.join(userDataDirectory, 'logs'));

    const fileStorageManager = new FileStorageManager(path.join(dataDirectory, 'images'));
    fileStorageManager.seedDefaultBadge(
      path.join(resourceBaseDirectory, 'public', 'images', 'default_badge.svg')
    );

    this.stateManager = new StateManager(dataDirectory);
    this.appServer = new AppServer(this.stateManager, path.join(resourceBaseDirectory, 'public'), fileStorageManager);
    this.windowManager = new WindowManager(resourceBaseDirectory);
    this.startupManager = new StartupManager();
    this.resetDaemon = new ResetDaemon(this.stateManager);
  }

  public async start(): Promise<void> {
    app.name = 'OverAchiever';
    logger.info('Initializing OverAchiever Engine...');

    const singleInstanceLock = app.requestSingleInstanceLock();
    if (!singleInstanceLock) {
      logger.warn('Another application instance is already executing. Exiting current process.');
      app.quit();
      return;
    }

    try {
      const serverBinding = await this.appServer.start();
      this.serverPort = serverBinding.port;
    } catch (serverError) {
      logger.error('Failed to start embedded HTTP/WebSocket server', serverError);
      app.quit();
      return;
    }

    await app.whenReady();
    this.registerIpcHandlers();

    const config = this.stateManager.getConfig();
    if (config.launchOnStartup) {
      try {
        await this.startupManager.setEnabled(true);
        logger.info('Applied Windows startup registration per config.');
      } catch (startupError) {
        logger.error('Failed to register Windows startup', startupError);
      }
    }

    this.windowManager.createWidgetWindow(config);

    this.trayManager = new TrayManager(
      this.stateManager,
      this.startupManager,
      this.serverPort,
      this.resourceBaseDirectory
    );
    await this.trayManager.initialize();

    this.resetDaemon.start();

    this.stateManager.on('midnightReset', () => {
      this.trayManager?.rebuildContextMenu();
    });

    app.on('second-instance', () => {
      const url = `http://localhost:${this.serverPort}/dashboard`;
      shell.openExternal(url);
    });

    app.on('window-all-closed', () => {
      // Intentionally empty to keep background tray and desktop widget running
    });

    app.on('before-quit', async () => {
      logger.info('Application termination requested. Cleaning up resources.');
      this.resetDaemon.stop();
      this.trayManager?.destroy();
      this.windowManager.closeAllWindows();
      await this.appServer.stop();
    });
  }

  private registerIpcHandlers(): void {
    ipcMain.on('OPEN_DASHBOARD', (_event, targetUrl?: string) => {
      const destinationUrl = targetUrl || `http://localhost:${this.serverPort}/dashboard`;
      logger.info(`Opening dashboard from IPC request: ${destinationUrl}`);
      shell.openExternal(destinationUrl);
    });
  }
}

const bootstrap = new ApplicationBootstrap();
bootstrap.start().catch((bootstrapError: Error) => {
  logger.error('Fatal bootstrap failure', bootstrapError);
  process.exit(1);
});
