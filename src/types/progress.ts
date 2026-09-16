/**
 * @fileoverview Defines the XP, level, and league (ELO) progression model shared
 * by the server and both clients, plus pure computation helpers.
 */

import { RarityTier } from './rarity.js';

export type LeagueTier =
  | 'iron'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'opal'
  | 'cinder';

export interface LeagueConfig {
  id: LeagueTier;
  label: string;
  /**
   * Minimum 5-day average daily XP required for this league.
   */
  threshold: number;
}

/**
 * League tiers in ascending order. Cinder is the highest rank at 40 ELO.
 */
export const LEAGUE_DEFINITIONS: LeagueConfig[] = [
  { id: 'iron', label: 'Iron', threshold: 0 },
  { id: 'bronze', label: 'Bronze', threshold: 5 },
  { id: 'silver', label: 'Silver', threshold: 10 },
  { id: 'gold', label: 'Gold', threshold: 15 },
  { id: 'platinum', label: 'Platinum', threshold: 20 },
  { id: 'diamond', label: 'Diamond', threshold: 25 },
  { id: 'opal', label: 'Opal', threshold: 30 },
  { id: 'cinder', label: 'Cinder', threshold: 40 },
];

/**
 * XP awarded per unlock event, keyed by rarity tier. Achievements without a
 * rarity (or with the "basic" tier) award no XP.
 */
export const RARITY_XP_VALUES: Record<RarityTier, number> = {
  mythic: 12,
  legendary: 7,
  epic: 4,
  rare: 2,
  common: 1,
  basic: 0,
};

export function resolveXpForRarity(rarity: RarityTier | undefined | null): number {
  if (!rarity) {
    return 0;
  }
  return RARITY_XP_VALUES[rarity] ?? 0;
}

/**
 * XP required to advance from the given level to the next one. Level 1 is the
 * starting level; the gap grows non-linearly so that reaching level 11 from
 * level 10 costs 100 XP (20 * 10^0.7).
 */
export function xpForLevelGap(level: number): number {
  return Math.round(20 * Math.pow(level, 0.7));
}

export interface LevelProgress {
  level: number;
  currentLevelXp: number;
  levelXpRequirement: number;
  totalXp: number;
}

/**
 * Walks the cumulative level curve for a total XP amount.
 */
export function computeLevelProgress(totalXp: number): LevelProgress {
  let level = 1;
  let remaining = Math.max(0, totalXp);
  let gap = xpForLevelGap(level);
  while (remaining >= gap) {
    remaining -= gap;
    level += 1;
    gap = xpForLevelGap(level);
  }
  return {
    level,
    currentLevelXp: remaining,
    levelXpRequirement: gap,
    totalXp,
  };
}

export interface LeagueProgress {
  elo: number;
  league: LeagueConfig;
}

/**
 * Computes the ELO as the average daily XP across the five calendar days ending
 * on `todayDateString` (YYYY-MM-DD). Days without history count as 0 XP.
 *
 * @param dailyXp Map of YYYY-MM-DD to XP earned that day.
 */
export function computeLeagueProgress(dailyXp: Record<string, number>, todayDateString: string): LeagueProgress {
  const MILLISECONDS_PER_DAY = 86_400_000;
  const todayUtc = Date.UTC(
    Number(todayDateString.slice(0, 4)),
    Number(todayDateString.slice(5, 7)) - 1,
    Number(todayDateString.slice(8, 10))
  );

  let windowXp = 0;
  for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
    const date = new Date(todayUtc - dayOffset * MILLISECONDS_PER_DAY);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    windowXp += dailyXp[key] ?? 0;
  }

  const elo = windowXp / 5;
  let league = LEAGUE_DEFINITIONS[0];
  for (const candidate of LEAGUE_DEFINITIONS) {
    if (elo >= candidate.threshold) {
      league = candidate;
    }
  }
  return { elo, league };
}

export interface ProgressSnapshot extends LevelProgress, LeagueProgress {
  leagueId: LeagueTier;
  leagueLabel: string;
}

/**
 * Combines level and league computations into the snapshot served over the API.
 */
export function buildProgressSnapshot(
  totalXp: number,
  dailyXp: Record<string, number>,
  todayDateString: string
): ProgressSnapshot {
  const levelProgress = computeLevelProgress(totalXp);
  const leagueProgress = computeLeagueProgress(dailyXp, todayDateString);
  return {
    ...levelProgress,
    ...leagueProgress,
    leagueId: leagueProgress.league.id,
    leagueLabel: leagueProgress.league.label,
  };
}
