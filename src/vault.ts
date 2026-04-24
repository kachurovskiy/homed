async function onAuthSubmit(event: Event): Promise<void> {
  event.preventDefault();
  if (state.busy) return;

  const password = els.passwordInput.value;
  const confirmPassword = els.confirmPasswordInput.value;

  try {
    state.busy = true;
    els.authButton.disabled = true;
    setStatus(els.authStatus, state.vault ? "Deriving key and checking password..." : "Creating encrypted vault...", "warn");

    if (state.vault) {
      await unlockVault(password);
    } else {
      await createVault(password, confirmPassword);
    }
  } catch (error) {
    setStatus(els.authStatus, readableError(error), "error");
  } finally {
    state.busy = false;
    els.authButton.disabled = false;
  }
}

async function createVault(password: string, confirmPassword: string): Promise<void> {
  if (password.length < 10) {
    throw new Error("Use at least 10 characters. Longer is better.");
  }
  if (password !== confirmPassword) {
    throw new Error("The repeated password does not match.");
  }

  const saltBytes = randomBytes(SALT_BYTES);
  const key = await deriveVaultKey(password, saltBytes, PBKDF2_ITERATIONS);
  const verifier = await encryptJson(key, {
    purpose: "vault-verifier",
    createdAt: new Date().toISOString(),
    random: bytesToBase64(randomBytes(16))
  });

  const now = new Date().toISOString();
  const vault: VaultMeta = {
    version: 1,
    createdAt: now,
    updatedAt: now,
    salt: bytesToBase64(saltBytes),
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS
    },
    cipher: {
      name: "AES-GCM",
      length: 256
    },
    verifier,
    autoLockMinutes: 10
  };

  await replaceVault({ vault, entries: [] });
  state.vault = vault;
  state.key = key;
  await enterUnlockedState();
}

async function unlockVault(password: string): Promise<void> {
  if (!state.vault) {
    throw new Error("No vault exists yet.");
  }

  const saltBytes = base64ToBytes(state.vault.salt, "vault salt");
  const iterations = getIterations(state.vault);
  const key = await deriveVaultKey(password, saltBytes, iterations);

  try {
    const verifier = await decryptJson<{ purpose?: unknown }>(key, state.vault.verifier.encryptedData, state.vault.verifier.iv);
    if (!verifier || verifier.purpose !== "vault-verifier") {
      throw new Error("Invalid verifier.");
    }
  } catch (error) {
    throw new Error("That password did not unlock this vault.");
  }

  state.key = key;
  await enterUnlockedState();
}

async function enterUnlockedState(): Promise<void> {
  const loadResult = await loadEntriesIntoMemory();
  await loadLlmState();
  state.unlockedSession += 1;
  els.passwordInput.value = "";
  els.confirmPasswordInput.value = "";
  els.lockedView.hidden = true;
  els.unlockedView.hidden = false;
  activateTab(state.activeTab);
  els.entryDate.value = state.currentDate;
  els.autoLockSelect.value = String(getAutoLockMinutes());
  els.unlockSummary.textContent = "Unlocked at " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  setStatus(els.authStatus, "", "");
  setStatus(els.backupStatus, "", "");
  setStatus(
    els.entryStatus,
    loadResult.failed ? `${loadResult.failed} encrypted entr${loadResult.failed === 1 ? "y" : "ies"} could not be decrypted.` : "",
    loadResult.failed ? "warn" : ""
  );
  renderAll();
  void refreshOpenRouterModelPricing(false);
  void refreshOpenRouterCredits(false);
  resetAutoLockTimer();
}

async function loadEntriesIntoMemory(): Promise<{ failed: number }> {
  const key = requireKey();
  const records = await getAllEntryRecords();
  state.records = new Map<string, EntryRecord>();
  state.entries = new Map<string, DiaryEntry>();
  let failed = 0;

  for (const record of records) {
    state.records.set(record.id, record);
    try {
      const entry = await decryptJson<unknown>(key, record.encryptedData, record.iv);
      if (isRecord(entry) && entry.date) {
        state.entries.set(record.id, normalizeEntry(entry));
      } else {
        failed += 1;
      }
    } catch (error) {
      failed += 1;
    }
  }

  return { failed };
}

function lockVault(message: string): void {
  clearTimeout(state.lockTimer);
  clearAutoSaveTimer();
  state.lockTimer = undefined;
  state.saveQueued = false;
  state.lastSavedFingerprint = "";
  state.unlockedSession += 1;
  state.key = null;
  state.entries = new Map<string, DiaryEntry>();
  state.records = new Map<string, EntryRecord>();
  state.llmSettings = defaultLlmSettings();
  state.llmPricing = null;
  state.llmCredits = null;
  state.llmEntryCapsules = new Map<string, LlmEntryCapsule>();
  state.llmYearSummaries = new Map<string, LlmYearSummary>();
  state.llmRunLogs = new Map<string, LlmRunLog>();
  state.llmCacheBrowserOpen = false;
  state.llmBusyAction = "";
  state.llmLastRun = null;
  state.llmEntryAdviceRuns = new Map<string, LlmEntryAdviceRunResult>();
  clearUnlockedDom();
  els.unlockedView.hidden = true;
  els.lockedView.hidden = false;
  renderAuthMode();
  setStatus(els.authStatus, message || "Locked.", "ok");
}

function clearUnlockedDom(): void {
  els.passwordInput.value = "";
  els.confirmPasswordInput.value = "";
  els.searchInput.value = "";
  els.entryDate.value = todayLocal();
  els.moodSelect.value = "";
  els.energyInput.value = "5";
  els.stressInput.value = "5";
  els.energyValue.textContent = "5";
  els.stressValue.textContent = "5";
  syncEntryChoiceControls();
  els.journalText.value = "";
  els.themesInput.value = "";
  els.topicTitleInput.value = "";
  els.topicCount.textContent = "0 tracked";
  els.topicList.replaceChildren();
  els.promptList.replaceChildren();
  els.weekRange.textContent = "This week";
  els.weekSummary.replaceChildren();
  els.weeklyQuestions.replaceChildren();
  els.entrySavedState.textContent = "Not saved yet";
  els.entryAdviceButton.textContent = "Ask for guidance";
  els.entryAdviceButton.disabled = true;
  els.entryAdviceEstimate.textContent = "Set OpenRouter settings first.";
  els.entryAdviceResult.replaceChildren();
  els.entryCount.textContent = "0 entries";
  els.browseEntriesByYearChart.replaceChildren();
  els.browseLengthByYearChart.replaceChildren();
  els.recentEntries.replaceChildren();
  els.browseEntryDetail.replaceChildren();
  setStatus(els.browseStatus, "", "");
  els.unlockSummary.textContent = "Locked";
  els.backupFileInput.value = "";
  els.llmRuntimeLabel.textContent = "Model not configured";
  els.llmScopeSelect.value = state.llmScope;
  els.llmEstimate.textContent = "Projected cost unavailable";
  els.llmCacheStatus.textContent = "Cache status unavailable.";
  els.llmApiKeyInput.value = "";
  els.llmModelInput.value = OPENROUTER_DEFAULT_MODEL;
  els.llmResponseLanguageInput.value = LLM_DEFAULT_RESPONSE_LANGUAGE;
  renderLlmPromptSettingsControls(defaultLlmPromptSettings());
  els.llmPricingStatus.textContent = "Pricing loads from OpenRouter for the saved model.";
  els.topicTrendScope.textContent = "Last 30 days";
  els.topicTrendList.replaceChildren();
  setStatus(els.backupStatus, "", "");
  setStatus(els.entryStatus, "", "");
  setStatus(els.entryAdviceStatus, "", "");
  setStatus(els.llmSettingsStatus, "", "");
  setStatus(els.llmStatus, "", "");
  els.llmCacheBrowser.replaceChildren();
  els.llmCostReport.replaceChildren();
  els.llmResult.replaceChildren();
}

async function onAutoLockChange(): Promise<void> {
  if (!state.vault) return;
  const minutes = Number(els.autoLockSelect.value);
  if (!Number.isFinite(minutes) || minutes < 1) return;
  state.vault = {
    ...state.vault,
    autoLockMinutes: minutes,
    updatedAt: new Date().toISOString()
  };
  await setVaultMeta(state.vault);
  resetAutoLockTimer();
}

function resetAutoLockTimer(): void {
  if (!state.key) return;
  clearTimeout(state.lockTimer);
  state.lockTimer = window.setTimeout(() => {
    void lockAfterAutoSave("Locked after inactivity.");
  }, getAutoLockMinutes() * 60 * 1000);
}

async function lockAfterAutoSave(message: string): Promise<void> {
  const saved = await flushAutoSave();
  if (!saved) {
    setStatus(els.entryStatus, "Lock cancelled because the current entry was not saved.", "error");
    setStatus(els.backupStatus, "Lock cancelled because the current entry was not saved.", "error");
    resetAutoLockTimer();
    return;
  }
  lockVault(message);
}

function onVisibilityChange(): void {
  if (!state.key) return;
  if (document.hidden) {
    state.hiddenAt = Date.now();
    void flushAutoSave();
    return;
  }
  const elapsed = Date.now() - state.hiddenAt;
  if (state.hiddenAt && elapsed >= getAutoLockMinutes() * 60 * 1000) {
    void lockAfterAutoSave("Locked after inactivity.");
  } else {
    resetAutoLockTimer();
  }
}
