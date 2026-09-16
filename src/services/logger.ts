/**
 * @fileoverview Robust file-based and terminal logger providing loud error reporting
 * and persistent audit logging to disk.
 *
 * Performs no filesystem I/O at import time: the destination starts unresolved and
 * early entries are buffered in memory until relocate() provides the real directory
 * (the packaged user-data location). This keeps the module safe when the process is
 * launched with an unwritable working directory (e.g. System32 via Task Scheduler).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export class Logger {
  private logFilePath: string | null = null;
  private logDirectory: string | null = null;
  private pendingEntries: string[] = [];

  /**
   * Moves the log destination to a new directory (e.g. the packaged
   * user-data location), flushing any entries logged before relocation.
   */
  public relocate(logDirectory: string): void {
    this.logDirectory = logDirectory;
    this.logFilePath = path.join(logDirectory, 'achievements.log');
    try {
      this.ensureLogDirectoryExists();
    } catch (relocateError) {
      this.logDirectory = null;
      this.logFilePath = null;
      console.error('CRITICAL: Failed to initialize log directory:', relocateError);
      return;
    }
    if (this.pendingEntries.length > 0) {
      const bufferedEntries = this.pendingEntries;
      this.pendingEntries = [];
      for (const entry of bufferedEntries) {
        this.appendToFile(entry);
      }
    }
  }

  private ensureLogDirectoryExists(): void {
    if (this.logDirectory && !fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }
  }

  private formatMessage(level: LogLevel, message: string, error?: unknown): string {
    const timestamp = new Date().toISOString();
    let formatted = `[${timestamp}] [${level}] ${message}`;

    if (error instanceof Error) {
      formatted += `\nStack trace:\n${error.stack ?? error.message}`;
    } else if (error !== undefined) {
      formatted += `\nDetails: ${JSON.stringify(error, null, 2)}`;
    }

    return formatted;
  }

  private appendToFile(formattedText: string): void {
    try {
      this.ensureLogDirectoryExists();
      fs.appendFileSync(this.logFilePath!, `${formattedText}\n`, 'utf8');
    } catch (writeError) {
      console.error('CRITICAL: Failed to write to log file:', writeError);
    }
  }

  private writeToFile(formattedText: string): void {
    if (!this.logFilePath) {
      this.pendingEntries.push(formattedText);
      return;
    }
    this.appendToFile(formattedText);
  }

  public info(message: string): void {
    const output = this.formatMessage(LogLevel.INFO, message);
    console.log(output);
    this.writeToFile(output);
  }

  public warn(message: string, error?: unknown): void {
    const output = this.formatMessage(LogLevel.WARN, message, error);
    console.warn(output);
    this.writeToFile(output);
  }

  public error(message: string, error?: unknown): void {
    const output = this.formatMessage(LogLevel.ERROR, `LOUD ERROR: ${message}`, error);
    console.error(output);
    this.writeToFile(output);
  }

  public getLogFilePath(): string {
    return this.logFilePath ?? '';
  }
}

export const logger = new Logger();
