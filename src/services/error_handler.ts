/**
 * @fileoverview Global process error handlers enforcing loud crash and error reporting.
 */

import { logger } from './logger.js';

export class LoudErrorHandler {
  public static registerGlobalHandlers(): void {
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception occurred in application process', error);
      console.error('==================== LOUD CRITICAL ERROR ====================');
      console.error(error.stack || error.message);
      console.error('=============================================================');
    });

    process.on('unhandledRejection', (reason: unknown) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      logger.error('Unhandled Promise Rejection occurred', error);
      console.error('================== LOUD UNHANDLED REJECTION =================');
      console.error(error.stack || error.message);
      console.error('=============================================================');
    });
  }
}
