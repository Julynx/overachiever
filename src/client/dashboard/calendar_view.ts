/**
 * @fileoverview Renders the unlock history as a month calendar grid with per-day
 * rarity-colored dots and hover tooltips listing the achievements unlocked that day.
 */

import { buildAchievementLookup, HistoryStorage } from '../../types/history.js';
import { AchievementDefinition } from '../../types/achievement.js';
import { RarityTier } from '../../types/rarity.js';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class CalendarView {
  private container: HTMLElement;
  private viewedYear: number;
  private viewedMonth: number;
  private unlocksByDate: Map<string, { title: string; rarity: RarityTier | undefined }[]> = new Map();

  public constructor(container: HTMLElement) {
    this.container = container;
    const now = new Date();
    this.viewedYear = now.getFullYear();
    this.viewedMonth = now.getMonth();
  }

  public render(history: HistoryStorage, achievements: AchievementDefinition[]): void {
    const achievementLookup = buildAchievementLookup(achievements, history.deletedAchievements);

    this.unlocksByDate = new Map();
    for (const log of history.logs) {
      const display = achievementLookup.get(log.achievementId);
      const entry = {
        title: display ? display.title : log.achievementId,
        rarity: display?.rarity,
      };
      const dayEntries = this.unlocksByDate.get(log.calendarDate);
      if (dayEntries) {
        dayEntries.push(entry);
      } else {
        this.unlocksByDate.set(log.calendarDate, [entry]);
      }
    }

    this.renderMonth();
  }

  private renderMonth(): void {
    const firstDay = new Date(this.viewedYear, this.viewedMonth, 1);
    const daysInMonth = new Date(this.viewedYear, this.viewedMonth + 1, 0).getDate();
    const firstWeekdayIndex = (firstDay.getDay() + 6) % 7;
    const today = new Date();
    const todayKey = this.formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

    let weekdayCells = '';
    for (const label of WEEKDAY_LABELS) {
      weekdayCells += `<div class="calendar-weekday">${label}</div>`;
    }

    let dayCells = '';
    for (let padding = 0; padding < firstWeekdayIndex; padding++) {
      dayCells += '<div class="calendar-day other-month"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = this.formatDateKey(this.viewedYear, this.viewedMonth, day);
      const dayEntries = this.unlocksByDate.get(dateKey) ?? [];
      const isToday = dateKey === todayKey ? ' is-today' : '';

      let dots = '';
      let tooltipEntries = '';
      for (const entry of dayEntries) {
        const rarityKey = entry.rarity ?? 'none';
        dots += `<span class="rarity-dot" data-rarity="${rarityKey}"></span>`;
        tooltipEntries += `<span class="rarity-title" data-rarity="${rarityKey}">${escapeHtml(entry.title)}</span>`;
      }

      const tooltip = dayEntries.length > 0
        ? `<div class="calendar-tooltip">${tooltipEntries}</div>`
        : '';

      dayCells += `
        <div class="calendar-day${isToday}">
          <span class="calendar-day-number">${day}</span>
          <div class="calendar-dots">${dots}</div>
          ${tooltip}
        </div>
      `;
    }

    this.container.innerHTML = `
      <div class="calendar-toolbar">
        <button class="calendar-nav-btn" data-direction="prev" type="button" aria-label="Previous month">&lsaquo;</button>
        <span class="calendar-month-label">${MONTH_LABELS[this.viewedMonth]} ${this.viewedYear}</span>
        <button class="calendar-nav-btn" data-direction="next" type="button" aria-label="Next month">&rsaquo;</button>
      </div>
      <div class="calendar-grid">
        ${weekdayCells}
        ${dayCells}
      </div>
    `;

    const previousButton = this.container.querySelector('[data-direction="prev"]') as HTMLElement;
    const nextButton = this.container.querySelector('[data-direction="next"]') as HTMLElement;
    previousButton.addEventListener('click', () => this.shiftMonth(-1));
    nextButton.addEventListener('click', () => this.shiftMonth(1));
  }

  private shiftMonth(delta: number): void {
    const shifted = new Date(this.viewedYear, this.viewedMonth + delta, 1);
    this.viewedYear = shifted.getFullYear();
    this.viewedMonth = shifted.getMonth();
    this.renderMonth();
  }

  private formatDateKey(year: number, monthIndex: number, day: number): string {
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
}
