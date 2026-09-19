/**
 * @fileoverview Renders the unlock history as a month calendar grid with per-day
 * rarity-colored dots, hover tooltips, and an interactive day review modal allowing
 * users to review, add, or revoke achievements for any past or current calendar day.
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

function formatHeaderDate(dateKey: string): string {
  const [yearString, monthString, dayString] = dateKey.split('-');
  const dateInstance = new Date(Number(yearString), Number(monthString) - 1, Number(dayString));
  return dateInstance.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export type DaySaveHandler = (calendarDate: string, achievementIds: string[]) => Promise<void>;

interface DayReviewItem {
  id: string;
  title: string;
  description: string;
  imageFileName: string;
  rarity?: RarityTier;
  isChecked: boolean;
}

export class CalendarView {
  private container: HTMLElement;
  private viewedYear: number;
  private viewedMonth: number;
  private unlocksByDate: Map<string, { title: string; rarity: RarityTier | undefined }[]> = new Map();
  private latestHistory: HistoryStorage = { streaks: {}, logs: [] };
  private latestAchievements: AchievementDefinition[] = [];
  private saveHandler?: DaySaveHandler;
  private modalBackdropElement: HTMLElement | null = null;
  private activeEscapeListener: ((event: KeyboardEvent) => void) | null = null;

  public constructor(container: HTMLElement, onSaveDay?: DaySaveHandler) {
    this.container = container;
    this.saveHandler = onSaveDay;
    const now = new Date();
    this.viewedYear = now.getFullYear();
    this.viewedMonth = now.getMonth();

    this.setupGridListeners();
  }

  public setSaveHandler(handler: DaySaveHandler): void {
    this.saveHandler = handler;
  }

  private setupGridListeners(): void {
    this.container.addEventListener('click', (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      const navButton = target.closest('.calendar-nav-btn') as HTMLElement | null;
      if (navButton) {
        const direction = navButton.dataset.direction;
        if (direction === 'prev') {
          this.shiftMonth(-1);
        } else if (direction === 'next') {
          this.shiftMonth(1);
        }
        return;
      }

      const dayElement = target.closest('.calendar-day.is-interactive') as HTMLElement | null;
      if (dayElement && dayElement.dataset.date) {
        this.openDayModal(dayElement.dataset.date);
      }
    });

    this.container.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        const target = event.target as HTMLElement;
        const dayElement = target.closest('.calendar-day.is-interactive') as HTMLElement | null;
        if (dayElement && dayElement.dataset.date) {
          event.preventDefault();
          this.openDayModal(dayElement.dataset.date);
        }
      }
    });
  }

  public render(history: HistoryStorage, achievements: AchievementDefinition[]): void {
    this.latestHistory = history;
    this.latestAchievements = achievements;

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
    for (let padding = 0; padding < firstWeekdayIndex; padding += 1) {
      dayCells += '<div class="calendar-day other-month"></div>';
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = this.formatDateKey(this.viewedYear, this.viewedMonth, day);
      const dayEntries = this.unlocksByDate.get(dateKey) ?? [];
      const isToday = dateKey === todayKey ? ' is-today' : '';
      const isFuture = dateKey > todayKey;
      const interactiveClass = isFuture ? ' is-future' : ' is-interactive';
      const accessibilityAttributes = isFuture
        ? ''
        : ` tabindex="0" role="button" aria-label="Review achievements for ${dateKey}"`;

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
        <div class="calendar-day${isToday}${interactiveClass}" data-date="${dateKey}"${accessibilityAttributes}>
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

  private ensureModalElement(): HTMLElement {
    if (!this.modalBackdropElement) {
      let element = document.getElementById('day-review-modal');
      if (!element) {
        element = document.createElement('div');
        element.id = 'day-review-modal';
        element.className = 'day-modal-backdrop';
        element.setAttribute('role', 'dialog');
        element.setAttribute('aria-modal', 'true');
        document.body.appendChild(element);
      }
      this.modalBackdropElement = element;
    }
    return this.modalBackdropElement;
  }

  private openDayModal(calendarDate: string): void {
    const modalBackdrop = this.ensureModalElement();

    const unlockedIdsOnDate = new Set(
      this.latestHistory.logs
        .filter((log) => log.calendarDate === calendarDate)
        .map((log) => log.achievementId)
    );

    const activeIds = new Set(this.latestAchievements.map((item) => item.id));
    const itemsToReview: DayReviewItem[] = this.latestAchievements.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      imageFileName: item.imageFileName,
      rarity: item.rarity,
      isChecked: unlockedIdsOnDate.has(item.id),
    }));

    const deletedTombstones = this.latestHistory.deletedAchievements ?? {};
    for (const unlockedId of unlockedIdsOnDate) {
      if (!activeIds.has(unlockedId)) {
        const tombstone = deletedTombstones[unlockedId];
        itemsToReview.push({
          id: unlockedId,
          title: tombstone ? `${tombstone.title} (archived)` : `${unlockedId} (archived)`,
          description: 'Achievement definition no longer in the active checklist.',
          imageFileName: 'default_badge.svg',
          rarity: tombstone?.rarity,
          isChecked: true,
        });
      }
    }

    const workingSelections = new Set<string>(unlockedIdsOnDate);

    let rowsHtml = '';
    if (itemsToReview.length === 0) {
      rowsHtml = '<p class="empty-state-text">No achievements defined in the checklist view.</p>';
    } else {
      for (const item of itemsToReview) {
        const checkedAttribute = workingSelections.has(item.id) ? 'checked' : '';
        const rowCheckedClass = workingSelections.has(item.id) ? ' checked' : '';
        const rarityClass = ` rarity-${item.rarity || 'common'}`;

        rowsHtml += `
          <label class="day-modal-row${rowCheckedClass}" data-id="${item.id}">
            <input type="checkbox" class="day-modal-checkbox" data-id="${item.id}" ${checkedAttribute} />
            <img class="day-modal-thumb" src="/images/${escapeHtml(item.imageFileName)}" alt="${escapeHtml(item.title)}" />
            <div class="day-modal-info">
              <span class="day-modal-row-title${rarityClass}">${escapeHtml(item.title)}</span>
              <span class="day-modal-row-desc">${escapeHtml(item.description)}</span>
            </div>
          </label>
        `;
      }
    }

    modalBackdrop.innerHTML = `
      <div class="day-modal-dialog">
        <div class="day-modal-header">
          <div class="day-modal-title-group">
            <h3 class="day-modal-title">${escapeHtml(formatHeaderDate(calendarDate))}</h3>
            <span class="day-modal-badge" id="day-modal-counter">${workingSelections.size} of ${itemsToReview.length} completed</span>
          </div>
          <button type="button" class="day-modal-close-btn" aria-label="Close dialog">&times;</button>
        </div>
        <div class="day-modal-body" id="day-modal-list">
          ${rowsHtml}
        </div>
        <div class="day-modal-footer">
          <button type="button" class="btn-secondary day-modal-btn-cancel">Cancel</button>
          <button type="button" class="btn-primary day-modal-btn-save">Save</button>
        </div>
      </div>
    `;

    const counterElement = modalBackdrop.querySelector('#day-modal-counter') as HTMLElement;
    const updateCounterDisplay = (): void => {
      if (counterElement) {
        counterElement.textContent = `${workingSelections.size} of ${itemsToReview.length} completed`;
      }
    };

    const rowsListElement = modalBackdrop.querySelector('#day-modal-list') as HTMLElement;
    rowsListElement.addEventListener('change', (event: Event) => {
      const checkbox = event.target as HTMLInputElement;
      if (checkbox && checkbox.classList.contains('day-modal-checkbox')) {
        const achievementId = checkbox.dataset.id;
        if (achievementId) {
          if (checkbox.checked) {
            workingSelections.add(achievementId);
          } else {
            workingSelections.delete(achievementId);
          }
          const parentRow = checkbox.closest('.day-modal-row');
          parentRow?.classList.toggle('checked', checkbox.checked);
          updateCounterDisplay();
        }
      }
    });

    const closeButton = modalBackdrop.querySelector('.day-modal-close-btn') as HTMLElement;
    const cancelButton = modalBackdrop.querySelector('.day-modal-btn-cancel') as HTMLElement;
    const saveButton = modalBackdrop.querySelector('.day-modal-btn-save') as HTMLButtonElement;

    closeButton.addEventListener('click', () => this.closeDayModal());
    cancelButton.addEventListener('click', () => this.closeDayModal());

    modalBackdrop.addEventListener('click', (event: MouseEvent) => {
      if (event.target === modalBackdrop) {
        this.closeDayModal();
      }
    });

    saveButton.addEventListener('click', async () => {
      saveButton.disabled = true;
      saveButton.textContent = 'Saving...';
      try {
        if (this.saveHandler) {
          await this.saveHandler(calendarDate, Array.from(workingSelections));
        }
        this.closeDayModal();
      } catch (saveError) {
        saveButton.disabled = false;
        saveButton.textContent = 'Save';
        alert(`Error saving day achievements: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
      }
    });

    if (this.activeEscapeListener) {
      document.removeEventListener('keydown', this.activeEscapeListener);
    }
    this.activeEscapeListener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.closeDayModal();
      }
    };
    document.addEventListener('keydown', this.activeEscapeListener);

    modalBackdrop.classList.add('open');
  }

  private closeDayModal(): void {
    if (this.modalBackdropElement) {
      this.modalBackdropElement.classList.remove('open');
    }
    if (this.activeEscapeListener) {
      document.removeEventListener('keydown', this.activeEscapeListener);
      this.activeEscapeListener = null;
    }
  }
}
