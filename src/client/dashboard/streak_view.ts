/**
 * @fileoverview Visualizes consecutive daily streak metrics per achievement.
 */

import { buildAchievementLookup, HistoryStorage } from '../../types/history.js';
import { AchievementDefinition } from '../../types/achievement.js';

export class StreakViewRenderer {
  private streaksContainer: HTMLElement;

  public constructor(streaksEl: HTMLElement) {
    this.streaksContainer = streaksEl;
  }

  public render(history: HistoryStorage, achievements: AchievementDefinition[]): void {
    const achievementLookup = buildAchievementLookup(achievements, history.deletedAchievements);
    const achievementIds = Object.keys(history.streaks);

    if (achievementIds.length === 0) {
      this.streaksContainer.innerHTML =
        '<p class="empty-state-text">No streak records yet. Complete your first daily achievement to start a streak.</p>';
      return;
    }

    let rowsHtml = '';
    for (const id of achievementIds) {
      const metric = history.streaks[id];
      const display = achievementLookup.get(id);
      const title = display ? display.title : id;

      rowsHtml += `
        <tr>
          <td data-label="Achievement"><strong>${title}</strong></td>
          <td data-label="Current Streak" style="color: var(--lighter-orange); font-weight: 700;">★ ${metric.currentStreak} day${metric.currentStreak === 1 ? '' : 's'}</td>
          <td data-label="Longest Streak" style="color: var(--lighter-blue);">${metric.longestStreak} day${metric.longestStreak === 1 ? '' : 's'}</td>
          <td data-label="Last Completed" style="color: var(--light-gray);">${metric.lastCompletedDate || 'Never'}</td>
        </tr>
      `;
    }

    this.streaksContainer.innerHTML = `
      <table class="history-table">
        <thead>
          <tr>
            <th>Achievement</th>
            <th>Current streak</th>
            <th>Longest streak</th>
            <th>Last completed</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }
}
