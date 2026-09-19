/**
 * @fileoverview Main coordinator for the LAN Web Dashboard managing tabs,
 * daily unlock toggles, WebSocket synchronization, and toast alerts.
 */

import { AchievementDefinition } from '../../types/achievement.js';
import { DailyState } from '../../types/state.js';
import { HistoryStorage } from '../../types/history.js';
import { WebSocketMessage } from '../../types/websocket_events.js';
import { AchievementFormHandler } from './achievement_form.js';
import { StreakViewRenderer } from './streak_view.js';
import { CalendarView } from './calendar_view.js';

export class DashboardController {
  private socket: WebSocket | null = null;
  private achievements: AchievementDefinition[] = [];
  private dailyState: DailyState = { currentDate: '', activeUnlocks: [] };
  private historyState: HistoryStorage = { streaks: {}, logs: [] };

  private formHandler: AchievementFormHandler;
  private streakRenderer: StreakViewRenderer;
  private calendarView: CalendarView;

  private checklistListEl: HTMLElement;
  private dateBadgeEl: HTMLElement;
  private toastEl: HTMLElement;
  private searchInput: HTMLInputElement | null = null;
  private searchTerm: string = '';
  private hamburgerBtn: HTMLButtonElement | null;
  private hamburgerMenu: HTMLElement | null;

  public constructor() {
    this.checklistListEl = (document.getElementById('achievements-list') ||
      document.getElementById('achievements-grid')) as HTMLElement;
    this.dateBadgeEl = document.getElementById('current-date-badge') as HTMLElement;
    this.toastEl = document.getElementById('toast-notification') as HTMLElement;
    this.searchInput = document.getElementById('input-search') as HTMLInputElement | null;
    this.hamburgerBtn = document.getElementById('btn-hamburger') as HTMLButtonElement | null;
    this.hamburgerMenu = document.getElementById('hamburger-menu');

    const formEl = document.getElementById('achievement-form') as HTMLFormElement;
    const previewBoxEl = document.getElementById('live-preview-box') as HTMLElement;
    const streaksContainerEl = document.getElementById('streaks-container') as HTMLElement;
    const calendarContainerEl = document.getElementById('calendar-container') as HTMLElement;

    this.streakRenderer = new StreakViewRenderer(streaksContainerEl);
    this.calendarView = new CalendarView(calendarContainerEl, (calendarDate, achievementIds) =>
      this.handleSaveDayAchievements(calendarDate, achievementIds)
    );

    this.formHandler = new AchievementFormHandler(
      formEl,
      previewBoxEl,
      () => {
        this.showToast('Achievement saved successfully.');
        this.switchTab('tab-checklist');
        this.fetchState();
      },
      () => this.switchTab('tab-checklist')
    );

    this.setupTabs();
    this.setupHamburgerMenu();
    this.setupChecklistListeners();
    this.setupForgetHistoryButton();
    this.setupSearch();
    this.connectWebSocket();
    this.fetchState();
  }

  private setupSearch(): void {
    if (!this.searchInput) {
      return;
    }

    this.searchInput.addEventListener('input', () => {
      this.searchTerm = this.searchInput!.value.trim().toLowerCase();
      this.renderChecklist();
    });
  }

  private setupHamburgerMenu(): void {
    if (!this.hamburgerBtn || !this.hamburgerMenu) {
      return;
    }

    this.hamburgerBtn.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
      const isOpen = this.hamburgerMenu!.classList.contains('open');
      this.toggleMenu(!isOpen);
    });

    document.addEventListener('click', (event: MouseEvent) => {
      if (
        this.hamburgerMenu &&
        this.hamburgerMenu.classList.contains('open') &&
        !this.hamburgerMenu.contains(event.target as Node) &&
        event.target !== this.hamburgerBtn
      ) {
        this.toggleMenu(false);
      }
    });

    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.hamburgerMenu?.classList.contains('open')) {
        this.toggleMenu(false);
      }
    });

    this.setupNetworkInfo();
    this.setupResetButton();
  }

  private toggleMenu(open: boolean): void {
    if (!this.hamburgerMenu || !this.hamburgerBtn) {
      return;
    }
    this.hamburgerMenu.classList.toggle('open', open);
    this.hamburgerBtn.setAttribute('aria-expanded', String(open));
  }

  private async setupNetworkInfo(): Promise<void> {
    const urlTextEl = document.getElementById('menu-phone-url');
    const copyBtn = document.getElementById('btn-copy-url');
    if (!urlTextEl) {
      return;
    }

    try {
      const response = await fetch('/api/network');
      const result = await response.json();
      if (result.success && result.data?.url) {
        const phoneUrl = result.data.url;
        urlTextEl.textContent = phoneUrl;

        if (copyBtn) {
          copyBtn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(phoneUrl);
              this.showToast('Copied phone URL to clipboard.');
            } catch {
              this.showToast(`Address: ${phoneUrl}`);
            }
          });
        }
      }
    } catch {
      urlTextEl.textContent = `http://${window.location.hostname}:3030`;
    }
  }

  private setupResetButton(): void {
    const resetBtn = document.getElementById('btn-menu-reset');
    if (!resetBtn) {
      return;
    }

    resetBtn.addEventListener('click', async () => {
      const confirmed = confirm('Reset all daily unlocks for today? Active streaks will be retained.');
      if (confirmed) {
        try {
          const response = await fetch('/api/reset', { method: 'POST' });
          const result = await response.json();
          if (result.success) {
            this.toggleMenu(false);
            this.showToast('Daily achievements reset.');
            this.fetchState();
          }
        } catch (resetError: any) {
          alert(`Reset error: ${resetError.message}`);
        }
      }
    });
  }

  private setupForgetHistoryButton(): void {
    const forgetBtn = document.getElementById('btn-forget-history');
    if (!forgetBtn) {
      return;
    }

    forgetBtn.addEventListener('click', async () => {
      const confirmed = confirm('Are you sure? You will lose your level and rank. This cannot be undone.');
      if (confirmed) {
        try {
          const response = await fetch('/api/history/forget', { method: 'POST' });
          const result = await response.json();
          if (result.success) {
            this.showToast('All history and streaks forgotten.');
            this.fetchState();
          }
        } catch (forgetError: any) {
          alert(`Error clearing history: ${forgetError.message}`);
        }
      }
    });
  }

  private setupChecklistListeners(): void {
    if (!this.checklistListEl) {
      return;
    }

    this.checklistListEl.addEventListener('click', (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      const toggleButton = target.closest('.toggle-btn') as HTMLElement | null;
      if (toggleButton) {
        const achievementId = toggleButton.dataset.id;
        if (achievementId) {
          const isUnlocked = toggleButton.classList.contains('btn-unlocked');
          this.toggleAchievement(achievementId, isUnlocked);
        }
        return;
      }

      const editButton = target.closest('.edit-btn') as HTMLElement | null;
      if (editButton) {
        const achievementId = editButton.dataset.id;
        if (achievementId) {
          const item = this.achievements.find((achievement) => achievement.id === achievementId);
          if (item) {
            this.editAchievement(item);
          }
        }
        return;
      }

      const deleteButton = target.closest('.delete-btn') as HTMLElement | null;
      if (deleteButton) {
        const achievementId = deleteButton.dataset.id;
        if (achievementId) {
          const item = this.achievements.find((achievement) => achievement.id === achievementId);
          if (item) {
            this.deleteAchievement(achievementId, item.title);
          }
        }
        return;
      }
    });
  }

  private setupTabs(): void {
    const tabButtons = document.querySelectorAll('.tab-btn');
    for (const button of tabButtons) {
      button.addEventListener('click', (event) => {
        const targetTab = (event.currentTarget as HTMLElement).dataset.tab;
        if (targetTab) {
          if (targetTab === 'tab-editor') {
            this.formHandler.resetForm();
          }
          this.switchTab(targetTab);
        }
      });
    }
  }

  public switchTab(tabId: string): void {
    const allTabs = document.querySelectorAll('.tab-content');
    const allButtons = document.querySelectorAll('.tab-btn');

    for (const tab of allTabs) {
      tab.classList.toggle('active', tab.id === tabId);
    }

    for (const btn of allButtons) {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.tab === tabId);
    }

    if (tabId === 'tab-history') {
      this.streakRenderer.render(this.historyState, this.achievements);
      this.calendarView.render(this.historyState, this.achievements);
    }
  }

  private connectWebSocket(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${protocol}//${window.location.host}/ws`;

    this.socket = new WebSocket(socketUrl);

    this.socket.onmessage = (event: MessageEvent) => {
      try {
        const message: WebSocketMessage<any> = JSON.parse(event.data);
        this.handleWebSocketMessage(message);
      } catch (parseError) {
        console.error('Failed to parse WebSocket message:', parseError);
      }
    };

    this.socket.onclose = () => {
      setTimeout(() => this.connectWebSocket(), 3000);
    };
  }

  private handleWebSocketMessage(message: WebSocketMessage<any>): void {
    switch (message.type) {
      case 'INIT_STATE': {
        const payload = message.payload;
        this.achievements = payload.achievements;
        this.dailyState = payload.state;
        this.historyState = payload.history;
        this.renderChecklist();
        this.streakRenderer.render(this.historyState, this.achievements);
        this.calendarView.render(this.historyState, this.achievements);
        break;
      }
      case 'ACHIEVEMENT_UNLOCKED':
      case 'ACHIEVEMENT_REVOKED':
      case 'MIDNIGHT_RESET':
      case 'ACHIEVEMENT_CREATED':
      case 'ACHIEVEMENT_UPDATED':
      case 'ACHIEVEMENT_DELETED':
      case 'HISTORY_CLEARED':
      case 'DAY_HISTORY_UPDATED': {
        this.fetchState();
        break;
      }
      default:
        break;
    }
  }

  private async fetchState(): Promise<void> {
    try {
      const [achievementsRes, stateRes, historyRes] = await Promise.all([
        fetch('/api/achievements').then((res) => res.json()),
        fetch('/api/state').then((res) => res.json()),
        fetch('/api/history').then((res) => res.json()),
      ]);

      if (achievementsRes.success) {
        this.achievements = achievementsRes.data;
      }
      if (stateRes.success) {
        this.dailyState = stateRes.data;
        if (this.dateBadgeEl) {
          this.dateBadgeEl.textContent = this.dailyState.currentDate;
        }
      }
      if (historyRes.success) {
        this.historyState = historyRes.data;
      }

      this.renderChecklist();
      this.streakRenderer.render(this.historyState, this.achievements);
      this.calendarView.render(this.historyState, this.achievements);
    } catch (fetchError) {
      console.error('Error fetching dashboard state:', fetchError);
    }
  }

  private renderChecklist(): void {
    if (!this.checklistListEl) {
      return;
    }

    if (this.achievements.length === 0) {
      this.checklistListEl.innerHTML =
        '<p class="empty-state-text">No achievements created yet. Click "Create" to create your first goal.</p>';
      return;
    }

    const activeUnlockedIds = new Set(
      this.dailyState.activeUnlocks.map((item) => item.achievementId)
    );

    const visibleAchievements = this.searchTerm
      ? this.achievements.filter((item) =>
          item.title.toLowerCase().includes(this.searchTerm) ||
          item.description.toLowerCase().includes(this.searchTerm))
      : this.achievements;

    if (visibleAchievements.length === 0) {
      this.checklistListEl.innerHTML =
        '<p class="empty-state-text">No achievements match your search.</p>';
      return;
    }

    this.checklistListEl.innerHTML = '';

    for (const item of visibleAchievements) {
      const isUnlocked = activeUnlockedIds.has(item.id);
      const streak = this.historyState.streaks[item.id];
      const streakCount = streak ? streak.currentStreak : 0;
      const streakCellHtml = streakCount > 0
        ? `<span class="streak-pill active">★ ${streakCount}d</span>`
        : '';

      const row = document.createElement('div');
      row.className = `checklist-row ${isUnlocked ? 'unlocked' : ''}`;
      row.id = `dashboard-row-${item.id}`;
      const rarityClass = ` rarity-${item.rarity || 'common'}`;

      row.innerHTML = `
        <div class="row-col-icon">
          <img class="checklist-row-thumb" src="/images/${item.imageFileName}" alt="${item.title}" />
        </div>
        <div class="row-col-title" title="${item.title}">
          <span class="row-title-text${rarityClass}">${item.title}</span>
        </div>
        <div class="row-col-desc" title="${item.description}">
          <span class="row-desc-text">${item.description}</span>
        </div>
        <div class="row-col-streak">${streakCellHtml}</div>
        <div class="row-col-actions">
          <button class="toggle-btn ${isUnlocked ? 'btn-unlocked' : 'btn-locked'}" data-id="${item.id}">
            ${isUnlocked ? '✓ Done' : 'Unlock'}
          </button>
          <button class="btn-secondary edit-btn" data-id="${item.id}">Edit</button>
          <button class="btn-danger delete-btn" data-id="${item.id}">Delete</button>
        </div>
      `;

      this.checklistListEl.appendChild(row);
    }
  }

  private async toggleAchievement(id: string, currentlyUnlocked: boolean): Promise<void> {
    const endpoint = currentlyUnlocked
      ? `/api/achievements/${id}/revoke`
      : `/api/achievements/${id}/unlock`;

    try {
      const response = await fetch(endpoint, { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        this.showToast(currentlyUnlocked ? 'Achievement locked.' : '★ Achievement unlocked!');
        await this.fetchState();
      } else {
        alert(result.error || 'Failed to update achievement status.');
      }
    } catch (toggleError: any) {
      alert(`Network error: ${toggleError.message}`);
    }
  }

  private editAchievement(achievement: AchievementDefinition): void {
    this.formHandler.populateForEdit(achievement);
    this.switchTab('tab-editor');
  }

  private async deleteAchievement(id: string, title: string): Promise<void> {
    const confirmed = confirm(`Are you sure you want to delete "${title}"?`);
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/achievements/${id}`, { method: 'DELETE' });
      const result = await response.json();

      if (result.success) {
        this.showToast(`Deleted ${title}.`);
        await this.fetchState();
      } else {
        alert(result.error || 'Failed to delete achievement.');
      }
    } catch (deleteError: any) {
      alert(`Delete error: ${deleteError.message}`);
    }
  }

  private async handleSaveDayAchievements(
    calendarDate: string,
    desiredAchievementIds: string[]
  ): Promise<void> {
    const response = await fetch(`/api/history/day/${calendarDate}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ achievementIds: desiredAchievementIds }),
    });
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to update day achievements.');
    }

    this.showToast(`Updated achievements for ${calendarDate}.`);
    await this.fetchState();
  }

  private showToast(message: string): void {
    if (!this.toastEl) {
      return;
    }
    this.toastEl.textContent = message;
    this.toastEl.classList.add('visible');
    setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, 2800);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new DashboardController();
});
