/**
 * @fileoverview Defines achievement rarity tiers, color schemes, and scoped CSS generator.
 */

export type RarityTier = 'mythic' | 'legendary' | 'epic' | 'rare' | 'common' | 'basic';

export interface RarityConfig {
  id: RarityTier;
  label: string;
  gradientRgba: string;
  borderColorVar: string;
  shadowRgba: string;
  titleColorVar: string;
  descriptionColorVar: string;
}

export const RARITY_DEFINITIONS: Record<RarityTier, RarityConfig> = {
  mythic: {
    id: 'mythic',
    label: 'Mythic',
    gradientRgba: 'rgba(195, 36, 84, 0.35)',
    borderColorVar: 'var(--light-red)',
    shadowRgba: 'rgba(240, 79, 120, 0.3)',
    titleColorVar: 'var(--lighter-red)',
    descriptionColorVar: 'var(--lightest-gray)',
  },
  legendary: {
    id: 'legendary',
    label: 'Legendary',
    gradientRgba: 'rgba(247, 150, 23, 0.35)',
    borderColorVar: 'var(--light-orange)',
    shadowRgba: 'rgba(251, 185, 84, 0.3)',
    titleColorVar: 'var(--lighter-orange)',
    descriptionColorVar: 'var(--lightest-gray)',
  },
  epic: {
    id: 'epic',
    label: 'Epic',
    gradientRgba: 'rgba(144, 94, 169, 0.35)',
    borderColorVar: 'var(--light-purple)',
    shadowRgba: 'rgba(168, 132, 243, 0.3)',
    titleColorVar: 'var(--lighter-purple)',
    descriptionColorVar: 'var(--lightest-gray)',
  },
  rare: {
    id: 'rare',
    label: 'Rare',
    gradientRgba: 'rgba(77, 155, 230, 0.35)',
    borderColorVar: 'var(--light-blue)',
    shadowRgba: 'rgba(143, 211, 255, 0.3)',
    titleColorVar: 'var(--lighter-blue)',
    descriptionColorVar: 'var(--lightest-gray)',
  },
  common: {
    id: 'common',
    label: 'Common',
    gradientRgba: 'rgba(30, 188, 115, 0.35)',
    borderColorVar: 'var(--light-green)',
    shadowRgba: 'rgba(145, 219, 105, 0.3)',
    titleColorVar: 'var(--lighter-green)',
    descriptionColorVar: 'var(--lightest-gray)',
  },
  basic: {
    id: 'basic',
    label: 'Basic',
    gradientRgba: 'rgba(57, 74, 80, 0.35)',
    borderColorVar: 'var(--dark-gray)',
    shadowRgba: 'rgba(129, 151, 150, 0.2)',
    titleColorVar: 'var(--lighter-gray)',
    descriptionColorVar: 'var(--light-gray)',
  },
};

/**
 * Generates custom scoped CSS string for a specified rarity.
 * The selector is always normalized to `#card-<id>` to match the achievement
 * card element identifiers, regardless of how the target id is passed.
 */
export function generateRarityCss(rarity: RarityTier, targetElementId: string): string {
  const config = RARITY_DEFINITIONS[rarity] || RARITY_DEFINITIONS.common;
  const normalizedId = targetElementId.replace(/^#/, '').replace(/^card-/, '');
  const selector = `#card-${normalizedId}`;

  return `${selector} {
  background: linear-gradient(135deg, rgba(21, 29, 40, 0.92), ${config.gradientRgba});
  border: 1px solid ${config.borderColorVar};
  box-shadow: 0 10px 25px ${config.shadowRgba};
}
${selector} .achievement-title {
  color: ${config.titleColorVar};
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}
${selector} .achievement-description {
  color: ${config.descriptionColorVar};
  font-size: 0.85rem;
}`;
}

/**
 * Infers rarity tier from an existing custom CSS stylesheet string.
 */
export function inferRarityFromCss(css: string): RarityTier {
  if (!css) {
    return 'common';
  }
  if (css.includes('red') || css.includes('195, 36, 84')) {
    return 'mythic';
  }
  if (css.includes('orange') || css.includes('247, 150, 23') || css.includes('251, 185, 84')) {
    return 'legendary';
  }
  if (css.includes('purple') || css.includes('144, 94, 169')) {
    return 'epic';
  }
  if (css.includes('blue') || css.includes('cyan') || css.includes('77, 155, 230')) {
    return 'rare';
  }
  if (css.includes('green') || css.includes('30, 188, 115')) {
    return 'common';
  }
  if (css.includes('dark-gray') || css.includes('57, 74, 80')) {
    return 'basic';
  }
  return 'common';
}
