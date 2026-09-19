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

/**
 * Converts a YYYY-MM-DD date string to an integer day number since Unix epoch.
 */
export function dateStringToUtcDay(dateString: string): number {
  const year = Number(dateString.slice(0, 4));
  const monthIndex = Number(dateString.slice(5, 7)) - 1;
  const day = Number(dateString.slice(8, 10));
  return Math.floor(Date.UTC(year, monthIndex, day) / 86_400_000);
}

/**
 * Calculates current streak, longest streak, and last completed date from a list
 * of completion dates for an achievement.
 */
export function calculateStreakMetrics(
  completionDates: string[],
  todayDateString: string
): StreakMetric | null {
  const uniqueDates = Array.from(new Set(completionDates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))).sort();
  if (uniqueDates.length === 0) {
    return null;
  }

  const dayNumbers = uniqueDates.map(dateStringToUtcDay).sort((first, second) => first - second);
  const lastCompletedDate = uniqueDates[uniqueDates.length - 1];

  let longestStreak = 0;
  let currentRun = 0;
  let previousDay = -Infinity;

  for (const day of dayNumbers) {
    if (day === previousDay + 1) {
      currentRun += 1;
    } else {
      currentRun = 1;
    }
    if (currentRun > longestStreak) {
      longestStreak = currentRun;
    }
    previousDay = day;
  }

  const todayDayNumber = dateStringToUtcDay(todayDateString);
  const lastDayNumber = dateStringToUtcDay(lastCompletedDate);

  let currentStreak = 0;
  if (lastDayNumber === todayDayNumber || lastDayNumber === todayDayNumber - 1) {
    let consecutiveEndingAtLast = 1;
    for (let index = dayNumbers.length - 1; index > 0; index -= 1) {
      if (dayNumbers[index] === dayNumbers[index - 1] + 1) {
        consecutiveEndingAtLast += 1;
      } else {
        break;
      }
    }
    currentStreak = consecutiveEndingAtLast;
  }

  return {
    currentStreak,
    longestStreak,
    lastCompletedDate,
  };
}
