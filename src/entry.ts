async function onDateChange(): Promise<void> {
  const nextDate = els.entryDate.value;
  if (!nextDate) return;
  if (!isIsoDate(nextDate)) {
    setStatus(els.entryStatus, "Choose a valid date.", "error");
    return;
  }

  const previousDate = state.currentDate;
  if (nextDate === previousDate) return;

  if (state.autoSaveTimer) {
    els.entryDate.value = previousDate;
  }

  const saved = await flushAutoSave();
  if (!saved) {
    els.entryDate.value = previousDate;
    return;
  }

  state.currentDate = nextDate;
  state.promptShift = 0;
  renderEntryScreen();
  renderRecentEntries();
  setStatus(els.entryStatus, "Auto-save is on.", "ok");
  resetAutoLockTimer();
}

async function startTodayEntry(): Promise<void> {
  const saved = await flushAutoSave();
  if (!saved) return;
  state.currentDate = todayLocal();
  state.promptShift = 0;
  renderAll();
  activateTab("write");
  els.journalText.focus();
  setStatus(
    els.entryStatus,
    state.entries.has(state.currentDate) ? "Opened today's entry." : "New entry for today. Auto-save is on.",
    "ok"
  );
  resetAutoLockTimer();
}

async function onEntrySubmit(event: Event): Promise<void> {
  event.preventDefault();
  await flushAutoSave();
}

function scheduleAutoSave(delay = AUTO_SAVE_DELAY_MS): void {
  if (!state.key) return;
  clearAutoSaveTimer();
  state.autoSaveTimer = window.setTimeout(() => {
    state.autoSaveTimer = undefined;
    void saveCurrentEntry();
  }, delay);
  setStatus(els.entryStatus, "Unsaved changes...", "warn");
  resetAutoLockTimer();
}

function clearAutoSaveTimer(): void {
  if (!state.autoSaveTimer) return;
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = undefined;
}

async function flushAutoSave(): Promise<boolean> {
  if (!state.key) return true;
  if (state.autoSaveTimer) {
    clearAutoSaveTimer();
    return saveCurrentEntry();
  }
  if (state.savePromise) {
    return state.savePromise;
  }
  return true;
}

async function saveCurrentEntry(): Promise<boolean> {
  if (!state.key) return true;
  if (state.savePromise) {
    state.saveQueued = true;
    return state.savePromise;
  }

  state.savePromise = runEntrySaveQueue();
  return state.savePromise;
}

async function runEntrySaveQueue(): Promise<boolean> {
  let saved = true;

  try {
    do {
      state.saveQueued = false;
      saved = await saveEntryOnce();
    } while (saved && state.saveQueued);
    return saved;
  } finally {
    state.savePromise = null;
    state.saveQueued = false;
    resetAutoLockTimer();
  }
}

async function saveEntryOnce(): Promise<boolean> {
  const key = state.key;
  const session = state.unlockedSession;
  if (!key) return true;

  let payload: DiaryEntry;
  try {
    payload = collectEntryPayload();
  } catch (error) {
    setStatus(els.entryStatus, "Entry was not saved: " + readableError(error), "error");
    return false;
  }

  const fingerprint = entryFingerprint(payload);
  if (fingerprint === state.lastSavedFingerprint) {
    setStatus(els.entryStatus, "All changes saved.", "ok");
    return true;
  }

  try {
    setStatus(els.entryStatus, "Auto-saving encrypted entry...", "warn");

    const existingRecord = state.records.get(payload.date);
    const now = new Date().toISOString();
    const encrypted = await encryptJson(key, payload);
    const record: EntryRecord = {
      id: payload.date,
      date: payload.date,
      createdAt: existingRecord?.createdAt || now,
      updatedAt: now,
      encryptedData: encrypted.encryptedData,
      iv: encrypted.iv
    };

    if (state.key !== key || state.unlockedSession !== session) return true;
    await putEntryRecord(record);
    if (state.key !== key || state.unlockedSession !== session) return true;

    state.records.set(record.id, record);
    state.entries.set(record.id, payload);
    if (record.id === state.currentDate) {
      state.lastSavedFingerprint = fingerprint;
      els.entrySavedState.textContent = "Updated " + formatDateTime(record.updatedAt);
    }
    setStatus(els.entryStatus, "All changes saved.", "ok");
    renderRecentEntries();
    renderInsights();
    return true;
  } catch (error) {
    if (state.key === key && state.unlockedSession === session) {
      setStatus(els.entryStatus, "Entry was not saved: " + readableError(error), "error");
    }
    return false;
  }
}

function collectEntryPayload(): DiaryEntry {
  const date = els.entryDate.value;
  if (!isIsoDate(date)) {
    throw new Error("Choose a valid date.");
  }

  const energy = Number(els.energyInput.value);
  const stress = Number(els.stressInput.value);
  if (!Number.isInteger(energy) || energy < 1 || energy > 10) {
    throw new Error("Energy must be between 1 and 10.");
  }
  if (!Number.isInteger(stress) || stress < 1 || stress > 10) {
    throw new Error("Stress must be between 1 and 10.");
  }

  const existing = state.entries.get(date);
  const promptAnswers = { ...(existing?.promptAnswers || {}) };

  document.querySelectorAll<HTMLTextAreaElement>("[data-prompt-field]").forEach((textarea) => {
    const prompt = textarea.dataset.promptField;
    const value = textarea.value.trim();
    if (!prompt) return;
    if (value) promptAnswers[prompt] = value;
    else delete promptAnswers[prompt];
  });

  document.querySelectorAll<HTMLTextAreaElement>("[data-weekly-field]").forEach((textarea) => {
    const question = textarea.dataset.weeklyField;
    if (!question) return;
    const key = weeklyAnswerKey(question);
    const value = textarea.value.trim();
    if (value) promptAnswers[key] = value;
    else delete promptAnswers[key];
  });

  return {
    date,
    mood: normalizeMoodValue(els.moodSelect.value),
    energy,
    stress,
    journalText: els.journalText.value.trim(),
    promptAnswers,
    themes: parseThemes(els.themesInput.value),
    standingTopics: collectStandingTopics()
  };
}

function collectStandingTopics(): StandingTopic[] {
  return Array.from(els.topicList.querySelectorAll<HTMLElement>("[data-topic-id]"))
    .map((card) => {
      const id = card.dataset.topicId;
      const title = normalizeTopicTitle(card.dataset.topicTitle || "");
      const acutenessInput = card.querySelector<HTMLInputElement>('[data-topic-field="acuteness"]');
      const directionInput = card.querySelector<HTMLSelectElement>('[data-topic-field="direction"]');
      const commentInput = card.querySelector<HTMLTextAreaElement>('[data-topic-field="comment"]');
      const nextStepInput = card.querySelector<HTMLInputElement>('[data-topic-field="nextStep"]');
      return normalizeStandingTopic({
        id,
        title,
        acuteness: acutenessInput?.value,
        direction: directionInput?.value,
        comment: commentInput?.value,
        nextStep: nextStepInput?.value,
        active: true
      });
    })
    .filter((topic): topic is StandingTopic => Boolean(topic))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function currentEntryFingerprint(): string {
  try {
    return entryFingerprint(collectEntryPayload());
  } catch (error) {
    return "";
  }
}

function entryFingerprint(payload: DiaryEntry): string {
  return JSON.stringify(payload);
}
