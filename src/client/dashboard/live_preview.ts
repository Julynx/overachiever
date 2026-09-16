/**
 * @fileoverview Live preview component rendering the achievement card
 * with real-time CSS stylesheet injection during editing.
 */

import { RarityTier, generateRarityCss, RARITY_DEFINITIONS } from '../../types/rarity.js';

export class LivePreviewManager {
  private previewContainer: HTMLElement;
  private previewStyleElement: HTMLStyleElement;

  public constructor(containerElement: HTMLElement) {
    this.previewContainer = containerElement;

    let styleEl = document.getElementById('preview-dynamic-style') as HTMLStyleElement;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'preview-dynamic-style';
      document.head.appendChild(styleEl);
    }
    this.previewStyleElement = styleEl;
  }

  public update(
    id: string,
    title: string,
    description: string,
    imageSrc: string,
    cssOrRarity: string
  ): void {
    const previewCardId = `card-preview-${id || 'new'}`;

    let scopedCss: string;
    if (cssOrRarity in RARITY_DEFINITIONS) {
      scopedCss = generateRarityCss(cssOrRarity as RarityTier, previewCardId);
    } else {
      scopedCss = cssOrRarity
        .replace(new RegExp(`#card-${id || 'new'}`, 'g'), `#${previewCardId}`)
        .replace(/#card-[a-z0-9_-]+/g, `#${previewCardId}`);
    }

    this.previewStyleElement.textContent = scopedCss;

    this.previewContainer.innerHTML = `
      <div id="${previewCardId}" class="achievement-card">
        <div class="card-artwork-wrapper">
          <img src="${imageSrc || '/images/default_badge.svg'}" alt="Preview" />
        </div>
        <div class="card-body">
          <h3 class="achievement-title">${title || 'Achievement Title'}</h3>
          <p class="achievement-description">${description || 'Achievement description text will appear here.'}</p>
        </div>
      </div>
    `;
  }
}
