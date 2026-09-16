/**
 * @fileoverview Background daemon monitoring midnight rollovers (00:00:00)
 * to automatically clear daily achievements and notify active interfaces.
 */

import { StateManager } from '../services/state_manager.js';
import { logger } from '../services/logger.js';

export class ResetDaemon {
  private stateManager: StateManager;
  private intervalTimer: NodeJS.Timeout | null = null;
  private lastObservedDate: string = '';

  public constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.lastObservedDate = this.getCurrentDateString();
  }

  private getCurrentDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  public start(): void {
    if (this.intervalTimer) {
      return;
    }

    logger.info('Starting Midnight Reset Daemon.');

    this.intervalTimer = setInterval(() => {
      this.checkDateRollover();
    }, 10_000);
  }

  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
      logger.info('Stopped Midnight Reset Daemon.');
    }
  }

  private checkDateRollover(): void {
    const currentDate = this.getCurrentDateString();
    if (currentDate !== this.lastObservedDate) {
      logger.info(`Date changed from ${this.lastObservedDate} to ${currentDate}. Triggering midnight reset.`);
      this.lastObservedDate = currentDate;
      this.stateManager.performMidnightReset(currentDate);
    }
  }
}
