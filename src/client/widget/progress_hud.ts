/**
 * @fileoverview Renders the XP level bar and league (ELO) medal shown above the
 * desktop achievement cards. League shield artwork is loaded from
 * /images/leagues/<tier>.png when present, falling back to a colored ring.
 */

import { ProgressSnapshot } from '../../types/progress.js';

export class ProgressHud {
  private rootElement: HTMLElement;

  public constructor(rootElement: HTMLElement, onOpenDashboard: () => void) {
    this.rootElement = rootElement;
    this.rootElement.innerHTML = `
      <div class="hud-top-row">
        <span class="hud-league">Iron</span>
        <span class="hud-elo">0.0 ELO</span>
      </div>
      <div class="hud-bar-row">
        <div class="hud-bar-track"><div class="hud-bar-fill"></div></div>
        <div class="hud-level-medal"><span class="hud-level-number">1</span></div>
      </div>
      <div class="hud-bottom-row">
        <span class="hud-current-xp">0 XP</span>
        <span class="hud-level-xp">20 XP TO NEXT LEVEL</span>
      </div>
    `;

    this.rootElement.querySelector('.hud-bar-row')?.addEventListener('click', () => {
      onOpenDashboard();
    });
  }

  public update(snapshot: ProgressSnapshot): void {
    const fillPercent = Math.min(100, (snapshot.currentLevelXp / snapshot.levelXpRequirement) * 100);

    const leagueLabel = this.rootElement.querySelector('.hud-league') as HTMLElement;
    leagueLabel.textContent = snapshot.leagueLabel;
    leagueLabel.dataset.tier = snapshot.leagueId;

    const eloLabel = this.rootElement.querySelector('.hud-elo') as HTMLElement;
    eloLabel.textContent = `${snapshot.elo.toFixed(1)} ELO`;

    const fillElement = this.rootElement.querySelector('.hud-bar-fill') as HTMLElement;
    fillElement.style.width = `${fillPercent}%`;

    const medalElement = this.rootElement.querySelector('.hud-level-medal') as HTMLElement;
    medalElement.dataset.tier = snapshot.leagueId;

    const existingShield = medalElement.querySelector('.hud-league-shield');
    if (existingShield && existingShield.getAttribute('data-tier') !== snapshot.leagueId) {
      existingShield.remove();
    }
    if (!medalElement.querySelector('.hud-league-shield')) {
      const shieldImage = document.createElement('img');
      shieldImage.className = 'hud-league-shield';
      shieldImage.dataset.tier = snapshot.leagueId;
      shieldImage.alt = `${snapshot.leagueLabel} league shield`;
      shieldImage.src = `/images/leagues/${snapshot.leagueId}.png`;
      shieldImage.addEventListener('error', () => shieldImage.remove());
      medalElement.prepend(shieldImage);
    }

    const levelNumber = this.rootElement.querySelector('.hud-level-number') as HTMLElement;
    levelNumber.textContent = String(snapshot.level);

    const currentXpLabel = this.rootElement.querySelector('.hud-current-xp') as HTMLElement;
    currentXpLabel.textContent = `${snapshot.currentLevelXp} XP`;

    const xpToNextLevel = Math.max(0, snapshot.levelXpRequirement - snapshot.currentLevelXp);
    const levelXpLabel = this.rootElement.querySelector('.hud-level-xp') as HTMLElement;
    levelXpLabel.textContent = `${xpToNextLevel} XP TO NEXT LEVEL`;
  }
}
