/**
 * @fileoverview Main controller for the Desktop Widget overlay managing WebSocket events,
 * stack layout, collapse states, and slam impact animations.
 */

import { CardRenderer } from './card_renderer.js';
import { ProgressHud } from './progress_hud.js';
import { AchievementDefinition } from '../../types/achievement.js';
import { DailyState } from '../../types/state.js';
import { HistoryStorage } from '../../types/history.js';
import { LEAGUE_DEFINITIONS, LeagueTier, ProgressSnapshot } from '../../types/progress.js';
import { WebSocketMessage } from '../../types/websocket_events.js';

declare global {
  interface Window {
    desktopBridge?: {
      openDashboard: (url?: string) => void;
      onReset: (callback: () => void) => void;
    };
  }
}

export class WidgetController {
  /**
   * Event-relative time at which the card settles into place, matching the
   * audible impact of the unlock sound (~400ms into the file plus ~50ms of
   * audio output latency).
   */
  private static readonly UNLOCK_LANDING_MS = 450;

  /**
   * Total unlock animation duration before animation classes are removed.
   */
  private static readonly UNLOCK_CLEANUP_MS = 1500;

  private stackElement: HTMLElement;
  private cardRenderer: CardRenderer;
  private progressHud: ProgressHud;
  private unlockSound: HTMLAudioElement | null = null;
  private leagueUpSound: HTMLAudioElement | null = null;
  private socket: WebSocket | null = null;

  private achievementsMap: Map<string, AchievementDefinition> = new Map();
  private historyState: HistoryStorage = { streaks: {}, logs: [] };
  private maxVisibleCards: number = 4;
  private lastLeagueId: LeagueTier | null = null;

  public constructor() {
    const stack = document.getElementById('cards-stack');
    const hudRoot = document.getElementById('progress-hud');

    if (!stack || !hudRoot) {
      throw new Error('Required DOM elements missing for WidgetController.');
    }

    this.stackElement = stack;
    this.cardRenderer = new CardRenderer();
    this.progressHud = new ProgressHud(hudRoot, () => this.openDashboard());

    this.setupUnlockSound();
    this.setupLeagueUpSound();

    this.setupClickHandler();
    this.connectWebSocket();
  }

  private setupClickHandler(): void {
    this.stackElement.addEventListener('click', (event: MouseEvent) => {
      const targetCard = (event.target as HTMLElement).closest('.achievement-card');
      if (targetCard) {
        this.openDashboard();
      }
    });
  }

  /**
   * Loads the first unlock sound asset found, in order of format preference.
   */
  private async setupUnlockSound(): Promise<void> {
    this.unlockSound = await this.loadSound(
      ['/sounds/unlock.mp3', '/sounds/unlock.ogg', '/sounds/unlock.wav'],
      0.4
    );
    if (!this.unlockSound) {
      console.warn('No unlock sound found in /sounds (unlock.mp3, unlock.ogg or unlock.wav). Unlocks will be silent.');
    }
  }

  /**
   * Loads the promotion fanfare played when the user climbs to a higher league.
   */
  private async setupLeagueUpSound(): Promise<void> {
    this.leagueUpSound = await this.loadSound(['/sounds/league-up.mp3'], 0.4);
    if (!this.leagueUpSound) {
      console.warn('No league-up sound found at /sounds/league-up.mp3. League promotions will be silent.');
    }
  }

  /**
   * Probes the candidate URLs and returns the first one available as a
   * preloaded audio element, or null when none can be loaded.
   */
  private async loadSound(candidates: string[], volume: number): Promise<HTMLAudioElement | null> {
    for (const url of candidates) {
      try {
        const probe = await fetch(url, { method: 'HEAD' });
        if (!probe.ok) {
          continue;
        }
        const sound = new Audio(url);
        sound.preload = 'auto';
        sound.volume = volume;
        return sound;
      } catch (probeError) {
        console.warn(`Sound probe failed for ${url}:`, probeError);
      }
    }
    return null;
  }

  private playSound(sound: HTMLAudioElement | null, soundName: string): void {
    if (!sound) {
      return;
    }
    sound.currentTime = 0;
    sound.play().catch((playError: unknown) => {
      console.error(`Failed to play ${soundName}:`, playError);
    });
  }

  private openDashboard(): void {
    if (window.desktopBridge) {
      window.desktopBridge.openDashboard();
    } else {
      window.open('/dashboard', '_blank');
    }
  }

  private connectWebSocket(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${protocol}//${window.location.host}/ws`;

    this.socket = new WebSocket(socketUrl);

    this.socket.onopen = () => {
      console.log('Connected to desktop widget WebSocket stream.');
    };

    this.socket.onmessage = (event: MessageEvent) => {
      try {
        const message: WebSocketMessage<any> = JSON.parse(event.data);
        this.handleWebSocketEvent(message);
      } catch (parseError) {
        console.error('Error handling WebSocket message:', parseError);
      }
    };

    this.socket.onclose = () => {
      console.warn('WebSocket connection lost. Reconnecting in 3 seconds...');
      setTimeout(() => this.connectWebSocket(), 3000);
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket encountered error:', error);
    };
  }

  private handleWebSocketEvent(message: WebSocketMessage<any>): void {
    switch (message.type) {
      case 'INIT_STATE': {
        const payload = message.payload as {
          achievements: AchievementDefinition[];
          state: DailyState;
          history: HistoryStorage;
          progress?: ProgressSnapshot;
        };
        this.initializeState(payload.achievements, payload.state, payload.history);
        if (payload.progress) {
          this.handleProgressSnapshot(payload.progress);
        } else {
          this.refreshProgress();
        }
        break;
      }
      case 'ACHIEVEMENT_UNLOCKED': {
        const payload = message.payload as {
          achievement: AchievementDefinition;
          unlockedAt: string;
        };
        this.handleAchievementUnlocked(payload.achievement);
        this.refreshProgress();
        break;
      }
      case 'ACHIEVEMENT_REVOKED': {
        const payload = message.payload as { achievementId: string };
        this.handleAchievementRevoked(payload.achievementId);
        this.refreshProgress();
        break;
      }
      case 'MIDNIGHT_RESET': {
        this.handleMidnightReset();
        this.refreshProgress();
        break;
      }
      case 'ACHIEVEMENT_UPDATED': {
        const updated = message.payload as AchievementDefinition;
        this.achievementsMap.set(updated.id, updated);
        this.cardRenderer.injectCustomCss(updated);
        this.updateCardContent(updated);
        this.refreshProgress();
        break;
      }
      case 'ACHIEVEMENT_DELETED': {
        const deletedId = message.payload as string;
        this.achievementsMap.delete(deletedId);
        this.handleAchievementRevoked(deletedId);
        this.refreshProgress();
        break;
      }
      case 'HISTORY_CLEARED': {
        this.refreshProgress();
        break;
      }
      default:
        break;
    }
  }

  private async refreshProgress(): Promise<void> {
    try {
      const response = await fetch('/api/progress');
      const result = await response.json();
      if (result.success) {
        this.handleProgressSnapshot(result.data);
      }
    } catch (progressError) {
      console.error('Failed to refresh progress snapshot:', progressError);
    }
  }

  /**
   * Updates the HUD with a new progress snapshot and plays the promotion
   * fanfare when the snapshot reflects a climb to a higher league. The first
   * snapshot after load establishes the baseline without a fanfare.
   */
  private handleProgressSnapshot(snapshot: ProgressSnapshot): void {
    const previousLeagueId = this.lastLeagueId;
    this.lastLeagueId = snapshot.leagueId;

    if (previousLeagueId !== null && previousLeagueId !== snapshot.leagueId) {
      const previousRank = LEAGUE_DEFINITIONS.findIndex((league) => league.id === previousLeagueId);
      const currentRank = LEAGUE_DEFINITIONS.findIndex((league) => league.id === snapshot.leagueId);
      if (previousRank >= 0 && currentRank > previousRank) {
        this.playSound(this.leagueUpSound, 'league promotion sound');
      }
    }

    this.progressHud.update(snapshot);
  }

  private initializeState(
    achievements: AchievementDefinition[],
    state: DailyState,
    history: HistoryStorage
  ): void {
    this.achievementsMap.clear();
    for (const achievement of achievements) {
      this.achievementsMap.set(achievement.id, achievement);
    }
    this.historyState = history;

    this.stackElement.innerHTML = '';

    for (const unlockRecord of state.activeUnlocks) {
      const definition = this.achievementsMap.get(unlockRecord.achievementId);
      if (definition) {
        const streak = this.historyState.streaks[definition.id];
        const cardElement = this.cardRenderer.createCardElement(definition, streak);
        this.stackElement.appendChild(cardElement);
      }
    }

    this.updateCollapseState();
  }

  private handleAchievementUnlocked(achievement: AchievementDefinition): void {
    this.achievementsMap.set(achievement.id, achievement);

    const existingCard = document.getElementById(`card-${achievement.id}`);
    if (existingCard) {
      return;
    }

    this.playUnlockSound();
    this.spawnUnlockingCard(achievement.id);
  }

  private playUnlockSound(): void {
    this.playSound(this.unlockSound, 'unlock sound');
  }

  private spawnUnlockingCard(achievementId: string): void {
    const achievement = this.achievementsMap.get(achievementId);
    const existingCard = document.getElementById(`card-${achievementId}`);
    if (!achievement || existingCard) {
      return;
    }

    const streak = this.historyState.streaks[achievement.id];
    const newCard = this.cardRenderer.createCardElement(achievement, streak);
    newCard.classList.add('unlocking');

    this.stackElement.appendChild(newCard);

    setTimeout(() => {
      this.triggerContainerNudge();
    }, WidgetController.UNLOCK_LANDING_MS);

    setTimeout(() => {
      newCard.classList.remove('unlocking');
      this.updateCollapseState();
    }, WidgetController.UNLOCK_CLEANUP_MS);
  }

  private triggerContainerNudge(): void {
    this.stackElement.classList.remove('cards-container-shake');
    void this.stackElement.offsetWidth;
    this.stackElement.classList.add('cards-container-shake');
  }

  private handleAchievementRevoked(achievementId: string): void {
    const cardElement = document.getElementById(`card-${achievementId}`);
    if (cardElement) {
      cardElement.classList.add('card-removing');
      setTimeout(() => {
        cardElement.remove();
        this.cardRenderer.removeCustomCss(achievementId);
        this.updateCollapseState();
      }, 300);
    }
  }

  private handleMidnightReset(): void {
    const allCards = this.stackElement.querySelectorAll('.achievement-card');
    for (const card of allCards) {
      card.classList.add('card-removing');
    }
    setTimeout(() => {
      for (const card of Array.from(this.stackElement.querySelectorAll('.achievement-card'))) {
        const achievementId = (card as HTMLElement).dataset.achievementId;
        if (achievementId) {
          this.cardRenderer.removeCustomCss(achievementId);
        }
      }
      this.stackElement.innerHTML = '';
      this.updateCollapseState();
    }, 350);
  }

  private updateCardContent(achievement: AchievementDefinition): void {
    const cardElement = document.getElementById(`card-${achievement.id}`);
    if (!cardElement) {
      return;
    }

    const titleEl = cardElement.querySelector('.achievement-title');
    const descEl = cardElement.querySelector('.achievement-description');
    const imgEl = cardElement.querySelector('.card-artwork-wrapper img') as HTMLImageElement;

    if (titleEl) titleEl.textContent = achievement.title;
    if (descEl) descEl.textContent = achievement.description;
    if (imgEl) imgEl.src = `/images/${achievement.imageFileName}`;
  }

  private updateCollapseState(): void {
    const cards = Array.from(this.stackElement.querySelectorAll('.achievement-card')) as HTMLElement[];
    const shouldCollapse = cards.length > this.maxVisibleCards;

    cards.forEach((card, index) => {
      if (shouldCollapse && index < cards.length - this.maxVisibleCards) {
        card.classList.add('collapsed');
      } else {
        card.classList.remove('collapsed');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new WidgetController();
});
