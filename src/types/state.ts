/**
 * @fileoverview Defines daily unlock state interfaces.
 */

/**
 * Tracks an achievement that has been unlocked during the active calendar day.
 */
export interface ActiveUnlockRecord {
  /**
   * The achievement identifier linked to an AchievementDefinition.
   */
  achievementId: string;

  /**
   * ISO 8601 timestamp at the moment of unlock.
   */
  unlockedAt: string;
}

/**
 * Represents the persistent daily state reset every night at 00:00.
 */
export interface DailyState {
  /**
   * Calendar date formatted as YYYY-MM-DD representing the current day.
   */
  currentDate: string;

  /**
   * List of achievements completed today.
   */
  activeUnlocks: ActiveUnlockRecord[];
}
