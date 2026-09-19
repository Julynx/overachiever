/**
 * @fileoverview Manages storage persistence, daily state resets, and streak calculations.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { AchievementDefinition, CreateAchievementPayload } from '../types/achievement.js';
import { DailyState, ActiveUnlockRecord } from '../types/state.js';
import { HistoryStorage, StreakMetric, HistoricalLogEntry, calculateStreakMetrics } from '../types/history.js';
import { ApplicationConfig } from '../types/config.js';
import { generateRarityCss, inferRarityFromCss, RarityTier } from '../types/rarity.js';
import { buildProgressSnapshot, resolveXpForRarity, ProgressSnapshot } from '../types/progress.js';
import { logger } from './logger.js';

export class StateManager extends EventEmitter {
  private dataDirectory: string;
  private configFilePath: string;
  private achievementsFilePath: string;
  private stateFilePath: string;
  private historyFilePath: string;

  private achievementsCache: AchievementDefinition[] = [];
  private stateCache: DailyState = { currentDate: '', activeUnlocks: [] };
  private historyCache: HistoryStorage = { streaks: {}, logs: [] };
  private configCache: ApplicationConfig = {
    port: 3030,
    host: '0.0.0.0',
    launchOnStartup: false,
    maxVisibleCardsBeforeCollapse: 4,
    collapseHeightThresholdRatio: 0.65,
  };

  /**
   * @param dataDirectory Writable directory holding config.json, achievements.json,
   * state.json, history.json, and the images/ subdirectory.
   */
  public constructor(dataDirectory: string) {
    super();
    this.dataDirectory = dataDirectory;
    this.configFilePath = path.join(this.dataDirectory, 'config.json');
    this.achievementsFilePath = path.join(this.dataDirectory, 'achievements.json');
    this.stateFilePath = path.join(this.dataDirectory, 'state.json');
    this.historyFilePath = path.join(this.dataDirectory, 'history.json');

    this.initializeStorage();
  }

  private ensureDirectoryExists(directoryPath: string): void {
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }
  }

  private loadJsonFile<T>(filePath: string, fallbackData: T): T {
    try {
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileContent) as T;
      }
    } catch (readError) {
      logger.error(`Failed to read JSON file from ${filePath}. Using fallback data.`, readError);
    }
    this.saveJsonFile(filePath, fallbackData);
    return fallbackData;
  }

  private saveJsonFile<T>(filePath: string, data: T): void {
    try {
      this.ensureDirectoryExists(path.dirname(filePath));
      const serializedData = JSON.stringify(data, null, 2);
      fs.writeFileSync(filePath, serializedData, 'utf8');
    } catch (writeError) {
      logger.error(`Critical error saving JSON data to ${filePath}`, writeError);
      throw writeError;
    }
  }

  private getTodayDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Returns the YYYY-MM-DD string one calendar day before the given date string.
   */
  private getPreviousDateString(dateString: string): string {
    const utcDate = Date.UTC(
      Number(dateString.slice(0, 4)),
      Number(dateString.slice(5, 7)) - 1,
      Number(dateString.slice(8, 10))
    );
    const previous = new Date(utcDate - 86_400_000);
    return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}-${previous.getUTCDate().toString().padStart(2, '0')}`;
  }

  /**
   * Scopes custom CSS rules to match the achievement element identifier,
   * healing both `#card-*` and bare `#<id>` selector variants.
   */
  private scopeCssToAchievementId(customCss: string, achievementId: string): string {
    const targetElementId = `card-${achievementId}`;
    const bareIdPattern = new RegExp(`#${achievementId}(?![a-z0-9_-])`, 'g');
    return customCss
      .replace(/#card-[a-z0-9_-]+/g, `#${targetElementId}`)
      .replace(bareIdPattern, `#${targetElementId}`);
  }

  private initializeStorage(): void {
    this.ensureDirectoryExists(this.dataDirectory);
    this.ensureDirectoryExists(path.join(this.dataDirectory, 'images'));

    this.configCache = this.loadJsonFile<ApplicationConfig>(this.configFilePath, this.configCache);
    this.achievementsCache = this.loadJsonFile<AchievementDefinition[]>(this.achievementsFilePath, []);

    let storageNeedsResave = false;
    this.achievementsCache = this.achievementsCache.map((achievement) => {
      let changed = false;
      let scopedCss = achievement.customCss;
      if (achievement.customCss) {
        scopedCss = this.scopeCssToAchievementId(achievement.customCss, achievement.id);
        if (scopedCss !== achievement.customCss) {
          changed = true;
        }
      }
      const rarity = achievement.rarity || inferRarityFromCss(scopedCss);
      if (rarity !== achievement.rarity) {
        changed = true;
      }
      if (changed) {
        storageNeedsResave = true;
        return { ...achievement, customCss: scopedCss, rarity };
      }
      return achievement;
    });

    if (storageNeedsResave) {
      this.saveJsonFile(this.achievementsFilePath, this.achievementsCache);
    }

    this.historyCache = this.loadJsonFile<HistoryStorage>(this.historyFilePath, { streaks: {}, logs: [] });
    this.historyCache.deletedAchievements ??= {};

    const todayDate = this.getTodayDateString();
    this.stateCache = this.loadJsonFile<DailyState>(this.stateFilePath, {
      currentDate: todayDate,
      activeUnlocks: [],
    });

    if (this.stateCache.currentDate !== todayDate) {
      logger.info(`Detected new calendar date (${todayDate} vs stored ${this.stateCache.currentDate}). Resetting active unlocks.`);
      this.performMidnightReset(todayDate);
    }
  }

  public getAllAchievements(): AchievementDefinition[] {
    return [...this.achievementsCache];
  }

  public getAchievementById(achievementId: string): AchievementDefinition | undefined {
    return this.achievementsCache.find((item) => item.id === achievementId);
  }

  public createAchievement(payload: CreateAchievementPayload): AchievementDefinition {
    const normalizedIdentifier = payload.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const existingConflict = this.achievementsCache.some((item) => item.id === normalizedIdentifier);
    const finalIdentifier = existingConflict
      ? `${normalizedIdentifier}-${Date.now().toString(36)}`
      : normalizedIdentifier;

    const chosenRarity = payload.rarity || (payload.customCss ? inferRarityFromCss(payload.customCss) : 'common');
    const rawCss = payload.customCss?.trim() || generateRarityCss(chosenRarity, finalIdentifier);
    const scopedCss = this.scopeCssToAchievementId(rawCss, finalIdentifier);

    const newAchievement: AchievementDefinition = {
      id: finalIdentifier,
      title: payload.title.trim(),
      description: payload.description.trim(),
      imageFileName: payload.imageFileName?.trim() || 'default_badge.svg',
      customCss: scopedCss,
      rarity: chosenRarity,
      createdAt: new Date().toISOString(),
    };

    this.achievementsCache.push(newAchievement);
    this.saveJsonFile(this.achievementsFilePath, this.achievementsCache);
    this.emit('achievementCreated', newAchievement);
    logger.info(`Created new achievement: ${newAchievement.title} (${newAchievement.id})`);

    return newAchievement;
  }

  public updateAchievement(
    achievementId: string,
    updates: Partial<Omit<AchievementDefinition, 'id' | 'createdAt'>>
  ): AchievementDefinition {
    const targetIndex = this.achievementsCache.findIndex((item) => item.id === achievementId);
    if (targetIndex === -1) {
      throw new Error(`Achievement with identifier "${achievementId}" was not found.`);
    }

    const currentDefinition = this.achievementsCache[targetIndex];
    let resolvedRarity = updates.rarity !== undefined ? updates.rarity : currentDefinition.rarity;
    let customCssCandidate = updates.customCss;
    if (updates.rarity && !updates.customCss) {
      customCssCandidate = generateRarityCss(updates.rarity, achievementId);
    } else if (updates.customCss && !updates.rarity) {
      resolvedRarity = inferRarityFromCss(updates.customCss);
    }

    const scopedCss = customCssCandidate !== undefined
      ? this.scopeCssToAchievementId(customCssCandidate, achievementId)
      : currentDefinition.customCss;

    const updatedDefinition: AchievementDefinition = {
      ...currentDefinition,
      title: updates.title !== undefined ? updates.title.trim() : currentDefinition.title,
      description: updates.description !== undefined ? updates.description.trim() : currentDefinition.description,
      imageFileName: updates.imageFileName !== undefined ? updates.imageFileName.trim() : currentDefinition.imageFileName,
      customCss: scopedCss,
      rarity: resolvedRarity,
    };

    this.achievementsCache[targetIndex] = updatedDefinition;
    this.saveJsonFile(this.achievementsFilePath, this.achievementsCache);
    this.emit('achievementUpdated', updatedDefinition);
    logger.info(`Updated achievement: ${updatedDefinition.title} (${updatedDefinition.id})`);

    return updatedDefinition;
  }

  public deleteAchievement(achievementId: string): boolean {
    const deletedDefinition = this.getAchievementById(achievementId);
    if (!deletedDefinition) {
      return false;
    }

    this.achievementsCache = this.achievementsCache.filter((item) => item.id !== achievementId);

    this.stateCache.activeUnlocks = this.stateCache.activeUnlocks.filter(
      (record) => record.achievementId !== achievementId
    );

    this.saveJsonFile(this.achievementsFilePath, this.achievementsCache);
    this.saveJsonFile(this.stateFilePath, this.stateCache);

    this.purgeHistoryForToday(achievementId);

    const hasRemainingHistory = this.historyCache.logs.some((log) => log.achievementId === achievementId)
      || this.historyCache.streaks[achievementId] !== undefined;
    if (hasRemainingHistory) {
      this.historyCache.deletedAchievements ??= {};
      this.historyCache.deletedAchievements[achievementId] = {
        title: deletedDefinition.title,
        rarity: deletedDefinition.rarity,
      };
      this.saveJsonFile(this.historyFilePath, this.historyCache);
    }

    this.emit('achievementDeleted', achievementId);
    logger.info(`Deleted achievement with identifier: ${achievementId}`);
    return true;
  }

  public getDailyState(): DailyState {
    const todayDate = this.getTodayDateString();
    if (this.stateCache.currentDate !== todayDate) {
      this.performMidnightReset(todayDate);
    }
    return { ...this.stateCache };
  }

  public unlockAchievement(achievementId: string): { unlockRecord: ActiveUnlockRecord; isNew: boolean } {
    const definition = this.getAchievementById(achievementId);
    if (!definition) {
      throw new Error(`Cannot unlock unknown achievement ID: ${achievementId}`);
    }

    const todayDate = this.getTodayDateString();
    if (this.stateCache.currentDate !== todayDate) {
      this.performMidnightReset(todayDate);
    }

    const existingRecord = this.stateCache.activeUnlocks.find((record) => record.achievementId === achievementId);
    if (existingRecord) {
      return { unlockRecord: existingRecord, isNew: false };
    }

    const unlockTimestamp = new Date().toISOString();
    const newRecord: ActiveUnlockRecord = {
      achievementId,
      unlockedAt: unlockTimestamp,
    };

    this.stateCache.activeUnlocks.push(newRecord);
    this.saveJsonFile(this.stateFilePath, this.stateCache);

    const xpAwarded = resolveXpForRarity(definition.rarity);
    this.updateStreaksAndHistory(achievementId, todayDate, unlockTimestamp, xpAwarded);
    this.emit('achievementUnlocked', { achievement: definition, unlockedAt: unlockTimestamp });
    logger.info(`Unlocked achievement today: "${definition.title}" (${achievementId})`);

    return { unlockRecord: newRecord, isNew: true };
  }

  public revokeAchievement(achievementId: string): boolean {
    const initialLength = this.stateCache.activeUnlocks.length;
    this.stateCache.activeUnlocks = this.stateCache.activeUnlocks.filter(
      (record) => record.achievementId !== achievementId
    );

    if (this.stateCache.activeUnlocks.length === initialLength) {
      return false;
    }

    this.saveJsonFile(this.stateFilePath, this.stateCache);
    this.purgeHistoryForToday(achievementId);
    this.emit('achievementRevoked', { achievementId });
    logger.info(`Revoked achievement unlock for ID: ${achievementId}`);
    return true;
  }

  /**
   * Recalculates streak metrics for an achievement from its recorded history logs.
   */
  private recomputeStreak(achievementId: string): void {
    const completionDates = this.historyCache.logs
      .filter((log) => log.achievementId === achievementId)
      .map((log) => log.calendarDate);

    const calculatedMetric = calculateStreakMetrics(completionDates, this.getTodayDateString());
    if (calculatedMetric) {
      this.historyCache.streaks[achievementId] = calculatedMetric;
    } else {
      delete this.historyCache.streaks[achievementId];
    }
  }

  private updateStreaksAndHistory(
    achievementId: string,
    calendarDate: string,
    unlockTimestamp: string,
    xpAwarded: number
  ): void {
    this.historyCache.logs.unshift({
      achievementId,
      calendarDate,
      unlockedAt: unlockTimestamp,
      xp: xpAwarded,
    });

    this.recomputeStreak(achievementId);
    this.saveJsonFile(this.historyFilePath, this.historyCache);
  }

  /**
   * Removes today's unlock entries for the achievement from the history log and
   * rebuilds its streak metrics so unchecking revokes XP, calendar dots, and
   * streak progress together.
   */
  private purgeHistoryForToday(achievementId: string): void {
    const todayDate = this.getTodayDateString();
    const initialLogCount = this.historyCache.logs.length;
    this.historyCache.logs = this.historyCache.logs.filter(
      (log) => !(log.achievementId === achievementId && log.calendarDate === todayDate)
    );

    if (this.historyCache.logs.length === initialLogCount) {
      return;
    }

    this.recomputeStreak(achievementId);
    this.saveJsonFile(this.historyFilePath, this.historyCache);
  }

  /**
   * Modifies the full set of achievements unlocked on a specific calendar day,
   * reconciling history logs, recalculating affected streaks, and synchronizing
   * today's active unlocks when modifying the current date.
   */
  public setDayAchievements(
    calendarDate: string,
    desiredAchievementIds: string[]
  ): { history: HistoryStorage; state: DailyState; progress: ProgressSnapshot } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) {
      throw new Error(`Invalid calendar date format: "${calendarDate}". Expected YYYY-MM-DD.`);
    }

    const todayDate = this.getTodayDateString();
    if (calendarDate > todayDate) {
      throw new Error(`Cannot modify achievements for future date: "${calendarDate}".`);
    }

    const uniqueDesiredIds = Array.from(new Set(desiredAchievementIds));
    for (const achievementId of uniqueDesiredIds) {
      const exists = this.achievementsCache.some((item) => item.id === achievementId) ||
        Boolean(this.historyCache.deletedAchievements?.[achievementId]);
      if (!exists) {
        throw new Error(`Achievement with identifier "${achievementId}" was not found.`);
      }
    }

    const desiredIdSet = new Set(uniqueDesiredIds);
    const existingLogsForDate = this.historyCache.logs.filter((log) => log.calendarDate === calendarDate);
    const existingIdsForDate = new Set(existingLogsForDate.map((log) => log.achievementId));

    const affectedAchievementIds = new Set([...existingIdsForDate, ...desiredIdSet]);

    const preservedLogs = existingLogsForDate.filter((log) => desiredIdSet.has(log.achievementId));
    const preservedIds = new Set(preservedLogs.map((log) => log.achievementId));

    const newLogs: HistoricalLogEntry[] = [];
    for (const achievementId of uniqueDesiredIds) {
      if (!preservedIds.has(achievementId)) {
        const liveDefinition = this.getAchievementById(achievementId);
        const resolvedRarity = liveDefinition?.rarity ?? this.historyCache.deletedAchievements?.[achievementId]?.rarity;
        const awardedXp = resolveXpForRarity(resolvedRarity);
        const unlockTimestamp = calendarDate === todayDate
          ? new Date().toISOString()
          : `${calendarDate}T12:00:00.000Z`;

        newLogs.push({
          achievementId,
          calendarDate,
          unlockedAt: unlockTimestamp,
          xp: awardedXp,
        });
      }
    }

    const logsFromOtherDates = this.historyCache.logs.filter((log) => log.calendarDate !== calendarDate);
    this.historyCache.logs = [...logsFromOtherDates, ...preservedLogs, ...newLogs];

    this.historyCache.logs.sort((first, second) => {
      if (first.calendarDate !== second.calendarDate) {
        return second.calendarDate.localeCompare(first.calendarDate);
      }
      return second.unlockedAt.localeCompare(first.unlockedAt);
    });

    for (const achievementId of affectedAchievementIds) {
      this.recomputeStreak(achievementId);
    }

    this.saveJsonFile(this.historyFilePath, this.historyCache);

    if (calendarDate === todayDate) {
      const activeUnlocksMap = new Map(
        this.stateCache.activeUnlocks.map((record) => [record.achievementId, record])
      );

      const nextActiveUnlocks: ActiveUnlockRecord[] = [];
      for (const achievementId of uniqueDesiredIds) {
        const existingRecord = activeUnlocksMap.get(achievementId);
        if (existingRecord) {
          nextActiveUnlocks.push(existingRecord);
        } else {
          nextActiveUnlocks.push({
            achievementId,
            unlockedAt: new Date().toISOString(),
          });
        }
      }

      this.stateCache.activeUnlocks = nextActiveUnlocks;
      this.saveJsonFile(this.stateFilePath, this.stateCache);

      for (const achievementId of uniqueDesiredIds) {
        if (!existingIdsForDate.has(achievementId)) {
          const definition = this.getAchievementById(achievementId);
          if (definition) {
            this.emit('achievementUnlocked', { achievement: definition, unlockedAt: new Date().toISOString() });
          }
        }
      }

      for (const achievementId of existingIdsForDate) {
        if (!desiredIdSet.has(achievementId)) {
          this.emit('achievementRevoked', { achievementId });
        }
      }
    }

    this.emit('dayHistoryUpdated', { calendarDate, achievementIds: uniqueDesiredIds });
    logger.info(`Updated history for date ${calendarDate}: ${uniqueDesiredIds.length} achievements unlocked.`);

    return {
      history: this.getHistory(),
      state: this.getDailyState(),
      progress: this.getProgress(),
    };
  }

  public getHistory(): HistoryStorage {
    return { ...this.historyCache };
  }

  /**
   * Derives the XP level and league (ELO) snapshot from the full unlock history.
   * Level and rank therefore persist across midnight resets and are only lost
   * when the history itself is cleared.
   */
  public getProgress(): ProgressSnapshot {
    const rarityByAchievementId = new Map<string, RarityTier | undefined>(
      this.achievementsCache.map((achievement) => [achievement.id, achievement.rarity])
    );
    for (const [achievementId, tombstone] of Object.entries(this.historyCache.deletedAchievements ?? {})) {
      if (!rarityByAchievementId.has(achievementId)) {
        rarityByAchievementId.set(achievementId, tombstone.rarity);
      }
    }

    const dailyXp: Record<string, number> = {};
    let totalXp = 0;
    for (const log of this.historyCache.logs) {
      const xp = log.xp ?? resolveXpForRarity(rarityByAchievementId.get(log.achievementId));
      totalXp += xp;
      dailyXp[log.calendarDate] = (dailyXp[log.calendarDate] ?? 0) + xp;
    }

    return buildProgressSnapshot(totalXp, dailyXp, this.getTodayDateString());
  }

  /**
   * Clears all recorded unlock logs and resets streak metrics.
   */
  public forgetHistory(): void {
    this.historyCache = { streaks: {}, logs: [], deletedAchievements: {} };
    this.saveJsonFile(this.historyFilePath, this.historyCache);
    this.emit('historyCleared');
    logger.info('Reset and cleared all historical achievement logs and streaks.');
  }

  public getConfig(): ApplicationConfig {
    return { ...this.configCache };
  }

  public updateConfig(partialConfig: Partial<ApplicationConfig>): ApplicationConfig {
    this.configCache = {
      ...this.configCache,
      ...partialConfig,
    };
    this.saveJsonFile(this.configFilePath, this.configCache);
    logger.info('Updated application configuration.');
    return this.configCache;
  }

  public performMidnightReset(customDateString?: string): void {
    const newDate = customDateString || this.getTodayDateString();
    this.stateCache = {
      currentDate: newDate,
      activeUnlocks: [],
    };
    this.saveJsonFile(this.stateFilePath, this.stateCache);
    this.emit('midnightReset', { newDate });
    logger.info(`Midnight reset performed. New calendar date is ${newDate}. All active unlocks cleared.`);
  }
}
