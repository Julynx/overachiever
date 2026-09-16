/**
 * @fileoverview Builds achievement card DOM nodes and manages scoped CSS stylesheet injection.
 */

import { AchievementDefinition } from '../../types/achievement.js';
import { StreakMetric } from '../../types/history.js';

export class CardRenderer {
  private stylesContainer: HTMLElement;

  public constructor() {
    let container = document.getElementById('dynamic-styles-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'dynamic-styles-container';
      document.head.appendChild(container);
    }
    this.stylesContainer = container;
  }

  /**
   * Scopes custom CSS rules to match the achievement element identifier,
   * healing both `#card-*` and bare `#<id>` selector variants.
   */
  private scopeCss(customCss: string, achievementId: string): string {
    const targetElementId = `card-${achievementId}`;
    const bareIdPattern = new RegExp(`#${achievementId}(?![a-z0-9_-])`, 'g');
    return customCss
      .replace(/#card-[a-z0-9_-]+/g, `#${targetElementId}`)
      .replace(bareIdPattern, `#${targetElementId}`);
  }

  public injectCustomCss(achievement: AchievementDefinition): void {
    const scopedCss = this.scopeCss(achievement.customCss, achievement.id);
    const existingStyle = document.getElementById(`style-${achievement.id}`);
    if (existingStyle) {
      existingStyle.textContent = scopedCss;
      return;
    }

    const styleElement = document.createElement('style');
    styleElement.id = `style-${achievement.id}`;
    styleElement.textContent = scopedCss;
    this.stylesContainer.appendChild(styleElement);
  }

  public removeCustomCss(achievementId: string): void {
    const existingStyle = document.getElementById(`style-${achievementId}`);
    if (existingStyle) {
      existingStyle.remove();
    }
  }

  public createCardElement(
    achievement: AchievementDefinition,
    streak?: StreakMetric
  ): HTMLElement {
    this.injectCustomCss(achievement);

    const card = document.createElement('div');
    card.id = `card-${achievement.id}`;
    card.className = 'achievement-card';
    card.dataset.achievementId = achievement.id;

    const imageUrl = `/images/${achievement.imageFileName}`;

    const artworkWrapper = document.createElement('div');
    artworkWrapper.className = 'card-artwork-wrapper';
    const imageElement = document.createElement('img');
    imageElement.src = imageUrl;
    imageElement.alt = achievement.title;
    imageElement.loading = 'eager';
    artworkWrapper.appendChild(imageElement);

    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';

    const titleElement = document.createElement('h3');
    titleElement.className = 'achievement-title';
    titleElement.textContent = achievement.title;

    const descElement = document.createElement('p');
    descElement.className = 'achievement-description';
    descElement.textContent = achievement.description;

    cardBody.appendChild(titleElement);
    cardBody.appendChild(descElement);

    card.appendChild(artworkWrapper);
    card.appendChild(cardBody);

    if (streak && streak.currentStreak > 1) {
      const streakBadge = document.createElement('div');
      streakBadge.className = 'card-badge-streak';
      streakBadge.innerHTML = `★ ${streak.currentStreak}d`;
      card.appendChild(streakBadge);
    }

    return card;
  }
}
