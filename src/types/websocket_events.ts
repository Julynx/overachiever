/**
 * @fileoverview Defines real-time WebSocket protocol event payloads
 * exchanged between the server, desktop widget, and dashboard.
 */

import { AchievementDefinition } from './achievement.js';
import { DailyState } from './state.js';
import { HistoryStorage } from './history.js';

export type WebSocketEventType =
  | 'INIT_STATE'
  | 'ACHIEVEMENT_UNLOCKED'
  | 'ACHIEVEMENT_REVOKED'
  | 'MIDNIGHT_RESET'
  | 'ACHIEVEMENT_CREATED'
  | 'ACHIEVEMENT_UPDATED'
  | 'ACHIEVEMENT_DELETED'
  | 'HISTORY_CLEARED'
  | 'DAY_HISTORY_UPDATED';

export interface WebSocketMessage<T = unknown> {
  type: WebSocketEventType;
  payload: T;
}

export interface InitialStatePayload {
  achievements: AchievementDefinition[];
  state: DailyState;
  history: HistoryStorage;
}

export interface UnlockEventPayload {
  achievement: AchievementDefinition;
  unlockedAt: string;
}

export interface RevokeEventPayload {
  achievementId: string;
}

export interface ResetEventPayload {
  newDate: string;
}

export interface DayHistoryUpdatedPayload {
  calendarDate: string;
  achievementIds: string[];
}
