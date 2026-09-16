// src/types/rarity.ts
var RARITY_DEFINITIONS = {
  mythic: {
    id: "mythic",
    label: "Mythic",
    gradientRgba: "rgba(195, 36, 84, 0.35)",
    borderColorVar: "var(--light-red)",
    shadowRgba: "rgba(240, 79, 120, 0.3)",
    titleColorVar: "var(--lighter-red)",
    descriptionColorVar: "var(--lightest-gray)"
  },
  legendary: {
    id: "legendary",
    label: "Legendary",
    gradientRgba: "rgba(247, 150, 23, 0.35)",
    borderColorVar: "var(--light-orange)",
    shadowRgba: "rgba(251, 185, 84, 0.3)",
    titleColorVar: "var(--lighter-orange)",
    descriptionColorVar: "var(--lightest-gray)"
  },
  epic: {
    id: "epic",
    label: "Epic",
    gradientRgba: "rgba(144, 94, 169, 0.35)",
    borderColorVar: "var(--light-purple)",
    shadowRgba: "rgba(168, 132, 243, 0.3)",
    titleColorVar: "var(--lighter-purple)",
    descriptionColorVar: "var(--lightest-gray)"
  },
  rare: {
    id: "rare",
    label: "Rare",
    gradientRgba: "rgba(77, 155, 230, 0.35)",
    borderColorVar: "var(--light-blue)",
    shadowRgba: "rgba(143, 211, 255, 0.3)",
    titleColorVar: "var(--lighter-blue)",
    descriptionColorVar: "var(--lightest-gray)"
  },
  common: {
    id: "common",
    label: "Common",
    gradientRgba: "rgba(30, 188, 115, 0.35)",
    borderColorVar: "var(--light-green)",
    shadowRgba: "rgba(145, 219, 105, 0.3)",
    titleColorVar: "var(--lighter-green)",
    descriptionColorVar: "var(--lightest-gray)"
  },
  basic: {
    id: "basic",
    label: "Basic",
    gradientRgba: "rgba(57, 74, 80, 0.35)",
    borderColorVar: "var(--dark-gray)",
    shadowRgba: "rgba(129, 151, 150, 0.2)",
    titleColorVar: "var(--lighter-gray)",
    descriptionColorVar: "var(--light-gray)"
  }
};
function generateRarityCss(rarity, targetElementId) {
  const config = RARITY_DEFINITIONS[rarity] || RARITY_DEFINITIONS.common;
  const normalizedId = targetElementId.replace(/^#/, "").replace(/^card-/, "");
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
function inferRarityFromCss(css) {
  if (!css) {
    return "common";
  }
  if (css.includes("red") || css.includes("195, 36, 84")) {
    return "mythic";
  }
  if (css.includes("orange") || css.includes("247, 150, 23") || css.includes("251, 185, 84")) {
    return "legendary";
  }
  if (css.includes("purple") || css.includes("144, 94, 169")) {
    return "epic";
  }
  if (css.includes("blue") || css.includes("cyan") || css.includes("77, 155, 230")) {
    return "rare";
  }
  if (css.includes("green") || css.includes("30, 188, 115")) {
    return "common";
  }
  if (css.includes("dark-gray") || css.includes("57, 74, 80")) {
    return "basic";
  }
  return "common";
}

// src/client/dashboard/live_preview.ts
var LivePreviewManager = class {
  previewContainer;
  previewStyleElement;
  constructor(containerElement) {
    this.previewContainer = containerElement;
    let styleEl = document.getElementById("preview-dynamic-style");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "preview-dynamic-style";
      document.head.appendChild(styleEl);
    }
    this.previewStyleElement = styleEl;
  }
  update(id, title, description, imageSrc, cssOrRarity) {
    const previewCardId = `card-preview-${id || "new"}`;
    let scopedCss;
    if (cssOrRarity in RARITY_DEFINITIONS) {
      scopedCss = generateRarityCss(cssOrRarity, previewCardId);
    } else {
      scopedCss = cssOrRarity.replace(new RegExp(`#card-${id || "new"}`, "g"), `#${previewCardId}`).replace(/#card-[a-z0-9_-]+/g, `#${previewCardId}`);
    }
    this.previewStyleElement.textContent = scopedCss;
    this.previewContainer.innerHTML = `
      <div id="${previewCardId}" class="achievement-card">
        <div class="card-artwork-wrapper">
          <img src="${imageSrc || "/images/default_badge.svg"}" alt="Preview" />
        </div>
        <div class="card-body">
          <h3 class="achievement-title">${title || "Achievement Title"}</h3>
          <p class="achievement-description">${description || "Achievement description text will appear here."}</p>
        </div>
      </div>
    `;
  }
};

// src/client/dashboard/achievement_form.ts
var AchievementFormHandler = class {
  formElement;
  previewManager;
  currentEditingId = null;
  uploadedImageFileName = "default_badge.svg";
  onSavedCallback;
  onCancelledCallback;
  titleInput;
  descInput;
  raritySelect;
  fileInput;
  fileLabel;
  cancelBtn;
  editorTitleEl;
  constructor(form, previewContainer, onSaved, onCancelled) {
    this.formElement = form;
    this.previewManager = new LivePreviewManager(previewContainer);
    this.onSavedCallback = onSaved;
    this.onCancelledCallback = onCancelled;
    this.titleInput = form.querySelector("#input-title");
    this.descInput = form.querySelector("#input-description");
    this.raritySelect = form.querySelector("#select-rarity");
    this.fileInput = form.querySelector("#input-file");
    this.fileLabel = form.querySelector("#file-name-label");
    this.cancelBtn = form.querySelector("#btn-cancel-edit");
    this.editorTitleEl = document.getElementById("editor-title");
    this.attachEventListeners();
    this.triggerLivePreview();
  }
  attachEventListeners() {
    const inputs = [this.titleInput, this.descInput, this.raritySelect];
    for (const input of inputs) {
      if (input) {
        input.addEventListener("input", () => this.triggerLivePreview());
        input.addEventListener("change", () => this.triggerLivePreview());
      }
    }
    this.fileInput.addEventListener("change", async () => {
      if (this.fileInput.files && this.fileInput.files.length > 0) {
        const file = this.fileInput.files[0];
        await this.handleImageUpload(file);
      }
    });
    if (this.cancelBtn) {
      this.cancelBtn.addEventListener("click", () => {
        this.resetForm();
        this.onCancelledCallback();
      });
    }
    this.formElement.addEventListener("submit", async (event) => {
      event.preventDefault();
      await this.saveAchievement();
    });
  }
  async handleImageUpload(file) {
    const formData = new FormData();
    formData.append("image", file);
    try {
      this.fileLabel.textContent = `Uploading ${file.name}...`;
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });
      const result = await response.json();
      if (result.success && result.data?.fileName) {
        this.uploadedImageFileName = result.data.fileName;
        this.fileLabel.textContent = file.name;
        this.triggerLivePreview();
      } else {
        throw new Error(result.error || "Upload failed");
      }
    } catch (uploadError) {
      alert(`Image upload error: ${uploadError.message}`);
      this.fileLabel.textContent = "Upload failed. Try again.";
    }
  }
  triggerLivePreview() {
    const title = this.titleInput.value.trim();
    const description = this.descInput.value.trim();
    const rarity = this.raritySelect?.value || "common";
    const imageSrc = `/images/${this.uploadedImageFileName}`;
    this.applyRarityColor();
    this.previewManager.update(
      this.currentEditingId || "preview",
      title,
      description,
      imageSrc,
      rarity
    );
  }
  applyRarityColor() {
    if (!this.raritySelect) {
      return;
    }
    const rarityColorMap = {
      mythic: "var(--lighter-red)",
      legendary: "var(--lighter-orange)",
      epic: "var(--lighter-purple)",
      rare: "var(--lighter-blue)",
      common: "var(--lighter-green)",
      basic: "var(--lighter-gray)"
    };
    this.raritySelect.style.color = rarityColorMap[this.raritySelect.value] || "var(--lightest-gray)";
  }
  populateForEdit(achievement) {
    this.currentEditingId = achievement.id;
    this.titleInput.value = achievement.title;
    this.descInput.value = achievement.description;
    const detectedRarity = achievement.rarity || inferRarityFromCss(achievement.customCss);
    if (this.raritySelect) {
      this.raritySelect.value = detectedRarity;
    }
    this.uploadedImageFileName = achievement.imageFileName;
    this.fileLabel.textContent = achievement.imageFileName;
    const submitBtn = this.formElement.querySelector("#btn-submit-achievement");
    if (submitBtn) {
      submitBtn.textContent = "Update achievement";
    }
    if (this.cancelBtn) {
      this.cancelBtn.style.display = "inline-flex";
    }
    if (this.editorTitleEl) {
      this.editorTitleEl.textContent = "Edit achievement";
    }
    this.triggerLivePreview();
  }
  resetForm() {
    this.currentEditingId = null;
    this.formElement.reset();
    this.uploadedImageFileName = "default_badge.svg";
    this.fileLabel.textContent = "Choose an image (PNG, SVG, JPG)";
    if (this.raritySelect) {
      this.raritySelect.value = "common";
    }
    const submitBtn = this.formElement.querySelector("#btn-submit-achievement");
    if (submitBtn) {
      submitBtn.textContent = "Create achievement";
    }
    if (this.cancelBtn) {
      this.cancelBtn.style.display = "none";
    }
    if (this.editorTitleEl) {
      this.editorTitleEl.textContent = "New achievement";
    }
    this.triggerLivePreview();
  }
  async saveAchievement() {
    const title = this.titleInput.value.trim();
    const description = this.descInput.value.trim();
    const rarity = this.raritySelect?.value || "common";
    if (!title || !description) {
      alert("Title and description are required.");
      return;
    }
    const customCss = generateRarityCss(rarity, this.currentEditingId || "new");
    const payload = {
      title,
      description,
      rarity,
      customCss,
      imageFileName: this.uploadedImageFileName
    };
    try {
      let url = "/api/achievements";
      let method = "POST";
      if (this.currentEditingId) {
        url = `/api/achievements/${this.currentEditingId}`;
        method = "PUT";
      }
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to save achievement");
      }
      this.resetForm();
      this.onSavedCallback();
    } catch (saveError) {
      alert(`Save error: ${saveError.message}`);
    }
  }
};

// src/types/history.ts
function buildAchievementLookup(achievements, deletedAchievements) {
  const lookup = /* @__PURE__ */ new Map();
  for (const [achievementId, record] of Object.entries(deletedAchievements ?? {})) {
    lookup.set(achievementId, { title: record.title, rarity: record.rarity });
  }
  for (const achievement of achievements) {
    lookup.set(achievement.id, { title: achievement.title, rarity: achievement.rarity });
  }
  return lookup;
}

// src/client/dashboard/streak_view.ts
var StreakViewRenderer = class {
  streaksContainer;
  constructor(streaksEl) {
    this.streaksContainer = streaksEl;
  }
  render(history, achievements) {
    const achievementLookup = buildAchievementLookup(achievements, history.deletedAchievements);
    const achievementIds = Object.keys(history.streaks);
    if (achievementIds.length === 0) {
      this.streaksContainer.innerHTML = '<p class="empty-state-text">No streak records yet. Complete your first daily achievement to start a streak.</p>';
      return;
    }
    let rowsHtml = "";
    for (const id of achievementIds) {
      const metric = history.streaks[id];
      const display = achievementLookup.get(id);
      const title = display ? display.title : id;
      rowsHtml += `
        <tr>
          <td data-label="Achievement"><strong>${title}</strong></td>
          <td data-label="Current Streak" style="color: var(--lighter-orange); font-weight: 700;">\u2605 ${metric.currentStreak} day${metric.currentStreak === 1 ? "" : "s"}</td>
          <td data-label="Longest Streak" style="color: var(--lighter-blue);">${metric.longestStreak} day${metric.longestStreak === 1 ? "" : "s"}</td>
          <td data-label="Last Completed" style="color: var(--light-gray);">${metric.lastCompletedDate || "Never"}</td>
        </tr>
      `;
    }
    this.streaksContainer.innerHTML = `
      <table class="history-table">
        <thead>
          <tr>
            <th>Achievement</th>
            <th>Current streak</th>
            <th>Longest streak</th>
            <th>Last completed</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }
};

// src/client/dashboard/calendar_view.ts
var WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
var MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
var CalendarView = class {
  container;
  viewedYear;
  viewedMonth;
  unlocksByDate = /* @__PURE__ */ new Map();
  constructor(container) {
    this.container = container;
    const now = /* @__PURE__ */ new Date();
    this.viewedYear = now.getFullYear();
    this.viewedMonth = now.getMonth();
  }
  render(history, achievements) {
    const achievementLookup = buildAchievementLookup(achievements, history.deletedAchievements);
    this.unlocksByDate = /* @__PURE__ */ new Map();
    for (const log of history.logs) {
      const display = achievementLookup.get(log.achievementId);
      const entry = {
        title: display ? display.title : log.achievementId,
        rarity: display?.rarity
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
  renderMonth() {
    const firstDay = new Date(this.viewedYear, this.viewedMonth, 1);
    const daysInMonth = new Date(this.viewedYear, this.viewedMonth + 1, 0).getDate();
    const firstWeekdayIndex = (firstDay.getDay() + 6) % 7;
    const today = /* @__PURE__ */ new Date();
    const todayKey = this.formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());
    let weekdayCells = "";
    for (const label of WEEKDAY_LABELS) {
      weekdayCells += `<div class="calendar-weekday">${label}</div>`;
    }
    let dayCells = "";
    for (let padding = 0; padding < firstWeekdayIndex; padding++) {
      dayCells += '<div class="calendar-day other-month"></div>';
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = this.formatDateKey(this.viewedYear, this.viewedMonth, day);
      const dayEntries = this.unlocksByDate.get(dateKey) ?? [];
      const isToday = dateKey === todayKey ? " is-today" : "";
      let dots = "";
      let tooltipEntries = "";
      for (const entry of dayEntries) {
        const rarityKey = entry.rarity ?? "none";
        dots += `<span class="rarity-dot" data-rarity="${rarityKey}"></span>`;
        tooltipEntries += `<span class="rarity-title" data-rarity="${rarityKey}">${escapeHtml(entry.title)}</span>`;
      }
      const tooltip = dayEntries.length > 0 ? `<div class="calendar-tooltip">${tooltipEntries}</div>` : "";
      dayCells += `
        <div class="calendar-day${isToday}">
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
    const previousButton = this.container.querySelector('[data-direction="prev"]');
    const nextButton = this.container.querySelector('[data-direction="next"]');
    previousButton.addEventListener("click", () => this.shiftMonth(-1));
    nextButton.addEventListener("click", () => this.shiftMonth(1));
  }
  shiftMonth(delta) {
    const shifted = new Date(this.viewedYear, this.viewedMonth + delta, 1);
    this.viewedYear = shifted.getFullYear();
    this.viewedMonth = shifted.getMonth();
    this.renderMonth();
  }
  formatDateKey(year, monthIndex, day) {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
};

// src/client/dashboard/dashboard_controller.ts
var DashboardController = class {
  socket = null;
  achievements = [];
  dailyState = { currentDate: "", activeUnlocks: [] };
  historyState = { streaks: {}, logs: [] };
  formHandler;
  streakRenderer;
  calendarView;
  checklistListEl;
  dateBadgeEl;
  toastEl;
  searchInput = null;
  searchTerm = "";
  hamburgerBtn;
  hamburgerMenu;
  constructor() {
    this.checklistListEl = document.getElementById("achievements-list") || document.getElementById("achievements-grid");
    this.dateBadgeEl = document.getElementById("current-date-badge");
    this.toastEl = document.getElementById("toast-notification");
    this.searchInput = document.getElementById("input-search");
    this.hamburgerBtn = document.getElementById("btn-hamburger");
    this.hamburgerMenu = document.getElementById("hamburger-menu");
    const formEl = document.getElementById("achievement-form");
    const previewBoxEl = document.getElementById("live-preview-box");
    const streaksContainerEl = document.getElementById("streaks-container");
    const calendarContainerEl = document.getElementById("calendar-container");
    this.streakRenderer = new StreakViewRenderer(streaksContainerEl);
    this.calendarView = new CalendarView(calendarContainerEl);
    this.formHandler = new AchievementFormHandler(
      formEl,
      previewBoxEl,
      () => {
        this.showToast("Achievement saved successfully.");
        this.switchTab("tab-checklist");
        this.fetchState();
      },
      () => this.switchTab("tab-checklist")
    );
    this.setupTabs();
    this.setupHamburgerMenu();
    this.setupChecklistListeners();
    this.setupForgetHistoryButton();
    this.setupSearch();
    this.connectWebSocket();
    this.fetchState();
  }
  setupSearch() {
    if (!this.searchInput) {
      return;
    }
    this.searchInput.addEventListener("input", () => {
      this.searchTerm = this.searchInput.value.trim().toLowerCase();
      this.renderChecklist();
    });
  }
  setupHamburgerMenu() {
    if (!this.hamburgerBtn || !this.hamburgerMenu) {
      return;
    }
    this.hamburgerBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = this.hamburgerMenu.classList.contains("open");
      this.toggleMenu(!isOpen);
    });
    document.addEventListener("click", (event) => {
      if (this.hamburgerMenu && this.hamburgerMenu.classList.contains("open") && !this.hamburgerMenu.contains(event.target) && event.target !== this.hamburgerBtn) {
        this.toggleMenu(false);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.hamburgerMenu?.classList.contains("open")) {
        this.toggleMenu(false);
      }
    });
    this.setupNetworkInfo();
    this.setupResetButton();
  }
  toggleMenu(open) {
    if (!this.hamburgerMenu || !this.hamburgerBtn) {
      return;
    }
    this.hamburgerMenu.classList.toggle("open", open);
    this.hamburgerBtn.setAttribute("aria-expanded", String(open));
  }
  async setupNetworkInfo() {
    const urlTextEl = document.getElementById("menu-phone-url");
    const copyBtn = document.getElementById("btn-copy-url");
    if (!urlTextEl) {
      return;
    }
    try {
      const response = await fetch("/api/network");
      const result = await response.json();
      if (result.success && result.data?.url) {
        const phoneUrl = result.data.url;
        urlTextEl.textContent = phoneUrl;
        if (copyBtn) {
          copyBtn.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(phoneUrl);
              this.showToast("Copied phone URL to clipboard.");
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
  setupResetButton() {
    const resetBtn = document.getElementById("btn-menu-reset");
    if (!resetBtn) {
      return;
    }
    resetBtn.addEventListener("click", async () => {
      const confirmed = confirm("Reset all daily unlocks for today? Active streaks will be retained.");
      if (confirmed) {
        try {
          const response = await fetch("/api/reset", { method: "POST" });
          const result = await response.json();
          if (result.success) {
            this.toggleMenu(false);
            this.showToast("Daily achievements reset.");
            this.fetchState();
          }
        } catch (resetError) {
          alert(`Reset error: ${resetError.message}`);
        }
      }
    });
  }
  setupForgetHistoryButton() {
    const forgetBtn = document.getElementById("btn-forget-history");
    if (!forgetBtn) {
      return;
    }
    forgetBtn.addEventListener("click", async () => {
      const confirmed = confirm("Are you sure? You will lose your level and rank. This cannot be undone.");
      if (confirmed) {
        try {
          const response = await fetch("/api/history/forget", { method: "POST" });
          const result = await response.json();
          if (result.success) {
            this.showToast("All history and streaks forgotten.");
            this.fetchState();
          }
        } catch (forgetError) {
          alert(`Error clearing history: ${forgetError.message}`);
        }
      }
    });
  }
  setupChecklistListeners() {
    if (!this.checklistListEl) {
      return;
    }
    this.checklistListEl.addEventListener("click", (event) => {
      const target = event.target;
      const toggleButton = target.closest(".toggle-btn");
      if (toggleButton) {
        const achievementId = toggleButton.dataset.id;
        if (achievementId) {
          const isUnlocked = toggleButton.classList.contains("btn-unlocked");
          this.toggleAchievement(achievementId, isUnlocked);
        }
        return;
      }
      const editButton = target.closest(".edit-btn");
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
      const deleteButton = target.closest(".delete-btn");
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
  setupTabs() {
    const tabButtons = document.querySelectorAll(".tab-btn");
    for (const button of tabButtons) {
      button.addEventListener("click", (event) => {
        const targetTab = event.currentTarget.dataset.tab;
        if (targetTab) {
          if (targetTab === "tab-editor") {
            this.formHandler.resetForm();
          }
          this.switchTab(targetTab);
        }
      });
    }
  }
  switchTab(tabId) {
    const allTabs = document.querySelectorAll(".tab-content");
    const allButtons = document.querySelectorAll(".tab-btn");
    for (const tab of allTabs) {
      tab.classList.toggle("active", tab.id === tabId);
    }
    for (const btn of allButtons) {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    }
    if (tabId === "tab-history") {
      this.streakRenderer.render(this.historyState, this.achievements);
      this.calendarView.render(this.historyState, this.achievements);
    }
  }
  connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${protocol}//${window.location.host}/ws`;
    this.socket = new WebSocket(socketUrl);
    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleWebSocketMessage(message);
      } catch (parseError) {
        console.error("Failed to parse WebSocket message:", parseError);
      }
    };
    this.socket.onclose = () => {
      setTimeout(() => this.connectWebSocket(), 3e3);
    };
  }
  handleWebSocketMessage(message) {
    switch (message.type) {
      case "INIT_STATE": {
        const payload = message.payload;
        this.achievements = payload.achievements;
        this.dailyState = payload.state;
        this.historyState = payload.history;
        this.renderChecklist();
        this.streakRenderer.render(this.historyState, this.achievements);
        this.calendarView.render(this.historyState, this.achievements);
        break;
      }
      case "ACHIEVEMENT_UNLOCKED":
      case "ACHIEVEMENT_REVOKED":
      case "MIDNIGHT_RESET":
      case "ACHIEVEMENT_CREATED":
      case "ACHIEVEMENT_UPDATED":
      case "ACHIEVEMENT_DELETED":
      case "HISTORY_CLEARED": {
        this.fetchState();
        break;
      }
      default:
        break;
    }
  }
  async fetchState() {
    try {
      const [achievementsRes, stateRes, historyRes] = await Promise.all([
        fetch("/api/achievements").then((res) => res.json()),
        fetch("/api/state").then((res) => res.json()),
        fetch("/api/history").then((res) => res.json())
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
      console.error("Error fetching dashboard state:", fetchError);
    }
  }
  renderChecklist() {
    if (!this.checklistListEl) {
      return;
    }
    if (this.achievements.length === 0) {
      this.checklistListEl.innerHTML = '<p class="empty-state-text">No achievements created yet. Click "Create" to create your first goal.</p>';
      return;
    }
    const activeUnlockedIds = new Set(
      this.dailyState.activeUnlocks.map((item) => item.achievementId)
    );
    const visibleAchievements = this.searchTerm ? this.achievements.filter((item) => item.title.toLowerCase().includes(this.searchTerm) || item.description.toLowerCase().includes(this.searchTerm)) : this.achievements;
    if (visibleAchievements.length === 0) {
      this.checklistListEl.innerHTML = '<p class="empty-state-text">No achievements match your search.</p>';
      return;
    }
    this.checklistListEl.innerHTML = "";
    for (const item of visibleAchievements) {
      const isUnlocked = activeUnlockedIds.has(item.id);
      const streak = this.historyState.streaks[item.id];
      const streakCount = streak ? streak.currentStreak : 0;
      const streakCellHtml = streakCount > 0 ? `<span class="streak-pill active">\u2605 ${streakCount}d</span>` : "";
      const row = document.createElement("div");
      row.className = `checklist-row ${isUnlocked ? "unlocked" : ""}`;
      row.id = `dashboard-row-${item.id}`;
      const rarityClass = ` rarity-${item.rarity || "common"}`;
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
          <button class="toggle-btn ${isUnlocked ? "btn-unlocked" : "btn-locked"}" data-id="${item.id}">
            ${isUnlocked ? "\u2713 Done" : "Unlock"}
          </button>
          <button class="btn-secondary edit-btn" data-id="${item.id}">Edit</button>
          <button class="btn-danger delete-btn" data-id="${item.id}">Delete</button>
        </div>
      `;
      this.checklistListEl.appendChild(row);
    }
  }
  async toggleAchievement(id, currentlyUnlocked) {
    const endpoint = currentlyUnlocked ? `/api/achievements/${id}/revoke` : `/api/achievements/${id}/unlock`;
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const result = await response.json();
      if (result.success) {
        this.showToast(currentlyUnlocked ? "Achievement locked." : "\u2605 Achievement unlocked!");
        await this.fetchState();
      } else {
        alert(result.error || "Failed to update achievement status.");
      }
    } catch (toggleError) {
      alert(`Network error: ${toggleError.message}`);
    }
  }
  editAchievement(achievement) {
    this.formHandler.populateForEdit(achievement);
    this.switchTab("tab-editor");
  }
  async deleteAchievement(id, title) {
    const confirmed = confirm(`Are you sure you want to delete "${title}"?`);
    if (!confirmed) {
      return;
    }
    try {
      const response = await fetch(`/api/achievements/${id}`, { method: "DELETE" });
      const result = await response.json();
      if (result.success) {
        this.showToast(`Deleted ${title}.`);
        await this.fetchState();
      } else {
        alert(result.error || "Failed to delete achievement.");
      }
    } catch (deleteError) {
      alert(`Delete error: ${deleteError.message}`);
    }
  }
  showToast(message) {
    if (!this.toastEl) {
      return;
    }
    this.toastEl.textContent = message;
    this.toastEl.classList.add("visible");
    setTimeout(() => {
      this.toastEl.classList.remove("visible");
    }, 2800);
  }
};
document.addEventListener("DOMContentLoaded", () => {
  new DashboardController();
});
export {
  DashboardController
};
