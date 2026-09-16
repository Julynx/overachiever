/**
 * @fileoverview Real-time WebSocket synchronization hub broadcasting state
 * changes between the desktop widget, LAN dashboards, and mobile devices.
 */

import { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { StateManager } from '../services/state_manager.js';
import { logger } from '../services/logger.js';
import { WebSocketEventType, WebSocketMessage } from '../types/websocket_events.js';

export class WebSocketHub {
  private webSocketServer: WebSocketServer;
  private stateManager: StateManager;

  public constructor(httpServer: HttpServer, stateManager: StateManager) {
    this.stateManager = stateManager;
    this.webSocketServer = new WebSocketServer({ server: httpServer, path: '/ws' });

    this.setupConnectionListener();
    this.bindStateManagerEvents();
  }

  private setupConnectionListener(): void {
    this.webSocketServer.on('connection', (socket: WebSocket) => {
      logger.info('New WebSocket client connected.');

      const initialStatePayload = {
        achievements: this.stateManager.getAllAchievements(),
        state: this.stateManager.getDailyState(),
        history: this.stateManager.getHistory(),
        progress: this.stateManager.getProgress(),
      };

      this.sendToSocket(socket, 'INIT_STATE', initialStatePayload);

      socket.on('error', (socketError: Error) => {
        logger.error('WebSocket connection error encountered', socketError);
      });

      socket.on('close', () => {
        logger.info('WebSocket client disconnected.');
      });
    });
  }

  private bindStateManagerEvents(): void {
    this.stateManager.on('achievementUnlocked', (payload) => {
      this.broadcast('ACHIEVEMENT_UNLOCKED', payload);
    });

    this.stateManager.on('achievementRevoked', (payload) => {
      this.broadcast('ACHIEVEMENT_REVOKED', payload);
    });

    this.stateManager.on('midnightReset', (payload) => {
      this.broadcast('MIDNIGHT_RESET', payload);
    });

    this.stateManager.on('achievementCreated', (payload) => {
      this.broadcast('ACHIEVEMENT_CREATED', payload);
    });

    this.stateManager.on('achievementUpdated', (payload) => {
      this.broadcast('ACHIEVEMENT_UPDATED', payload);
    });

    this.stateManager.on('achievementDeleted', (payload) => {
      this.broadcast('ACHIEVEMENT_DELETED', payload);
    });

    this.stateManager.on('historyCleared', () => {
      this.broadcast('HISTORY_CLEARED', {});
    });
  }

  public broadcast<T>(type: WebSocketEventType, payload: T): void {
    const serializedMessage = JSON.stringify({ type, payload } as WebSocketMessage<T>);

    for (const client of this.webSocketServer.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serializedMessage);
      }
    }
  }

  private sendToSocket<T>(socket: WebSocket, type: WebSocketEventType, payload: T): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, payload } as WebSocketMessage<T>));
    }
  }
}
