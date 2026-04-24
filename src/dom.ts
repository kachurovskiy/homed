function cacheElements(): void {
  els = {
    lockedView: getRequiredElement("lockedView"),
    unlockedView: getRequiredElement("unlockedView"),
    vaultState: getRequiredElement("vaultState"),
    lockTitle: getRequiredElement("lockTitle"),
    authForm: getRequiredElement("authForm"),
    passwordInput: getRequiredElement("passwordInput"),
    confirmPasswordWrap: getRequiredElement("confirmPasswordWrap"),
    confirmPasswordInput: getRequiredElement("confirmPasswordInput"),
    authButton: getRequiredElement("authButton"),
    authStatus: getRequiredElement("authStatus"),
    lockedImportButton: getRequiredElement("lockedImportButton"),
    unlockedImportButton: getRequiredElement("unlockedImportButton"),
    backupFileInput: getRequiredElement("backupFileInput"),
    remoteActivity: getRequiredElement("remoteActivity"),
    unlockSummary: getRequiredElement("unlockSummary"),
    autoLockSelect: getRequiredElement("autoLockSelect"),
    lockButton: getRequiredElement("lockButton"),
    entryCount: getRequiredElement("entryCount"),
    browseEntriesByYearChart: getRequiredElement("browseEntriesByYearChart"),
    browseLengthByYearChart: getRequiredElement("browseLengthByYearChart"),
    recentEntries: getRequiredElement("recentEntries"),
    searchInput: getRequiredElement("searchInput"),
    browseEntryDetail: getRequiredElement("browseEntryDetail"),
    browseStatus: getRequiredElement("browseStatus"),
    newEntryButton: getRequiredElement("newEntryButton"),
    exportButton: getRequiredElement("exportButton"),
    backupStatus: getRequiredElement("backupStatus"),
    entryForm: getRequiredElement("entryForm"),
    entryDate: getRequiredElement("entryDate"),
    moodSelect: getRequiredElement("moodSelect"),
    moodPills: getRequiredElement("moodPills"),
    energyInput: getRequiredElement("energyInput"),
    energyValue: getRequiredElement("energyValue"),
    energyScale: getRequiredElement("energyScale"),
    stressInput: getRequiredElement("stressInput"),
    stressValue: getRequiredElement("stressValue"),
    stressScale: getRequiredElement("stressScale"),
    journalText: getRequiredElement("journalText"),
    themesInput: getRequiredElement("themesInput"),
    topicTitleInput: getRequiredElement("topicTitleInput"),
    addTopicButton: getRequiredElement("addTopicButton"),
    topicCount: getRequiredElement("topicCount"),
    topicList: getRequiredElement("topicList"),
    rotatePromptsButton: getRequiredElement("rotatePromptsButton"),
    promptList: getRequiredElement("promptList"),
    weekRange: getRequiredElement("weekRange"),
    weekSummary: getRequiredElement("weekSummary"),
    weeklyQuestions: getRequiredElement("weeklyQuestions"),
    entryStatus: getRequiredElement("entryStatus"),
    entrySavedState: getRequiredElement("entrySavedState"),
    entryAdviceButton: getRequiredElement("entryAdviceButton"),
    entryAdviceEstimate: getRequiredElement("entryAdviceEstimate"),
    entryAdviceStatus: getRequiredElement("entryAdviceStatus"),
    entryAdviceResult: getRequiredElement("entryAdviceResult"),
    topicTrendScope: getRequiredElement("topicTrendScope"),
    topicTrendList: getRequiredElement("topicTrendList"),
    llmRuntimeLabel: getRequiredElement("llmRuntimeLabel"),
    llmScopeSelect: getRequiredElement("llmScopeSelect"),
    llmEntryCacheButton: getRequiredElement("llmEntryCacheButton"),
    llmYearCacheButton: getRequiredElement("llmYearCacheButton"),
    llmGenerateButton: getRequiredElement("llmGenerateButton"),
    llmEstimate: getRequiredElement("llmEstimate"),
    llmCacheStatus: getRequiredElement("llmCacheStatus"),
    llmCacheBrowser: getRequiredElement("llmCacheBrowser"),
    llmCostReport: getRequiredElement("llmCostReport"),
    llmStatus: getRequiredElement("llmStatus"),
    llmResult: getRequiredElement("llmResult"),
    llmApiKeyInput: getRequiredElement("llmApiKeyInput"),
    llmModelInput: getRequiredElement("llmModelInput"),
    llmResponseLanguageInput: getRequiredElement("llmResponseLanguageInput"),
    llmEntryAdviceSystemPrompt: getRequiredElement("llmEntryAdviceSystemPrompt"),
    llmEntryAdviceUserPrompt: getRequiredElement("llmEntryAdviceUserPrompt"),
    llmEntryCacheSystemPrompt: getRequiredElement("llmEntryCacheSystemPrompt"),
    llmEntryCacheUserPrompt: getRequiredElement("llmEntryCacheUserPrompt"),
    llmYearSummarySystemPrompt: getRequiredElement("llmYearSummarySystemPrompt"),
    llmYearSummaryUserPrompt: getRequiredElement("llmYearSummaryUserPrompt"),
    llmFinalInsightSystemPrompt: getRequiredElement("llmFinalInsightSystemPrompt"),
    llmFinalInsightUserPrompt: getRequiredElement("llmFinalInsightUserPrompt"),
    llmResetPromptsButton: getRequiredElement("llmResetPromptsButton"),
    llmPricingStatus: getRequiredElement("llmPricingStatus"),
    llmSaveSettingsButton: getRequiredElement("llmSaveSettingsButton"),
    llmForgetKeyButton: getRequiredElement("llmForgetKeyButton"),
    llmSettingsStatus: getRequiredElement("llmSettingsStatus"),
    themeSelect: getRequiredElement("themeSelect"),
    fontSelect: getRequiredElement("fontSelect"),
    uiWidthInput: getRequiredElement("uiWidthInput")
  };
}

function getRequiredElement<K extends keyof AppElements>(id: K): AppElements[K] {
  const element = document.getElementById(id);
  const expected = elementTypes[id];
  if (!element || !(element instanceof expected)) {
    throw new Error(`Missing or invalid #${id} element.`);
  }
  return element as AppElements[K];
}

function bindEvents(): void {
  els.authForm.addEventListener("submit", onAuthSubmit);
  els.lockButton.addEventListener("click", onLockClick);
  els.autoLockSelect.addEventListener("change", onAutoLockChange);
  els.newEntryButton.addEventListener("click", startTodayEntry);
  els.entryForm.addEventListener("submit", onEntrySubmit);
  els.entryForm.addEventListener("input", onEntryFormInput);
  els.entryForm.addEventListener("change", onEntryFormChange);
  els.entryDate.addEventListener("change", onDateChange);
  els.addTopicButton.addEventListener("click", addStandingTopic);
  els.topicTitleInput.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addStandingTopic();
  });
  els.rotatePromptsButton.addEventListener("click", async () => {
    const saved = await flushAutoSave();
    if (!saved) return;
    state.promptShift = (state.promptShift + 4) % REFLECTION_PROMPTS.length;
    renderPrompts();
    state.lastSavedFingerprint = currentEntryFingerprint();
    resetAutoLockTimer();
  });
  els.searchInput.addEventListener("input", renderSearch);
  els.llmScopeSelect.addEventListener("change", onLlmScopeChange);
  els.llmEntryCacheButton.addEventListener("click", () => void updateLlmEntryCache());
  els.llmYearCacheButton.addEventListener("click", () => void updateLlmYearSummaries());
  els.llmGenerateButton.addEventListener("click", () => void generateLlmInsights());
  els.entryAdviceButton.addEventListener("click", () => void requestEntryAdvice());
  els.llmSaveSettingsButton.addEventListener("click", () => void saveLlmSettingsFromControls());
  els.llmForgetKeyButton.addEventListener("click", () => void forgetLlmApiKey());
  els.llmResetPromptsButton.addEventListener("click", resetLlmPromptControlsToDefaults);
  els.themeSelect.addEventListener("change", onThemeChange);
  els.fontSelect.addEventListener("change", onFontChange);
  els.uiWidthInput.addEventListener("change", onUiWidthChange);
  els.exportButton.addEventListener("click", exportBackup);
  els.lockedImportButton.addEventListener("click", () => els.backupFileInput.click());
  els.unlockedImportButton.addEventListener("click", () => els.backupFileInput.click());
  els.backupFileInput.addEventListener("change", onBackupFileSelected);
  bindTabEvents();

  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, resetAutoLockTimer, { passive: true });
  });
  window.addEventListener("mousemove", () => {
    const now = Date.now();
    if (now - state.activityThrottleAt > 15000) {
      state.activityThrottleAt = now;
      resetAutoLockTimer();
    }
  }, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
}

function bindTabEvents(): void {
  for (const button of getTabButtons()) {
    button.addEventListener("click", () => activateTab(normalizeTab(button.dataset.tab)));
    button.addEventListener("keydown", onTabKeydown);
  }
}

function onTabKeydown(event: KeyboardEvent): void {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const buttons = getTabButtons();
  const current = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
  const currentIndex = current ? buttons.indexOf(current) : -1;
  if (currentIndex < 0) return;

  event.preventDefault();
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft") nextIndex = currentIndex === 0 ? buttons.length - 1 : currentIndex - 1;
  if (event.key === "ArrowRight") nextIndex = currentIndex === buttons.length - 1 ? 0 : currentIndex + 1;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = buttons.length - 1;

  const nextButton = buttons[nextIndex];
  if (!nextButton) return;
  activateTab(normalizeTab(nextButton.dataset.tab));
  nextButton.focus();
}

function activateTab(tab: AppTab): void {
  state.activeTab = tab;

  for (const button of getTabButtons()) {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  }

  for (const panel of getTabPanels()) {
    panel.hidden = panel.dataset.tabPanel !== tab;
  }
}

function normalizeTab(value: unknown): AppTab {
  return TABS.includes(value as AppTab) ? value as AppTab : "write";
}

function getTabButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("[data-tab-button]"));
}

function getTabPanels(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-tab-panel]"));
}

function populateMoodOptions(): void {
  const emptyMoodButton = moodButton("", "None");
  els.moodPills.append(emptyMoodButton);

  for (const mood of MOODS) {
    const option = document.createElement("option");
    option.value = mood.value;
    option.textContent = mood.label;
    els.moodSelect.append(option);
    els.moodPills.append(moodButton(mood.value, mood.label));
  }

  populateMetricScale(els.energyScale, els.energyInput);
  populateMetricScale(els.stressScale, els.stressInput);
}

function moodButton(value: MoodValue, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mood-pill";
  button.dataset.moodValue = value;
  button.setAttribute("role", "radio");
  button.textContent = label;
  button.addEventListener("click", () => {
    els.moodSelect.value = value;
    syncEntryChoiceControls();
    scheduleAutoSave();
  });
  return button;
}

function populateMetricScale(container: HTMLElement, input: HTMLInputElement): void {
  for (let value = 1; value <= 10; value += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "metric-button";
    button.dataset.metricValue = String(value);
    button.setAttribute("role", "radio");
    button.textContent = String(value);
    button.addEventListener("click", () => {
      input.value = String(value);
      syncEntryChoiceControls();
      scheduleAutoSave();
    });
    container.append(button);
  }
}

function syncEntryChoiceControls(): void {
  syncMoodPills();
  syncMetricScale(els.energyScale, els.energyInput, els.energyValue);
  syncMetricScale(els.stressScale, els.stressInput, els.stressValue);
}

function syncMoodPills(): void {
  const selected = normalizeMoodValue(els.moodSelect.value);
  for (const button of Array.from(els.moodPills.querySelectorAll<HTMLButtonElement>("[data-mood-value]"))) {
    const isActive = button.dataset.moodValue === selected;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-checked", String(isActive));
  }
}

function syncMetricScale(container: HTMLElement, input: HTMLInputElement, valueElement: HTMLElement): void {
  const selected = String(clampNumber(input.value, 1, 10, 5));
  input.value = selected;
  valueElement.textContent = selected;

  for (const button of Array.from(container.querySelectorAll<HTMLButtonElement>("[data-metric-value]"))) {
    const isActive = button.dataset.metricValue === selected;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-checked", String(isActive));
  }
}

async function onLockClick(): Promise<void> {
  await lockAfterAutoSave("Locked.");
}

function onEntryFormInput(event: Event): void {
  syncEntryLiveFields(event.target);
  scheduleAutoSaveForField(event.target);
  renderEntryAdviceControls();
  renderEntryAdviceResult();
}

function onEntryFormChange(event: Event): void {
  syncEntryLiveFields(event.target);
  scheduleAutoSaveForField(event.target);
  renderEntryAdviceControls();
  renderEntryAdviceResult();
}

function syncEntryLiveFields(target: EventTarget | null): void {
  if (target === els.energyInput) {
    syncEntryChoiceControls();
  } else if (target === els.stressInput) {
    syncEntryChoiceControls();
  } else if (isFieldElement(target) && target.dataset.topicAcuteness) {
    const card = target.closest("[data-topic-id]");
    const value = card?.querySelector("[data-topic-value]");
    if (value) value.textContent = target.value;
  }
}

function scheduleAutoSaveForField(target: EventTarget | null): void {
  if (!isEntryAutoSaveField(target)) return;
  scheduleAutoSave();
}

function isEntryAutoSaveField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target === els.moodSelect ||
    target === els.energyInput ||
    target === els.stressInput ||
    target === els.journalText ||
    target === els.themesInput ||
    target.matches("[data-prompt-field], [data-weekly-field], [data-topic-field]");
}

function isFieldElement(value: EventTarget | null): value is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return value instanceof HTMLInputElement || value instanceof HTMLSelectElement || value instanceof HTMLTextAreaElement;
}
