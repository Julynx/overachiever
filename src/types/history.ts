/**
 * @fileoverview Defines interfaces for recording historical achievements
 * and computing consecutive daily streaks.
 */

import { AchievementDefinition } from './achievement.js';
import { RarityTier } from './rarity.js';

/**
 * Tracks streak metrics for a specific achievement identifier.
 */
export interface StreakMetric {
  /**
   * Number of consecutive days completed up to the most recent unlock.
   */
  currentStreak: number;

  /**
   * Highest recorded streak for this achievement.
   */
  longestStreak: number;

  /**
   * YYYY-MM-DD date representation of the most recent completion.
   */
  lastCompletedDate: string;
}

/**
 * Individual log entry recording when an achievement was unlocked.
 */
export interface HistoricalLogEntry {
  achievementId: string;
  unlockedAt: string;
  calendarDate: string;

  /**
   * XP awarded for this unlock, persisted so history-derived progression stays
   * stable even if the achievement's rarity changes or it is deleted later.
   * Entries written before this field existed fall back to the achievement's
   * current rarity at computation time.
   */
  xp?: number;
}

/**
 * Display metadata captured when an achievement with historical records is
 * deleted, so history views keep rendering human-readable titles and calendar
 * dot colors after the definition is removed from the checklist.
 */
export interface DeletedAchievementRecord {
  title: string;
  rarity?: RarityTier;
}

/**
 * Full historical storage model.
 */
export interface HistoryStorage {
  streaks: Record<string, StreakMetric>;
  logs: HistoricalLogEntry[];

  /**
   * Tombstones for deleted achievements that still have historical records.
   * Live definitions take precedence when resolving display metadata.
   */
  deletedAchievements?: Record<string, DeletedAchievementRecord>;
}

/**
 * Resolved display metadata for an achievement referenced by history.
 */
export interface AchievementDisplayInfo {
  title: string;
  rarity?: RarityTier;
}

/**
 * Builds a lookup of achievement display metadata, preferring live
 * definitions and falling back to deletion tombstones.
 */
export function buildAchievementLookup(
  achievements: AchievementDefinition[],
  deletedAchievements: Record<string, DeletedAchievementRecord> | undefined
): Map<string, AchievementDisplayInfo> {
  const lookup = new Map<string, AchievementDisplayInfo>();
  for (const [achievementId, record] of Object.entries(deletedAchievements ?? {})) {
    lookup.set(achievementId, { title: record.title, rarity: record.rarity });
  }
  for (const achievement of achievements) {
    lookup.set(achievement.id, { title: achievement.title, rarity: achievement.rarity });
  }
  return lookup;
}
