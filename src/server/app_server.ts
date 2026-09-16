/**
 * @fileoverview Express HTTP server configuring REST endpoints, static file hosting,
 * CORS for local LAN devices, and WebSocket synchronization.
 */

import http from 'node:http';
import path from 'node:path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { StateManager } from '../services/state_manager.js';
import { FileStorageManager } from './file_storage.js';
import { createApiRouter } from './router.js';
import { WebSocketHub } from './websocket_hub.js';
import { logger } from '../services/logger.js';

export class AppServer {
  private app: express.Application;
  private httpServer: http.Server | null = null;
  private webSocketHub: WebSocketHub | null = null;
  private stateManager: StateManager;
  private fileStorageManager: FileStorageManager;
  private publicDirectory: string;

  /**
   * @param publicDirectory Read-only directory with dashboard/widget HTML, bundles, and static assets.
   */
  public constructor(
    stateManager: StateManager,
    publicDirectory: string,
    fileStorageManager: FileStorageManager
  ) {
    this.publicDirectory = publicDirectory;
    this.stateManager = stateManager;
    this.fileStorageManager = fileStorageManager;
    this.app = express();

    this.configureMiddleware();
    this.configureStaticRoutes();
    this.configureApiRoutes();
    this.configureErrorHandling();
  }

  private configureMiddleware(): void {
    this.app.use((_request: Request, response: Response, next: NextFunction) => {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss: http: https:; img-src 'self' data: blob: http: https:; connect-src 'self' ws: wss: http: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:;"
      );
      next();
    });
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  }

  private configureStaticRoutes(): void {
    const publicDirectory = this.publicDirectory;
    const imagesDirectory = this.fileStorageManager.getImagesDirectory();

    this.app.get('/favicon.ico', (_request: Request, response: Response) => {
      response.sendFile(path.join(publicDirectory, 'tray_icon.png'));
    });

    this.app.use('/images', express.static(imagesDirectory));
    this.app.use(express.static(publicDirectory));

    this.app.get('/', (_request: Request, response: Response) => {
      response.sendFile(path.join(publicDirectory, 'dashboard.html'));
    });

    this.app.get('/dashboard', (_request: Request, response: Response) => {
      response.sendFile(path.join(publicDirectory, 'dashboard.html'));
    });

    this.app.get('/widget', (_request: Request, response: Response) => {
      response.sendFile(path.join(publicDirectory, 'widget.html'));
    });
  }

  private configureApiRoutes(): void {
    const apiRouter = createApiRouter(this.stateManager, this.fileStorageManager);
    this.app.use('/api', apiRouter);
  }

  private configureErrorHandling(): void {
    this.app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
      logger.error('Express Request Handler Error', error);
      response.status(500).json({
        success: false,
        error: error.message,
        stack: error.stack,
      });
    });
  }

  public async start(): Promise<{ port: number; host: string }> {
    const config = this.stateManager.getConfig();
    const port = config.port || 3030;
    const host = config.host || '0.0.0.0';

    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer(this.app);
      this.webSocketHub = new WebSocketHub(this.httpServer, this.stateManager);

      this.httpServer.on('error', (serverError: Error) => {
        logger.error(`HTTP Server failed to bind on ${host}:${port}`, serverError);
        reject(serverError);
      });

      this.httpServer.listen(port, host, () => {
        logger.info(`HTTP and WebSocket server actively listening on http://${host}:${port}`);
        resolve({ port, host });
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          logger.info('HTTP Server stopped.');
          this.httpServer = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getWebSocketHub(): WebSocketHub | null {
    return this.webSocketHub;
  }
}
