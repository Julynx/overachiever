/**
 * @fileoverview Defines user and runtime configuration settings.
 */

export interface ApplicationConfig {
  /**
   * TCP port on which the Express HTTP and WebSocket server binds.
   */
  port: number;

  /**
   * Host address binding (0.0.0.0 for LAN access, 127.0.0.1 for localhost only).
   */
  host: string;

  /**
   * Whether the application registers with Windows Startup registry.
   */
  launchOnStartup: boolean;

  /**
   * Threshold of visible cards before stacking into compact mode.
   */
  maxVisibleCardsBeforeCollapse: number;

  /**
   * Ratio of primary monitor height at which desktop cards start collapsing.
   */
  collapseHeightThresholdRatio: number;
}
