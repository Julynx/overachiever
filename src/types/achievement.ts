/**
 * @fileoverview Defines core data structures for achievement definitions,
 * layout metadata, and customization rules.
 */

import { RarityTier } from './rarity.js';

/**
 * Represents a single daily achievement definition.
 */
export interface AchievementDefinition {
  /**
   * Unique identifier formatted in kebab-case (e.g., 'grass-toucher').
   */
  id: string;

  /**
   * Short, descriptive title displayed on the card header.
   */
  title: string;

  /**
   * Explanation of the criteria required to unlock this achievement.
   */
  description: string;

  /**
   * Relative filename of the artwork stored in the data/images directory.
   */
  imageFileName: string;

  /**
   * Custom CSS styling block scoped to `#card-${id}`.
   */
  customCss: string;

  /**
   * Visual rarity classification tier.
   */
  rarity?: RarityTier;

  /**
   * ISO 8601 creation timestamp string.
   */
  createdAt: string;
}

/**
 * Payload expected when creating or updating an achievement definition.
 */
export interface CreateAchievementPayload {
  title: string;
  description: string;
  imageFileName?: string;
  customCss?: string;
  rarity?: RarityTier;
}
