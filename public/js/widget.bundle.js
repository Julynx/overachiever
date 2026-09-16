// src/client/widget/card_renderer.ts
var CardRenderer = class {
  stylesContainer;
  constructor() {
    let container = document.getElementById("dynamic-styles-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "dynamic-styles-container";
      document.head.appendChild(container);
    }
    this.stylesContainer = container;
  }
  /**
   * Scopes custom CSS rules to match the achievement element identifier,
   * healing both `#card-*` and bare `#<id>` selector variants.
   */
  scopeCss(customCss, achievementId) {
    const targetElementId = `card-${achievementId}`;
    const bareIdPattern = new RegExp(`#${achievementId}(?![a-z0-9_-])`, "g");
    return customCss.replace(/#card-[a-z0-9_-]+/g, `#${targetElementId}`).replace(bareIdPattern, `#${targetElementId}`);
  }
  injectCustomCss(achievement) {
    const scopedCss = this.scopeCss(achievement.customCss, achievement.id);
    const existingStyle = document.getElementById(`style-${achievement.id}`);
    if (existingStyle) {
      existingStyle.textContent = scopedCss;
      return;
    }
    const styleElement = document.createElement("style");
    styleElement.id = `style-${achievement.id}`;
    styleElement.textContent = scopedCss;
    this.stylesContainer.appendChild(styleElement);
  }
  removeCustomCss(achievementId) {
    const existingStyle = document.getElementById(`style-${achievementId}`);
    if (existingStyle) {
      existingStyle.remove();
    }
  }
  createCardElement(achievement, streak) {
    this.injectCustomCss(achievement);
    const card = document.createElement("div");
    card.id = `card-${achievement.id}`;
    card.className = "achievement-card";
    card.dataset.achievementId = achievement.id;
    const imageUrl = `/images/${achievement.imageFileName}`;
    const artworkWrapper = document.createElement("div");
    artworkWrapper.className = "card-artwork-wrapper";
    const imageElement = document.createElement("img");
    imageElement.src = imageUrl;
    imageElement.alt = achievement.title;
    imageElement.loading = "eager";
    artworkWrapper.appendChild(imageElement);
    const cardBody = document.createElement("div");
    cardBody.className = "card-body";
    const titleElement = document.createElement("h3");
    titleElement.className = "achievement-title";
    titleElement.textContent = achievement.title;
    const descElement = document.createElement("p");
    descElement.className = "achievement-description";
    descElement.textContent = achievement.description;
    cardBody.appendChild(titleElement);
    cardBody.appendChild(descElement);
    card.appendChild(artworkWrapper);
    card.appendChild(cardBody);
    if (streak && streak.currentStreak > 1) {
      const streakBadge = document.createElement("div");
      streakBadge.className = "card-badge-streak";
      streakBadge.innerHTML = `\u2605 ${streak.currentStreak}d`;
      card.appendChild(streakBadge);
    }
    return card;
  }
};

// src/client/widget/progress_hud.ts
var ProgressHud = class {
  rootElement;
  constructor(rootElement, onOpenDashboard) {
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
    this.rootElement.querySelector(".hud-bar-row")?.addEventListener("click", () => {
      onOpenDashboard();
    });
  }
  update(snapshot) {
    const fillPercent = Math.min(100, snapshot.currentLevelXp / snapshot.levelXpRequirement * 100);
    const leagueLabel = this.rootElement.querySelector(".hud-league");
    leagueLabel.textContent = snapshot.leagueLabel;
    leagueLabel.dataset.tier = snapshot.leagueId;
    const eloLabel = this.rootElement.querySelector(".hud-elo");
    eloLabel.textContent = `${snapshot.elo.toFixed(1)} ELO`;
    const fillElement = this.rootElement.querySelector(".hud-bar-fill");
    fillElement.style.width = `${fillPercent}%`;
    const medalElement = this.rootElement.querySelector(".hud-level-medal");
    medalElement.dataset.tier = snapshot.leagueId;
    const existingShield = medalElement.querySelector(".hud-league-shield");
    if (existingShield && existingShield.getAttribute("data-tier") !== snapshot.leagueId) {
      existingShield.remove();
    }
    if (!medalElement.querySelector(".hud-league-shield")) {
      const shieldImage = document.createElement("img");
      shieldImage.className = "hud-league-shield";
      shieldImage.dataset.tier = snapshot.leagueId;
      shieldImage.alt = `${snapshot.leagueLabel} league shield`;
      shieldImage.src = `/images/leagues/${snapshot.leagueId}.png`;
      shieldImage.addEventListener("error", () => shieldImage.remove());
      medalElement.prepend(shieldImage);
    }
    const levelNumber = this.rootElement.querySelector(".hud-level-number");
    levelNumber.textContent = String(snapshot.level);
    const currentXpLabel = this.rootElement.querySelector(".hud-current-xp");
    currentXpLabel.textContent = `${snapshot.currentLevelXp} XP`;
    const xpToNextLevel = Math.max(0, snapshot.levelXpRequirement - snapshot.currentLevelXp);
    const levelXpLabel = this.rootElement.querySelector(".hud-level-xp");
    levelXpLabel.textContent = `${xpToNextLevel} XP TO NEXT LEVEL`;
  }
};

// src/types/progress.ts
var LEAGUE_DEFINITIONS = [
  { id: "iron", label: "Iron", threshold: 0 },
  { id: "bronze", label: "Bronze", threshold: 5 },
  { id: "silver", label: "Silver", threshold: 10 },
  { id: "gold", label: "Gold", threshold: 15 },
  { id: "platinum", label: "Platinum", threshold: 20 },
  { id: "diamond", label: "Diamond", threshold: 25 },
  { id: "opal", label: "Opal", threshold: 30 },
  { id: "cinder", label: "Cinder", threshold: 40 }
];

// src/client/widget/widget_controller.ts
var WidgetController = class _WidgetController {
  /**
   * Event-relative time at which the card settles into place, matching the
   * audible impact of the unlock sound (~400ms into the file plus ~50ms of
   * audio output latency).
   */
  static UNLOCK_LANDING_MS = 450;
  /**
   * Total unlock animation duration before animation classes are removed.
   */
  static UNLOCK_CLEANUP_MS = 1500;
  stackElement;
  cardRenderer;
  progressHud;
  unlockSound = null;
  leagueUpSound = null;
  socket = null;
  achievementsMap = /* @__PURE__ */ new Map();
  historyState = { streaks: {}, logs: [] };
  maxVisibleCards = 4;
  lastLeagueId = null;
  constructor() {
    const stack = document.getElementById("cards-stack");
    const hudRoot = document.getElementById("progress-hud");
    if (!stack || !hudRoot) {
      throw new Error("Required DOM elements missing for WidgetController.");
    }
    this.stackElement = stack;
    this.cardRenderer = new CardRenderer();
    this.progressHud = new ProgressHud(hudRoot, () => this.openDashboard());
    this.setupUnlockSound();
    this.setupLeagueUpSound();
    this.setupClickHandler();
    this.connectWebSocket();
  }
  setupClickHandler() {
    this.stackElement.addEventListener("click", (event) => {
      const targetCard = event.target.closest(".achievement-card");
      if (targetCard) {
        this.openDashboard();
      }
    });
  }
  /**
   * Loads the first unlock sound asset found, in order of format preference.
   */
  async setupUnlockSound() {
    this.unlockSound = await this.loadSound(
      ["/sounds/unlock.mp3", "/sounds/unlock.ogg", "/sounds/unlock.wav"],
      0.4
    );
    if (!this.unlockSound) {
      console.warn("No unlock sound found in /sounds (unlock.mp3, unlock.ogg or unlock.wav). Unlocks will be silent.");
    }
  }
  /**
   * Loads the promotion fanfare played when the user climbs to a higher league.
   */
  async setupLeagueUpSound() {
    this.leagueUpSound = await this.loadSound(["/sounds/league-up.mp3"], 0.4);
    if (!this.leagueUpSound) {
      console.warn("No league-up sound found at /sounds/league-up.mp3. League promotions will be silent.");
    }
  }
  /**
   * Probes the candidate URLs and returns the first one available as a
   * preloaded audio element, or null when none can be loaded.
   */
  async loadSound(candidates, volume) {
    for (const url of candidates) {
      try {
        const probe = await fetch(url, { method: "HEAD" });
        if (!probe.ok) {
          continue;
        }
        const sound = new Audio(url);
        sound.preload = "auto";
        sound.volume = volume;
        return sound;
      } catch (probeError) {
        console.warn(`Sound probe failed for ${url}:`, probeError);
      }
    }
    return null;
  }
  playSound(sound, soundName) {
    if (!sound) {
      return;
    }
    sound.currentTime = 0;
    sound.play().catch((playError) => {
      console.error(`Failed to play ${soundName}:`, playError);
    });
  }
  openDashboard() {
    if (window.desktopBridge) {
      window.desktopBridge.openDashboard();
    } else {
      window.open("/dashboard", "_blank");
    }
  }
  connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${protocol}//${window.location.host}/ws`;
    this.socket = new WebSocket(socketUrl);
    this.socket.onopen = () => {
      console.log("Connected to desktop widget WebSocket stream.");
    };
    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleWebSocketEvent(message);
      } catch (parseError) {
        console.error("Error handling WebSocket message:", parseError);
      }
    };
    this.socket.onclose = () => {
      console.warn("WebSocket connection lost. Reconnecting in 3 seconds...");
      setTimeout(() => this.connectWebSocket(), 3e3);
    };
    this.socket.onerror = (error) => {
      console.error("WebSocket encountered error:", error);
    };
  }
  handleWebSocketEvent(message) {
    switch (message.type) {
      case "INIT_STATE": {
        const payload = message.payload;
        this.initializeState(payload.achievements, payload.state, payload.history);
        if (payload.progress) {
          this.handleProgressSnapshot(payload.progress);
        } else {
          this.refreshProgress();
        }
        break;
      }
      case "ACHIEVEMENT_UNLOCKED": {
        const payload = message.payload;
        this.handleAchievementUnlocked(payload.achievement);
        this.refreshProgress();
        break;
      }
      case "ACHIEVEMENT_REVOKED": {
        const payload = message.payload;
        this.handleAchievementRevoked(payload.achievementId);
        this.refreshProgress();
        break;
      }
      case "MIDNIGHT_RESET": {
        this.handleMidnightReset();
        this.refreshProgress();
        break;
      }
      case "ACHIEVEMENT_UPDATED": {
        const updated = message.payload;
        this.achievementsMap.set(updated.id, updated);
        this.cardRenderer.injectCustomCss(updated);
        this.updateCardContent(updated);
        this.refreshProgress();
        break;
      }
      case "ACHIEVEMENT_DELETED": {
        const deletedId = message.payload;
        this.achievementsMap.delete(deletedId);
        this.handleAchievementRevoked(deletedId);
        this.refreshProgress();
        break;
      }
      case "HISTORY_CLEARED": {
        this.refreshProgress();
        break;
      }
      default:
        break;
    }
  }
  async refreshProgress() {
    try {
      const response = await fetch("/api/progress");
      const result = await response.json();
      if (result.success) {
        this.handleProgressSnapshot(result.data);
      }
    } catch (progressError) {
      console.error("Failed to refresh progress snapshot:", progressError);
    }
  }
  /**
   * Updates the HUD with a new progress snapshot and plays the promotion
   * fanfare when the snapshot reflects a climb to a higher league. The first
   * snapshot after load establishes the baseline without a fanfare.
   */
  handleProgressSnapshot(snapshot) {
    const previousLeagueId = this.lastLeagueId;
    this.lastLeagueId = snapshot.leagueId;
    if (previousLeagueId !== null && previousLeagueId !== snapshot.leagueId) {
      const previousRank = LEAGUE_DEFINITIONS.findIndex((league) => league.id === previousLeagueId);
      const currentRank = LEAGUE_DEFINITIONS.findIndex((league) => league.id === snapshot.leagueId);
      if (previousRank >= 0 && currentRank > previousRank) {
        this.playSound(this.leagueUpSound, "league promotion sound");
      }
    }
    this.progressHud.update(snapshot);
  }
  initializeState(achievements, state, history) {
    this.achievementsMap.clear();
    for (const achievement of achievements) {
      this.achievementsMap.set(achievement.id, achievement);
    }
    this.historyState = history;
    this.stackElement.innerHTML = "";
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
  handleAchievementUnlocked(achievement) {
    this.achievementsMap.set(achievement.id, achievement);
    const existingCard = document.getElementById(`card-${achievement.id}`);
    if (existingCard) {
      return;
    }
    this.playUnlockSound();
    this.spawnUnlockingCard(achievement.id);
  }
  playUnlockSound() {
    this.playSound(this.unlockSound, "unlock sound");
  }
  spawnUnlockingCard(achievementId) {
    const achievement = this.achievementsMap.get(achievementId);
    const existingCard = document.getElementById(`card-${achievementId}`);
    if (!achievement || existingCard) {
      return;
    }
    const streak = this.historyState.streaks[achievement.id];
    const newCard = this.cardRenderer.createCardElement(achievement, streak);
    newCard.classList.add("unlocking");
    this.stackElement.appendChild(newCard);
    setTimeout(() => {
      this.triggerContainerNudge();
    }, _WidgetController.UNLOCK_LANDING_MS);
    setTimeout(() => {
      newCard.classList.remove("unlocking");
      this.updateCollapseState();
    }, _WidgetController.UNLOCK_CLEANUP_MS);
  }
  triggerContainerNudge() {
    this.stackElement.classList.remove("cards-container-shake");
    void this.stackElement.offsetWidth;
    this.stackElement.classList.add("cards-container-shake");
  }
  handleAchievementRevoked(achievementId) {
    const cardElement = document.getElementById(`card-${achievementId}`);
    if (cardElement) {
      cardElement.classList.add("card-removing");
      setTimeout(() => {
        cardElement.remove();
        this.cardRenderer.removeCustomCss(achievementId);
        this.updateCollapseState();
      }, 300);
    }
  }
  handleMidnightReset() {
    const allCards = this.stackElement.querySelectorAll(".achievement-card");
    for (const card of allCards) {
      card.classList.add("card-removing");
    }
    setTimeout(() => {
      for (const card of Array.from(this.stackElement.querySelectorAll(".achievement-card"))) {
        const achievementId = card.dataset.achievementId;
        if (achievementId) {
          this.cardRenderer.removeCustomCss(achievementId);
        }
      }
      this.stackElement.innerHTML = "";
      this.updateCollapseState();
    }, 350);
  }
  updateCardContent(achievement) {
    const cardElement = document.getElementById(`card-${achievement.id}`);
    if (!cardElement) {
      return;
    }
    const titleEl = cardElement.querySelector(".achievement-title");
    const descEl = cardElement.querySelector(".achievement-description");
    const imgEl = cardElement.querySelector(".card-artwork-wrapper img");
    if (titleEl) titleEl.textContent = achievement.title;
    if (descEl) descEl.textContent = achievement.description;
    if (imgEl) imgEl.src = `/images/${achievement.imageFileName}`;
  }
  updateCollapseState() {
    const cards = Array.from(this.stackElement.querySelectorAll(".achievement-card"));
    const shouldCollapse = cards.length > this.maxVisibleCards;
    cards.forEach((card, index) => {
      if (shouldCollapse && index < cards.length - this.maxVisibleCards) {
        card.classList.add("collapsed");
      } else {
        card.classList.remove("collapsed");
      }
    });
  }
};
document.addEventListener("DOMContentLoaded", () => {
  new WidgetController();
});
export {
  WidgetController
};
