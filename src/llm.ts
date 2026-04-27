function defaultLlmSettings(): LlmSettings {
  return {
    apiKey: "",
    model: OPENROUTER_DEFAULT_MODEL,
    responseLanguage: LLM_DEFAULT_RESPONSE_LANGUAGE,
    prompts: defaultLlmPromptSettings()
  };
}

function defaultLlmPromptSettings(): LlmPromptSettings {
  return { ...DEFAULT_LLM_PROMPTS };
}

async function loadLlmState(): Promise<void> {
  state.llmSettings = defaultLlmSettings();
  state.llmPricing = null;
  state.llmCredits = null;
  state.llmEntryCapsules = new Map<string, LlmEntryCapsule>();
  state.llmYearSummaries = new Map<string, LlmYearSummary>();
  state.llmRunLogs = new Map<string, LlmRunLog>();
  state.llmLastRun = null;

  const records = await getAllLlmRecords();
  for (const record of records) {
    const decrypted = await readEncryptedLlmRecord<unknown>(record);
    if (!decrypted) continue;

    if (record.id === LLM_SETTINGS_ID && record.kind === "settings") {
      state.llmSettings = normalizeLlmSettings(decrypted);
      continue;
    }

    if (record.kind === "entry-capsule") {
      const capsule = normalizeLoadedLlmEntryCapsule(decrypted);
      if (capsule) state.llmEntryCapsules.set(capsule.date, { ...capsule, id: record.id });
      continue;
    }

    if (record.kind === "year-summary") {
      const summary = normalizeLoadedLlmYearSummary(decrypted);
      if (summary) state.llmYearSummaries.set(summary.year, { ...summary, id: record.id });
      continue;
    }

    if (record.kind === "run-log") {
      const log = normalizeLoadedLlmRunLog(decrypted);
      if (log) state.llmRunLogs.set(record.id, log);
    }
  }
}

function renderLlmSettingsControls(): void {
  els.llmApiKeyInput.value = state.llmSettings.apiKey;
  els.llmModelInput.value = state.llmSettings.model;
  els.llmResponseLanguageInput.value = state.llmSettings.responseLanguage;
  renderLlmPromptSettingsControls(state.llmSettings.prompts);
  els.llmPricingStatus.textContent = llmPricingStatusText();
}

async function saveLlmSettingsFromControls(): Promise<void> {
  if (state.llmBusyAction) return;

  try {
    state.llmBusyAction = "settings";
    const previousSettings = state.llmSettings;
    const previousModel = previousSettings.model;
    const settings = collectLlmSettingsFromControls();
    state.llmSettings = settings;
    if (previousModel !== settings.model) state.llmPricing = null;
    if (llmVisibleRunSettingsChanged(previousSettings, settings)) {
      state.llmLastRun = null;
      state.llmEntryAdviceRuns = new Map<string, LlmEntryAdviceRunResult>();
    }
    state.llmCredits = null;
    await putEncryptedLlmRecord(LLM_SETTINGS_ID, "settings", settings);
    setStatus(els.llmSettingsStatus, "LLM settings saved. Fetching pricing and balance from OpenRouter...", "warn");
    await refreshOpenRouterModelPricing(true);
    await refreshOpenRouterCredits(false);
    renderInsights();
    renderBrowseEntryDetail();
    resetAutoLockTimer();
  } catch (error) {
    setStatus(els.llmSettingsStatus, "LLM settings were not saved: " + readableError(error), "error");
  } finally {
    state.llmBusyAction = "";
    renderLlmSettingsControls();
    renderLlmInsightControls();
  }
}

async function forgetLlmApiKey(): Promise<void> {
  if (state.llmBusyAction) return;
  els.llmApiKeyInput.value = "";
  state.llmSettings = {
    ...state.llmSettings,
    apiKey: ""
  };
  state.llmCredits = null;

  try {
    await putEncryptedLlmRecord(LLM_SETTINGS_ID, "settings", state.llmSettings);
    setStatus(els.llmSettingsStatus, "OpenRouter API key removed from encrypted settings.", "ok");
    renderLlmSettingsControls();
    renderInsights();
    resetAutoLockTimer();
  } catch (error) {
    setStatus(els.llmSettingsStatus, "API key was not removed: " + readableError(error), "error");
  }
}

function collectLlmSettingsFromControls(): LlmSettings {
  const model = normalizeLlmModel(els.llmModelInput.value);
  if (!model) throw new Error("Enter an OpenRouter model.");

  return {
    apiKey: els.llmApiKeyInput.value.trim(),
    model,
    responseLanguage: normalizeLlmResponseLanguage(els.llmResponseLanguageInput.value),
    prompts: collectLlmPromptSettingsFromControls()
  };
}

function normalizeLlmSettings(value: unknown): LlmSettings {
  const defaults = defaultLlmSettings();
  if (!isRecord(value)) return defaults;

  return {
    apiKey: typeof value.apiKey === "string" ? value.apiKey.trim() : "",
    model: normalizeLlmModel(value.model) || defaults.model,
    responseLanguage: normalizeLlmResponseLanguage(value.responseLanguage),
    prompts: normalizeLlmPromptSettings(value.prompts)
  };
}

function renderLlmPromptSettingsControls(prompts: LlmPromptSettings): void {
  els.llmEntryAdviceSystemPrompt.value = prompts.entryAdviceSystem;
  els.llmEntryAdviceUserPrompt.value = prompts.entryAdviceUser;
  els.llmEntryCacheSystemPrompt.value = prompts.entryCapsuleSystem;
  els.llmEntryCacheUserPrompt.value = prompts.entryCapsuleUser;
  els.llmYearSummarySystemPrompt.value = prompts.yearSummarySystem;
  els.llmYearSummaryUserPrompt.value = prompts.yearSummaryUser;
  els.llmFinalInsightSystemPrompt.value = prompts.finalInsightSystem;
  els.llmFinalInsightUserPrompt.value = prompts.finalInsightUser;
}

function collectLlmPromptSettingsFromControls(): LlmPromptSettings {
  const defaults = defaultLlmPromptSettings();
  return {
    entryAdviceSystem: normalizeLlmPromptTemplate(els.llmEntryAdviceSystemPrompt.value, defaults.entryAdviceSystem),
    entryAdviceUser: normalizeLlmPromptTemplate(els.llmEntryAdviceUserPrompt.value, defaults.entryAdviceUser),
    entryCapsuleSystem: normalizeLlmPromptTemplate(els.llmEntryCacheSystemPrompt.value, defaults.entryCapsuleSystem),
    entryCapsuleUser: normalizeLlmPromptTemplate(els.llmEntryCacheUserPrompt.value, defaults.entryCapsuleUser),
    yearSummarySystem: normalizeLlmPromptTemplate(els.llmYearSummarySystemPrompt.value, defaults.yearSummarySystem),
    yearSummaryUser: normalizeLlmPromptTemplate(els.llmYearSummaryUserPrompt.value, defaults.yearSummaryUser),
    finalInsightSystem: normalizeLlmPromptTemplate(els.llmFinalInsightSystemPrompt.value, defaults.finalInsightSystem),
    finalInsightUser: normalizeLlmPromptTemplate(els.llmFinalInsightUserPrompt.value, defaults.finalInsightUser)
  };
}

function normalizeLlmPromptSettings(value: unknown): LlmPromptSettings {
  const defaults = defaultLlmPromptSettings();
  if (!isRecord(value)) return defaults;
  return {
    entryAdviceSystem: normalizeLlmPromptTemplate(value.entryAdviceSystem, defaults.entryAdviceSystem),
    entryAdviceUser: normalizeLlmPromptTemplate(value.entryAdviceUser, defaults.entryAdviceUser),
    entryCapsuleSystem: normalizeLlmPromptTemplate(value.entryCapsuleSystem, defaults.entryCapsuleSystem),
    entryCapsuleUser: normalizeLlmPromptTemplate(value.entryCapsuleUser, defaults.entryCapsuleUser),
    yearSummarySystem: normalizeLlmPromptTemplate(value.yearSummarySystem, defaults.yearSummarySystem),
    yearSummaryUser: normalizeLlmPromptTemplate(value.yearSummaryUser, defaults.yearSummaryUser),
    finalInsightSystem: normalizeLlmPromptTemplate(value.finalInsightSystem, defaults.finalInsightSystem),
    finalInsightUser: normalizeLlmPromptTemplate(value.finalInsightUser, defaults.finalInsightUser)
  };
}

function normalizeLlmPromptTemplate(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const prompt = value.replace(/\r\n/g, "\n").trim().slice(0, LLM_PROMPT_TEMPLATE_LIMIT);
  return prompt || fallback;
}

function resetLlmPromptControlsToDefaults(): void {
  renderLlmPromptSettingsControls(defaultLlmPromptSettings());
  setStatus(els.llmSettingsStatus, "Default LLM prompts loaded. Save LLM settings to keep them.", "warn");
  resetAutoLockTimer();
}

function llmVisibleRunSettingsChanged(previous: LlmSettings, next: LlmSettings): boolean {
  return previous.model !== next.model ||
    previous.responseLanguage !== next.responseLanguage ||
    llmPromptSettingsFingerprint(previous.prompts) !== llmPromptSettingsFingerprint(next.prompts);
}

function llmPromptSettingsFingerprint(prompts: LlmPromptSettings): string {
  return hashText(JSON.stringify(prompts));
}

function normalizeLlmModel(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, "").trim().slice(0, 120) : "";
}

function normalizeLlmResponseLanguage(value: unknown): string {
  if (typeof value !== "string") return LLM_DEFAULT_RESPONSE_LANGUAGE;
  const language = value.replace(/\s+/g, " ").trim().slice(0, 80);
  return language || LLM_DEFAULT_RESPONSE_LANGUAGE;
}

async function refreshOpenRouterModelPricing(showStatus: boolean): Promise<boolean> {
  const model = state.llmSettings.model;
  if (!model) {
    state.llmPricing = null;
    renderLlmSettingsControls();
    renderLlmInsightControls();
    return false;
  }

  if (state.llmPricing?.model === model) {
    renderLlmSettingsControls();
    renderLlmInsightControls();
    return true;
  }

  try {
    if (showStatus) setStatus(els.llmSettingsStatus, "Fetching current model pricing from OpenRouter...", "warn");
    state.llmPricing = await fetchOpenRouterModelPricing(model);
    if (showStatus) {
      setStatus(els.llmSettingsStatus, "LLM settings saved. " + llmPricingStatusText(), "ok");
    }
    renderLlmSettingsControls();
    renderLlmInsightControls();
    return true;
  } catch (error) {
    state.llmPricing = null;
    if (showStatus) {
      setStatus(els.llmSettingsStatus, "Pricing could not be loaded from OpenRouter: " + readableLlmError(error), "error");
    }
    renderLlmSettingsControls();
    renderLlmInsightControls();
    return false;
  }
}

async function refreshOpenRouterCredits(showStatus: boolean): Promise<boolean> {
  const apiKey = state.llmSettings.apiKey;
  if (!apiKey) {
    state.llmCredits = null;
    renderLlmInsightControls();
    return false;
  }

  try {
    if (showStatus) setStatus(els.llmSettingsStatus, "Fetching current OpenRouter balance...", "warn");
    state.llmCredits = await fetchOpenRouterCredits(apiKey);
    if (showStatus) {
      setStatus(els.llmSettingsStatus, "Current OpenRouter balance loaded.", "ok");
    }
    renderLlmInsightControls();
    return true;
  } catch (error) {
    state.llmCredits = null;
    if (showStatus) {
      setStatus(els.llmSettingsStatus, "OpenRouter balance could not be loaded: " + readableError(error), "error");
    }
    renderLlmInsightControls();
    return false;
  }
}

async function requireOpenRouterModelPricing(): Promise<LlmModelPricing> {
  if (state.llmPricing?.model === state.llmSettings.model) return state.llmPricing;
  const loaded = await refreshOpenRouterModelPricing(true);
  if (!loaded || !state.llmPricing) {
    throw new Error("OpenRouter pricing is unavailable for this model.");
  }
  return state.llmPricing;
}

async function fetchOpenRouterJson(url: string, init?: RequestInit): Promise<{ response: Response; payload: unknown }> {
  state.remoteRequestsInFlight += 1;
  renderRemoteActivity();

  try {
    const response = await fetch(url, init);
    const payload = await readJsonResponse(response);
    return { response, payload };
  } finally {
    state.remoteRequestsInFlight = Math.max(0, state.remoteRequestsInFlight - 1);
    renderRemoteActivity();
  }
}

function renderRemoteActivity(): void {
  const count = state.remoteRequestsInFlight;
  els.remoteActivity.hidden = count < 1;
  els.remoteActivity.replaceChildren();
  if (count < 1) {
    els.remoteActivity.removeAttribute("aria-label");
    return;
  }

  const spinner = document.createElement("span");
  spinner.className = "status-spinner";
  spinner.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.textContent = `${count} remote request${count === 1 ? "" : "s"}`;

  els.remoteActivity.setAttribute("aria-label", `${count} remote request${count === 1 ? "" : "s"} in flight`);
  els.remoteActivity.append(spinner, text);
}

async function fetchOpenRouterCredits(apiKey: string): Promise<LlmCredits> {
  const { response, payload } = await fetchOpenRouterJson(OPENROUTER_CREDITS_URL, {
    method: "GET",
    headers: {
      "Authorization": "Bearer " + apiKey
    }
  });
  if (!response.ok) throw new Error(openRouterErrorMessage(payload, response.status));
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error("OpenRouter returned an invalid credits response.");
  }

  const totalCredits = Number(payload.data.total_credits);
  const totalUsage = Number(payload.data.total_usage);
  if (!Number.isFinite(totalCredits) || !Number.isFinite(totalUsage)) {
    throw new Error("OpenRouter returned invalid credit totals.");
  }

  return {
    totalCredits,
    totalUsage,
    balance: totalCredits - totalUsage,
    fetchedAt: new Date().toISOString()
  };
}

async function fetchOpenRouterModelPricing(model: string): Promise<LlmModelPricing> {
  const { response, payload } = await fetchOpenRouterJson(OPENROUTER_MODELS_URL, { method: "GET" });
  if (!response.ok) throw new Error(openRouterErrorMessage(payload, response.status));
  if (!isRecord(payload)) throw new Error("OpenRouter returned an invalid models response.");

  const models = Array.isArray((payload as OpenRouterModelsResponse).data)
    ? (payload as OpenRouterModelsResponse).data as unknown[]
    : [];
  const matched = models.find((item) => isRecord(item) && item.id === model);
  if (!isRecord(matched)) throw new Error(`Model ${model} was not found in OpenRouter's model list.`);

  const pricing = matched.pricing;
  if (!isRecord(pricing)) throw new Error(`OpenRouter did not return pricing for ${model}.`);
  const prompt = Number(pricing.prompt);
  const completion = Number(pricing.completion);
  if (!Number.isFinite(prompt) || prompt < 0 || !Number.isFinite(completion) || completion < 0) {
    throw new Error(`OpenRouter returned invalid pricing for ${model}.`);
  }

  return {
    model,
    inputPricePerMillion: prompt * 1000000,
    outputPricePerMillion: completion * 1000000,
    fetchedAt: new Date().toISOString()
  };
}

function llmPricingStatusText(): string {
  const pricing = state.llmPricing;
  if (!pricing || pricing.model !== state.llmSettings.model) {
    return "Pricing not loaded. Save LLM settings to fetch current OpenRouter pricing.";
  }
  return `OpenRouter pricing for ${pricing.model}: ${formatUsdCost(pricing.inputPricePerMillion)} / 1M input tokens, ${formatUsdCost(pricing.outputPricePerMillion)} / 1M output tokens. Updated ${formatDateTime(pricing.fetchedAt)}.`;
}

function onLlmScopeChange(): void {
  state.llmScope = normalizeLlmScope(els.llmScopeSelect.value);
  renderInsights();
  resetAutoLockTimer();
}

function normalizeLlmScope(value: unknown): LlmInsightScope {
  return LLM_INSIGHT_SCOPES.some((scope) => scope.value === value) ? value as LlmInsightScope : "30";
}

function renderEntryAdviceControls(): void {
  const busy = state.llmBusyAction === "entry-advice";
  const anyBusy = Boolean(state.llmBusyAction);
  els.entryAdviceButton.textContent = busy ? "Asking..." : "Ask for guidance";
  els.entryAdviceButton.disabled = true;

  if (!state.key) {
    els.entryAdviceEstimate.textContent = "Vault locked.";
    return;
  }

  if (!state.llmSettings.apiKey || !state.llmSettings.model) {
    els.entryAdviceEstimate.textContent = "Set OpenRouter settings first.";
    return;
  }

  if (!state.llmPricing || state.llmPricing.model !== state.llmSettings.model) {
    els.entryAdviceEstimate.textContent = "Save LLM settings to load current pricing.";
    return;
  }

  let entry: DiaryEntry;
  try {
    entry = collectEntryPayload();
  } catch (error) {
    els.entryAdviceEstimate.textContent = "Complete the date and metrics first.";
    return;
  }

  if (!entryAdviceHasContent(entry)) {
    els.entryAdviceEstimate.textContent = "Add journal text or reflection first.";
    return;
  }

  const bundle = buildEntryAdviceBundle(entry, state.llmSettings);
  els.entryAdviceEstimate.textContent = `Projected ${formatUsdCost(bundle.estimatedCost)}.`;
  els.entryAdviceButton.disabled = anyBusy;
}

function renderEntryAdviceResult(): void {
  els.entryAdviceResult.replaceChildren();
  const run = state.llmEntryAdviceRuns.get(state.currentDate);
  if (!run) return;

  const currentFingerprint = currentEntryFingerprint();
  const changed = Boolean(currentFingerprint && currentFingerprint !== run.entryFingerprint);
  const promptChanged = run.promptFingerprint !== entryAdvicePromptFingerprint(state.llmSettings);

  const head = document.createElement("div");
  head.className = "llm-result-head";
  const title = document.createElement("strong");
  title.textContent = "Generated " + formatDateTime(run.generatedAt);
  const meta = document.createElement("span");
  meta.textContent = [
    changed ? "Entry changed since then" : "Current entry",
    promptChanged ? "Prompt changed since then" : "",
    run.model,
    run.responseLanguage,
    llmCostReportText(run.cost)
  ].filter(Boolean).join(" - ");
  head.append(title, meta);

  const section = document.createElement("section");
  section.className = "llm-result-section";
  const heading = document.createElement("h3");
  heading.textContent = "Perspective";
  const text = document.createElement("p");
  text.className = "read-text";
  text.textContent = run.rawText;
  section.append(heading, text);

  els.entryAdviceResult.append(head, section);
}

async function requestEntryAdvice(): Promise<void> {
  if (state.llmBusyAction) return;
  const saved = await flushAutoSave();
  if (!saved) return;

  const session = state.unlockedSession;
  try {
    const settings = requireLlmSettings();
    await requireOpenRouterModelPricing();
    const entry = collectEntryPayload();
    if (!entryAdviceHasContent(entry)) {
      setStatus(els.entryAdviceStatus, "Add journal text or reflection first.", "warn");
      renderEntryAdviceControls();
      return;
    }

    const bundle = buildEntryAdviceBundle(entry, settings);
    state.llmBusyAction = "entry-advice";
    renderLlmInsightControls();
    setEntryAdviceBusyStatus(`Asking for perspective. Projected ${formatUsdCost(bundle.estimatedCost)}.`);

    const result = await requestOpenRouterText(settings, bundle, buildEntryAdviceMessages(bundle, settings));
    if (state.unlockedSession !== session || !state.key) return;

    state.llmEntryAdviceRuns.set(entry.date, {
      generatedAt: new Date().toISOString(),
      date: entry.date,
      entryFingerprint: entryFingerprint(entry),
      promptFingerprint: entryAdvicePromptFingerprint(settings),
      model: result.model,
      responseLanguage: settings.responseLanguage,
      rawText: result.rawText,
      cost: result.cost
    });

    await refreshOpenRouterCredits(false);
    if (state.unlockedSession !== session || !state.key) return;
    renderEntryAdviceResult();
    setStatus(els.entryAdviceStatus, "Perspective generated. " + llmCostReportText(result.cost), "ok");
    resetAutoLockTimer();
  } catch (error) {
    if (state.unlockedSession === session && state.key) {
      setStatus(els.entryAdviceStatus, "Perspective failed: " + readableLlmError(error), "error");
    }
  } finally {
    if (state.unlockedSession === session && state.llmBusyAction === "entry-advice") {
      state.llmBusyAction = "";
      if (state.key) renderLlmInsightControls();
    }
  }
}

function setEntryAdviceBusyStatus(message: string): void {
  els.entryAdviceStatus.replaceChildren();
  els.entryAdviceStatus.classList.add("busy-status");
  els.entryAdviceStatus.dataset.tone = "warn";

  const spinner = document.createElement("span");
  spinner.className = "status-spinner";
  spinner.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.textContent = message;

  els.entryAdviceStatus.append(spinner, text);
}

function buildEntryAdviceBundle(entry: DiaryEntry, settings: LlmSettings): LlmRequestBundle {
  const payload = {
    app: "Private Diary",
    task: "Respond to one current daily entry with grounded advice and emotional perspective.",
    today: todayLocal(),
    responseLanguage: settings.responseLanguage,
    rawDiaryEntryIncluded: true,
    entry: compactEntryForAdvice(entry)
  };

  return buildRequestBundle(JSON.stringify(payload, null, 2), LLM_ENTRY_ADVICE_COMPLETION_TOKENS, settings);
}

function buildEntryAdviceMessages(bundle: LlmRequestBundle, settings: LlmSettings): Array<{ role: "system" | "user"; content: string }> {
  const variables = llmPromptVariables(settings, bundle);
  return [
    {
      role: "system",
      content: renderLlmPromptTemplate(settings.prompts.entryAdviceSystem, variables)
    },
    {
      role: "user",
      content: renderLlmPromptTemplate(settings.prompts.entryAdviceUser, variables)
    }
  ];
}

function compactEntryForAdvice(entry: DiaryEntry): LlmPromptEntry {
  const promptAnswers = Object.entries(entry.promptAnswers || {})
    .filter(([, answer]) => answer.trim())
    .sort(([first], [second]) => first.localeCompare(second))
    .slice(0, 36)
    .map(([prompt, answer]) => ({
      prompt: trimLlmText(prompt.replace(/^Weekly review: /, "Weekly review - "), LLM_ENTRY_ADVICE_FIELD_LIMIT),
      answer: trimLlmText(answer, LLM_ENTRY_ADVICE_FIELD_LIMIT)
    }));

  return {
    date: entry.date,
    mood: entry.mood ? moodLabel(entry.mood) : "",
    energy: entry.energy,
    stress: entry.stress,
    themes: (entry.themes || []).slice(0, 20),
    journal: trimLlmText(entry.journalText, LLM_ENTRY_ADVICE_TEXT_LIMIT),
    reflections: promptAnswers,
    standingTopics: (entry.standingTopics || [])
      .filter((topic) => topic.active !== false)
      .slice(0, 40)
      .map((topic) => ({
        title: trimLlmText(topic.title, 120),
        acuteness: topic.acuteness,
        direction: topic.direction,
        comment: trimLlmText(topic.comment, LLM_ENTRY_ADVICE_FIELD_LIMIT),
        nextStep: trimLlmText(topic.nextStep, 220)
      }))
  };
}

function entryAdviceHasContent(entry: DiaryEntry): boolean {
  return Boolean(
    entry.journalText.trim() ||
    entry.themes.length ||
    Object.values(entry.promptAnswers || {}).some((answer) => answer.trim()) ||
    (entry.standingTopics || []).some((topic) => topic.comment.trim() || topic.nextStep.trim())
  );
}

function renderLlmInsightControls(): void {
  const status = getLlmCacheStatus();
  const hasApiKey = Boolean(state.llmSettings.apiKey);
  const hasModel = Boolean(state.llmSettings.model);
  const hasPricing = Boolean(state.llmPricing && state.llmPricing.model === state.llmSettings.model);
  const busy = Boolean(state.llmBusyAction);

  els.llmScopeSelect.value = state.llmScope;
  els.llmRuntimeLabel.textContent = llmRuntimeLabelText();
  els.llmEntryCacheButton.disabled = busy || !hasApiKey || !hasModel || !hasPricing || status.staleEntryCount + status.missingEntryCount === 0;
  els.llmYearCacheButton.disabled = busy || !hasApiKey || !hasModel || !hasPricing || pendingYearSummaryYears().length === 0;
  els.llmGenerateButton.disabled = busy || !hasApiKey || !hasModel || !hasPricing || !status.canGenerateInsight;

  els.llmEntryCacheButton.textContent = state.llmBusyAction === "entries" ? "Updating entries..." : "Update entry cache";
  els.llmYearCacheButton.textContent = state.llmBusyAction === "years" ? "Updating years..." : "Update year summaries";
  els.llmGenerateButton.textContent = state.llmBusyAction === "insight" ? "Generating..." : "Generate insight";
  els.llmEstimate.textContent = llmProjectionText(status);
  els.llmCacheStatus.textContent = llmCacheStatusText(status);
  renderLlmCacheBrowser();
  renderEntryAdviceControls();
}

function llmRuntimeLabelText(): string {
  const parts = [
    state.llmSettings.model,
    state.llmSettings.responseLanguage
  ];
  if (state.llmSettings.apiKey) {
    parts.push(state.llmCredits ? `Balance ${formatOpenRouterBalance(state.llmCredits.balance)}` : "Balance unavailable");
  }
  return parts.filter(Boolean).join(" - ");
}

function renderLlmInsightResult(): void {
  els.llmCostReport.replaceChildren();
  els.llmResult.replaceChildren();

  const run = state.llmLastRun;
  if (!run) {
    els.llmResult.append(emptyInline("No LLM insight generated in this session."));
    return;
  }

  els.llmCostReport.textContent = llmCostReportText(run.cost);

  const head = document.createElement("div");
  head.className = "llm-result-head";
  const title = document.createElement("strong");
  title.textContent = "Generated " + formatDateTime(run.generatedAt);
  const meta = document.createElement("span");
  meta.textContent = [
    run.scopeLabel,
    `${run.selectedEntryCount} entr${run.selectedEntryCount === 1 ? "y" : "ies"}`,
    run.cacheSummary,
    run.model,
    run.responseLanguage
  ].filter(Boolean).join(" - ");
  head.append(title, meta);
  els.llmResult.append(head);

  if (!run.report) {
    const raw = document.createElement("p");
    raw.className = "read-text";
    raw.textContent = run.rawText || "OpenRouter returned an empty response.";
    els.llmResult.append(raw);
    return;
  }

  appendLlmReport(run.report);
}

function renderLlmCacheBrowser(): void {
  els.llmCacheBrowser.replaceChildren();

  const entryCapsules = Array.from(state.llmEntryCapsules.values())
    .sort((a, b) => b.date.localeCompare(a.date));
  const yearSummaries = Array.from(state.llmYearSummaries.values())
    .sort((a, b) => b.year.localeCompare(a.year));
  const runLogs = Array.from(state.llmRunLogs, ([id, log]) => ({ id, log }))
    .sort((a, b) => b.log.generatedAt.localeCompare(a.log.generatedAt));
  const recordCount = entryCapsules.length + yearSummaries.length + runLogs.length;

  const browser = document.createElement("details");
  browser.className = "llm-cache-browser-shell";
  browser.open = state.llmCacheBrowserOpen;
  browser.addEventListener("toggle", () => {
    state.llmCacheBrowserOpen = browser.open;
  });

  const summary = document.createElement("summary");
  const title = document.createElement("strong");
  title.textContent = "Cached Analysis";
  const meta = document.createElement("span");
  meta.textContent = [
    `${entryCapsules.length} entry capsule${entryCapsules.length === 1 ? "" : "s"}`,
    `${yearSummaries.length} year summar${yearSummaries.length === 1 ? "y" : "ies"}`,
    `${runLogs.length} run log${runLogs.length === 1 ? "" : "s"}`
  ].join(" - ");
  summary.append(title, meta);

  const content = document.createElement("div");
  content.className = "llm-cache-content";
  if (!recordCount) {
    content.append(emptyInline("No cached LLM records yet."));
  } else {
    appendLlmCacheGroup(content, "Entry Capsules", entryCapsules.map((capsule) => renderLlmEntryCapsuleRecord(capsule)));
    appendLlmCacheGroup(content, "Year Summaries", yearSummaries.map((yearSummary) => renderLlmYearSummaryRecord(yearSummary)));
    appendLlmCacheGroup(content, "Run Logs", runLogs.map(({ id, log }) => renderLlmRunLogRecord(id, log)));
  }

  browser.append(summary, content);
  els.llmCacheBrowser.append(browser);
}

function renderLlmCacheRecordsForEntry(entry: DiaryEntry): HTMLElement {
  const section = document.createElement("section");
  section.className = "read-block browse-llm-cache";

  const heading = document.createElement("h3");
  heading.textContent = "LLM Cache";

  const list = document.createElement("div");
  list.className = "llm-cache-list";

  const capsule = state.llmEntryCapsules.get(entry.date);
  const yearSummary = state.llmYearSummaries.get(calendarYear(entry.date));
  if (capsule) list.append(renderLlmEntryCapsuleRecord(capsule, "readonly"));
  if (yearSummary) list.append(renderLlmYearSummaryRecord(yearSummary, "readonly"));
  if (!list.childElementCount) list.append(emptyInline("No cached LLM records for this entry."));

  section.append(heading, list);
  return section;
}

function appendLlmCacheGroup(container: HTMLElement, title: string, records: HTMLElement[]): void {
  if (!records.length) return;
  const group = document.createElement("section");
  group.className = "llm-cache-group";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("div");
  list.className = "llm-cache-list";
  list.append(...records);
  group.append(heading, list);
  container.append(group);
}

function renderLlmEntryCapsuleRecord(capsule: LlmEntryCapsule, mode: LlmCacheRecordMode = "editable"): HTMLElement {
  const label = `cached entry capsule for ${capsule.date}`;
  const shell = llmCacheRecordShell(
    "entry-capsule",
    capsule.id,
    `Entry capsule - ${capsule.date}`,
    [llmEntryCapsuleStatus(capsule), generatedLabel(capsule.generatedAt), capsule.model, capsule.responseLanguage].filter(Boolean).join(" - "),
    label,
    mode
  );

  appendLlmCacheText(shell.body, "Summary", capsule.summary);
  appendLlmCacheText(shell.body, "Emotional Pattern", capsule.emotionalPattern);
  appendLlmCacheChips(shell.body, "Themes", capsule.themes);
  appendLlmCacheInsightItems(shell.body, "Standing Topics", capsule.standingTopics);
  appendLlmCacheStringList(shell.body, "Unresolved", capsule.unresolved);
  appendLlmCacheStringList(shell.body, "Next Moves", capsule.nextActions);
  appendLlmCacheStringList(shell.body, "Questions", capsule.questions);
  appendLlmCacheRawText(shell.body, capsule.rawText);
  return shell.details;
}

function renderLlmYearSummaryRecord(summary: LlmYearSummary, mode: LlmCacheRecordMode = "editable"): HTMLElement {
  const label = `cached year summary for ${summary.year}`;
  const shell = llmCacheRecordShell(
    "year-summary",
    summary.id,
    `Year summary - ${summary.year}`,
    [
      llmYearSummaryStatus(summary),
      `${summary.entryCount} entr${summary.entryCount === 1 ? "y" : "ies"}`,
      generatedLabel(summary.generatedAt),
      summary.model,
      summary.responseLanguage
    ].filter(Boolean).join(" - "),
    label,
    mode
  );

  appendLlmCacheReport(shell.body, summary.report);
  appendLlmCacheRawText(shell.body, summary.rawText);
  return shell.details;
}

function renderLlmRunLogRecord(id: string, log: LlmRunLog): HTMLElement {
  const label = `cached run log from ${formatDateTime(log.generatedAt)}`;
  const shell = llmCacheRecordShell(
    "run-log",
    id,
    `${llmRunLogKindLabel(log.kind)} - ${formatDateTime(log.generatedAt)}`,
    [log.scopeLabel, log.model, log.responseLanguage].filter(Boolean).join(" - "),
    label
  );

  appendLlmCacheText(shell.body, "Cost", llmCostReportText(log.cost));
  return shell.details;
}

function llmCacheRecordShell(
  kind: LlmCacheRecordKind,
  id: string,
  titleText: string,
  metaText: string,
  deleteLabel: string,
  mode: LlmCacheRecordMode = "editable"
): { details: HTMLDetailsElement; body: HTMLElement } {
  const details = document.createElement("details");
  details.className = "llm-cache-record";
  const summary = document.createElement("summary");
  const title = document.createElement("strong");
  title.textContent = titleText;
  const meta = document.createElement("span");
  meta.textContent = metaText;
  summary.append(title, meta);

  const body = document.createElement("div");
  body.className = "llm-cache-record-body";
  if (mode === "editable") {
    const actions = document.createElement("div");
    actions.className = "llm-cache-actions";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger";
    deleteButton.textContent = "Delete";
    deleteButton.disabled = Boolean(state.llmBusyAction);
    deleteButton.setAttribute("aria-label", "Delete " + deleteLabel);
    deleteButton.addEventListener("click", () => void deleteLlmCacheRecord(kind, id, deleteLabel));
    actions.append(deleteButton);
    body.append(actions);
  }

  details.append(summary, body);
  return { details, body };
}

function appendLlmCacheReport(container: HTMLElement, report: LlmInsightReport): void {
  appendLlmCacheText(container, "Summary", report.summary);
  appendLlmCacheInsightItems(container, "Patterns", report.patterns);
  appendLlmCacheInsightItems(container, "Pressure Points", report.pressurePoints);
  appendLlmCacheInsightItems(container, "Standing Topics", report.standingTopics);
  appendLlmCacheStringList(container, "Next Moves", report.nextActions);
  appendLlmCacheStringList(container, "Questions", report.questions);
}

function appendLlmCacheText(container: HTMLElement, title: string, text: string): void {
  if (!text) return;
  const field = document.createElement("div");
  field.className = "llm-cache-field";
  const label = document.createElement("strong");
  label.textContent = title;
  const value = document.createElement("p");
  value.className = "read-text";
  value.textContent = text;
  field.append(label, value);
  container.append(field);
}

function appendLlmCacheChips(container: HTMLElement, title: string, values: string[]): void {
  if (!values.length) return;
  const field = document.createElement("div");
  field.className = "llm-cache-field";
  const label = document.createElement("strong");
  label.textContent = title;
  const row = document.createElement("div");
  row.className = "chip-row";
  for (const value of values) row.append(chip(value));
  field.append(label, row);
  container.append(field);
}

function appendLlmCacheInsightItems(container: HTMLElement, title: string, items: LlmInsightItem[]): void {
  if (!items.length) return;
  const field = document.createElement("div");
  field.className = "llm-cache-field";
  const label = document.createElement("strong");
  label.textContent = title;
  const list = document.createElement("div");
  list.className = "llm-cache-item-list";

  for (const item of items) {
    const article = document.createElement("article");
    article.className = "llm-cache-item";
    if (item.title) {
      const itemTitle = document.createElement("strong");
      itemTitle.textContent = item.title;
      article.append(itemTitle);
    }
    if (item.detail) {
      const detail = document.createElement("p");
      detail.textContent = item.detail;
      article.append(detail);
    }
    if (item.evidence.length) {
      const evidence = document.createElement("p");
      evidence.className = "topic-meta";
      evidence.textContent = item.evidence.join(" | ");
      article.append(evidence);
    }
    list.append(article);
  }

  field.append(label, list);
  container.append(field);
}

function appendLlmCacheStringList(container: HTMLElement, title: string, items: string[]): void {
  if (!items.length) return;
  const field = document.createElement("div");
  field.className = "llm-cache-field";
  const label = document.createElement("strong");
  label.textContent = title;
  const list = document.createElement("ul");
  list.className = "llm-bullet-list";
  for (const item of items) {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    list.append(listItem);
  }
  field.append(label, list);
  container.append(field);
}

function appendLlmCacheRawText(container: HTMLElement, rawText: string): void {
  if (!rawText) return;
  const details = document.createElement("details");
  details.className = "llm-cache-raw";
  const summary = document.createElement("summary");
  summary.textContent = "Raw JSON";
  const pre = document.createElement("pre");
  pre.textContent = rawText;
  details.append(summary, pre);
  container.append(details);
}

async function deleteLlmCacheRecord(kind: LlmCacheRecordKind, id: string, label: string): Promise<void> {
  if (state.llmBusyAction) return;
  if (!window.confirm(`Delete ${label}? Diary entries will not be changed.`)) return;

  try {
    state.llmBusyAction = "delete-cache";
    renderLlmInsightControls();
    await deleteLlmRecord(id);
    removeLlmCacheRecordFromState(kind, id);
    if (kind !== "run-log") state.llmLastRun = null;
    setStatus(els.llmStatus, `Deleted ${label}.`, "ok");
    renderInsights();
    renderBrowseEntryDetail();
    resetAutoLockTimer();
  } catch (error) {
    setStatus(els.llmStatus, "Cached record was not deleted: " + readableError(error), "error");
  } finally {
    state.llmBusyAction = "";
    renderLlmInsightControls();
  }
}

function removeLlmCacheRecordFromState(kind: LlmCacheRecordKind, id: string): void {
  if (kind === "entry-capsule") {
    for (const [date, capsule] of state.llmEntryCapsules) {
      if (capsule.id === id || entryCapsuleRecordId(date) === id) {
        state.llmEntryCapsules.delete(date);
        return;
      }
    }
    return;
  }

  if (kind === "year-summary") {
    for (const [year, summary] of state.llmYearSummaries) {
      if (summary.id === id || yearSummaryRecordId(year) === id) {
        state.llmYearSummaries.delete(year);
        return;
      }
    }
    return;
  }

  state.llmRunLogs.delete(id);
}

function llmEntryCapsuleStatus(capsule: LlmEntryCapsule): string {
  const entry = state.entries.get(capsule.date);
  if (!entry) return "Entry missing";
  if (capsule.schemaVersion !== LLM_CACHE_SCHEMA_VERSION) return "Schema stale";
  if (!llmCacheMatchesResponseLanguage(capsule)) return "Language stale";
  if (capsule.promptFingerprint !== entryCapsulePromptFingerprint(state.llmSettings)) return "Prompt changed";
  if (capsule.entryFingerprint !== entryFingerprint(entry)) return "Entry changed";
  return "Current";
}

function llmYearSummaryStatus(summary: LlmYearSummary): string {
  if (summary.schemaVersion !== LLM_CACHE_SCHEMA_VERSION) return "Schema stale";
  if (!llmCacheMatchesResponseLanguage(summary)) return "Language stale";
  if (summary.promptFingerprint !== yearSummaryPromptFingerprint(state.llmSettings)) return "Prompt changed";
  const sourceFingerprint = yearSourceFingerprint(summary.year);
  if (!sourceFingerprint) return "Source incomplete";
  if (summary.sourceFingerprint !== sourceFingerprint) return "Source changed";
  return "Current";
}

function llmRunLogKindLabel(kind: LlmRunLog["kind"]): string {
  if (kind === "entry-cache") return "Entry cache run";
  if (kind === "year-summary") return "Year summary run";
  return "Final insight run";
}

function generatedLabel(iso: string): string {
  return iso ? "Generated " + formatDateTime(iso) : "";
}

function setLlmBusyStatus(message: string): void {
  els.llmStatus.replaceChildren();
  els.llmStatus.classList.add("busy-status");
  els.llmStatus.dataset.tone = "warn";

  const spinner = document.createElement("span");
  spinner.className = "status-spinner";
  spinner.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.textContent = message;

  els.llmStatus.append(spinner, text);
}

async function updateLlmEntryCache(): Promise<void> {
  if (state.llmBusyAction) return;
  const saved = await flushAutoSave();
  if (!saved) return;

  try {
    const settings = requireLlmSettings();
    await requireOpenRouterModelPricing();
    const entries = staleEntriesForScope();
    if (!entries.length) {
      setStatus(els.llmStatus, "Entry cache is current for this scope.", "ok");
      return;
    }

    state.llmBusyAction = "entries";
    renderLlmInsightControls();
    const batches = buildEntryCapsuleBatches(entries, settings);
    const aggregate = emptyCostReport(batches.reduce((sum, batch) => sum + batch.bundle.estimatedCost, 0));
    let cached = 0;

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      if (!batch) continue;

      const { capsules, result } = await requestEntryCapsuleBatchWithRetry(batch, index, batches.length, settings, aggregate);
      for (const capsule of capsules) {
        await putEncryptedLlmRecord(entryCapsuleRecordId(capsule.date), "entry-capsule", capsule);
        state.llmEntryCapsules.set(capsule.date, capsule);
        cached += 1;
      }
      await saveLlmRunLog("entry-cache", llmScopeDefinition(state.llmScope).label, result.cost);
    }

    await refreshOpenRouterCredits(false);
    setStatus(els.llmStatus, `Updated ${cached} entry cache record${cached === 1 ? "" : "s"}. ${llmCostReportText(aggregate)}`, "ok");
    renderInsights();
    renderBrowseEntryDetail();
    resetAutoLockTimer();
  } catch (error) {
    setStatus(els.llmStatus, "Entry cache update failed: " + readableLlmError(error), "error");
  } finally {
    state.llmBusyAction = "";
    renderLlmInsightControls();
  }
}

async function requestEntryCapsuleBatchWithRetry(
  batch: { entries: DiaryEntry[]; bundle: LlmRequestBundle },
  batchIndex: number,
  batchCount: number,
  settings: LlmSettings,
  aggregate: LlmCostReport
): Promise<{ capsules: LlmEntryCapsule[]; result: { rawText: string; model: string; cost: LlmCostReport } }> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= LLM_ENTRY_CACHE_MAX_ATTEMPTS; attempt += 1) {
    setLlmBusyStatus(`Updating entry cache batch ${batchIndex + 1} of ${batchCount}. Attempt ${attempt} of ${LLM_ENTRY_CACHE_MAX_ATTEMPTS}. Projected ${formatUsdCost(batch.bundle.estimatedCost)}.`);
    if (attempt > 1) aggregate.projectedCost += batch.bundle.estimatedCost;

    try {
      const result = await requestOpenRouterText(settings, batch.bundle, buildEntryCapsuleMessages(batch.bundle, settings));
      addCostReport(aggregate, result.cost);
      const capsules = parseEntryCapsuleResponse(result.rawText, batch.entries, settings);
      return { capsules, result };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Entry cache batch failed after retries.");
}

async function updateLlmYearSummaries(): Promise<void> {
  if (state.llmBusyAction) return;
  const saved = await flushAutoSave();
  if (!saved) return;

  try {
    const settings = requireLlmSettings();
    await requireOpenRouterModelPricing();
    const years = pendingYearSummaryYears();
    if (!years.length) {
      setStatus(els.llmStatus, "Year summaries are current for cached past years in this scope.", "ok");
      return;
    }

    state.llmBusyAction = "years";
    renderLlmInsightControls();
    const projected = years
      .map((year) => buildYearSummaryBundle(year, settings).estimatedCost)
      .reduce((sum, value) => sum + value, 0);
    const aggregate = emptyCostReport(projected);
    let updated = 0;

    for (let index = 0; index < years.length; index += 1) {
      const year = years[index];
      if (!year) continue;
      const bundle = buildYearSummaryBundle(year, settings);
      setLlmBusyStatus(`Updating year summary ${index + 1} of ${years.length} (${year}). Projected ${formatUsdCost(bundle.estimatedCost)}.`);
      const result = await requestOpenRouterText(settings, bundle, buildYearSummaryMessages(year, bundle, settings));
      addCostReport(aggregate, result.cost);
      const report = parseLlmInsightReport(result.rawText);
      if (!report) throw new Error(`The ${year} summary response did not include a usable insight report.`);

      const previous = validYearSummaryFor(String(Number(year) - 1));
      const summary: LlmYearSummary = {
        schemaVersion: LLM_CACHE_SCHEMA_VERSION,
        id: yearSummaryRecordId(year),
        year,
        promptFingerprint: yearSummaryPromptFingerprint(settings),
        model: settings.model,
        responseLanguage: settings.responseLanguage,
        generatedAt: new Date().toISOString(),
        sourceFingerprint: yearSourceFingerprint(year),
        previousYearSourceFingerprint: previous ? previous.sourceFingerprint : "",
        entryCount: entriesForYear(year).length,
        report,
        rawText: result.rawText
      };

      await putEncryptedLlmRecord(yearSummaryRecordId(year), "year-summary", summary);
      state.llmYearSummaries.set(year, summary);
      await saveLlmRunLog("year-summary", year, result.cost);
      updated += 1;
    }

    await refreshOpenRouterCredits(false);
    setStatus(els.llmStatus, `Updated ${updated} year summar${updated === 1 ? "y" : "ies"}. ${llmCostReportText(aggregate)}`, "ok");
    renderInsights();
    renderBrowseEntryDetail();
    resetAutoLockTimer();
  } catch (error) {
    setStatus(els.llmStatus, "Year summary update failed: " + readableLlmError(error), "error");
  } finally {
    state.llmBusyAction = "";
    renderLlmInsightControls();
  }
}

async function generateLlmInsights(): Promise<void> {
  if (state.llmBusyAction) return;
  const saved = await flushAutoSave();
  if (!saved) return;

  try {
    const settings = requireLlmSettings();
    await requireOpenRouterModelPricing();
    const insight = buildCachedInsightBundle(settings);
    if (!insight.selectedEntryCount) {
      setStatus(els.llmStatus, "No entries are available for this scope.", "warn");
      return;
    }

    state.llmBusyAction = "insight";
    renderLlmInsightControls();
    setLlmBusyStatus(`Generating cached insight. Projected ${formatUsdCost(insight.bundle.estimatedCost)}.`);

    const result = await requestOpenRouterText(settings, insight.bundle, buildFinalInsightMessages(insight.bundle, settings));
    const report = parseLlmInsightReport(result.rawText);
    state.llmLastRun = {
      generatedAt: new Date().toISOString(),
      model: result.model,
      responseLanguage: settings.responseLanguage,
      scopeLabel: insight.scopeLabel,
      selectedEntryCount: insight.selectedEntryCount,
      cacheSummary: insight.cacheSummary,
      report,
      rawText: result.rawText,
      cost: result.cost
    };

    await saveLlmRunLog("final-insight", insight.scopeLabel, result.cost);
    await refreshOpenRouterCredits(false);
    renderLlmInsightResult();
    setStatus(els.llmStatus, "LLM insight generated. " + llmCostReportText(result.cost), "ok");
    resetAutoLockTimer();
  } catch (error) {
    setStatus(els.llmStatus, "LLM insight failed: " + readableLlmError(error), "error");
  } finally {
    state.llmBusyAction = "";
    renderLlmInsightControls();
  }
}

function requireLlmSettings(): LlmSettings {
  const settings = state.llmSettings;
  if (!settings.apiKey) throw new Error("Enter and save an OpenRouter API key in Settings first.");
  if (!settings.model) throw new Error("Enter and save an OpenRouter model in Settings first.");
  return settings;
}

function readableLlmError(error: unknown): string {
  return `${readableError(error)} If this persists, try a different model from ${OPENROUTER_POPULAR_MODELS_URL}`;
}

function getLlmCacheStatus(): LlmCacheStatus {
  const selectedEntries = selectedLlmEntries();
  const missingEntries = selectedEntries.filter((entry) => !state.llmEntryCapsules.has(entry.date));
  const staleEntries = selectedEntries.filter((entry) => state.llmEntryCapsules.has(entry.date) && !validEntryCapsuleFor(entry));
  const validEntryCount = selectedEntries.length - missingEntries.length - staleEntries.length;
  const pastYears = selectedPastYears();
  let validPastYearCount = 0;
  let stalePastYearCount = 0;
  let missingPastYearCount = 0;

  for (const year of pastYears) {
    const summary = state.llmYearSummaries.get(year);
    if (validYearSummaryFor(year)) validPastYearCount += 1;
    else if (summary) stalePastYearCount += 1;
    else missingPastYearCount += 1;
  }

  const entryBatches = buildEntryCapsuleBatches([...missingEntries, ...staleEntries], state.llmSettings);
  const processEntryCost = entryBatches.reduce((sum, batch) => sum + batch.bundle.estimatedCost, 0);
  const processYearCost = pendingYearSummaryYears()
    .map((year) => buildYearSummaryBundle(year, state.llmSettings).estimatedCost)
    .reduce((sum, value) => sum + value, 0);

  let insightCost = 0;
  let canGenerateInsight = false;
  try {
    const insight = buildCachedInsightBundle(state.llmSettings);
    insightCost = insight.bundle.estimatedCost;
    canGenerateInsight = selectedEntries.length > 0;
  } catch (error) {
    canGenerateInsight = false;
  }

  return {
    selectedEntryCount: selectedEntries.length,
    validEntryCount,
    staleEntryCount: staleEntries.length,
    missingEntryCount: missingEntries.length,
    currentYearEntryCount: selectedEntries.filter((entry) => calendarYear(entry.date) === calendarYear(todayLocal())).length,
    validPastYearCount,
    stalePastYearCount,
    missingPastYearCount,
    processEntryCost,
    processYearCost,
    insightCost,
    pricingAvailable: Boolean(state.llmPricing && state.llmPricing.model === state.llmSettings.model),
    canGenerateInsight
  };
}

function llmProjectionText(status: LlmCacheStatus): string {
  if (!status.selectedEntryCount) return "No entries available for LLM insight.";
  if (!state.llmSettings.apiKey) return "Set and save OpenRouter settings before making LLM calls.";
  if (!status.pricingAvailable) return "Current OpenRouter pricing is required before projecting cost.";
  const cacheCost = status.processEntryCost + status.processYearCost;
  return [
    cacheCost ? `Cache updates ${formatUsdCost(cacheCost)}` : "Cache current",
    status.canGenerateInsight ? `final insight ${formatUsdCost(status.insightCost)}` : "final insight needs entry cache"
  ].join("; ") + ".";
}

function llmCacheStatusText(status: LlmCacheStatus): string {
  const entryIssues = status.missingEntryCount + status.staleEntryCount;
  const yearIssues = status.missingPastYearCount + status.stalePastYearCount;
  return [
    `${status.selectedEntryCount} selected entr${status.selectedEntryCount === 1 ? "y" : "ies"}`,
    `${status.validEntryCount} cached`,
    entryIssues ? `${entryIssues} missing or stale` : "entry cache current",
    `${status.validPastYearCount} past-year summar${status.validPastYearCount === 1 ? "y" : "ies"} ready`,
    yearIssues ? `${yearIssues} past-year summaries missing or stale` : "year summaries current"
  ].join("; ") + ".";
}

function selectedLlmEntries(): DiaryEntry[] {
  const scope = llmScopeDefinition(state.llmScope);
  const entries = sortedEntriesAsc();
  if (!scope.days) return entries;
  const cutoff = addDays(todayLocal(), -(scope.days - 1));
  return entries.filter((entry) => entry.date >= cutoff);
}

function llmScopeDefinition(scopeValue: LlmInsightScope): (typeof LLM_INSIGHT_SCOPES)[number] {
  return LLM_INSIGHT_SCOPES.find((scope) => scope.value === scopeValue) || LLM_INSIGHT_SCOPES[0];
}

function staleEntriesForScope(): DiaryEntry[] {
  return selectedLlmEntries().filter((entry) => !validEntryCapsuleFor(entry));
}

function validEntryCapsuleFor(entry: DiaryEntry): LlmEntryCapsule | null {
  const capsule = state.llmEntryCapsules.get(entry.date);
  if (!capsule) return null;
  if (capsule.schemaVersion !== LLM_CACHE_SCHEMA_VERSION) return null;
  if (capsule.entryFingerprint !== entryFingerprint(entry)) return null;
  if (!llmCacheMatchesResponseLanguage(capsule)) return null;
  if (capsule.promptFingerprint !== entryCapsulePromptFingerprint(state.llmSettings)) return null;
  return capsule;
}

function llmCacheMatchesResponseLanguage(item: { responseLanguage: string }): boolean {
  return item.responseLanguage === state.llmSettings.responseLanguage;
}

function selectedPastYears(): string[] {
  const currentYear = calendarYear(todayLocal());
  return Array.from(new Set(selectedLlmEntries().map((entry) => calendarYear(entry.date))))
    .filter((year) => year < currentYear)
    .sort();
}

function pendingYearSummaryYears(): string[] {
  return selectedPastYears()
    .filter((year) => entriesForYear(year).length > 0)
    .filter((year) => entriesForYear(year).every((entry) => Boolean(validEntryCapsuleFor(entry))))
    .filter((year) => !validYearSummaryFor(year));
}

function validYearSummaryFor(year: string): LlmYearSummary | null {
  const summary = state.llmYearSummaries.get(year);
  if (!summary) return null;
  if (summary.schemaVersion !== LLM_CACHE_SCHEMA_VERSION) return null;
  if (!llmCacheMatchesResponseLanguage(summary)) return null;
  if (summary.promptFingerprint !== yearSummaryPromptFingerprint(state.llmSettings)) return null;
  const sourceFingerprint = yearSourceFingerprint(year);
  if (!sourceFingerprint || summary.sourceFingerprint !== sourceFingerprint) return null;
  return summary;
}

function yearSourceFingerprint(year: string): string {
  const entries = entriesForYear(year);
  if (!entries.length) return "";

  const parts: string[] = [];
  for (const entry of entries) {
    const capsule = validEntryCapsuleFor(entry);
    if (!capsule) return "";
    parts.push(`${entry.date}:${capsule.entryFingerprint}`);
  }

  const previous = validYearSummaryFor(String(Number(year) - 1));
  const previousFingerprint = previous ? hashText(previous.sourceFingerprint + "|" + previous.rawText) : "";
  return hashText(`${year}|${parts.join("|")}|previous:${previousFingerprint}`);
}

function entriesForYear(year: string): DiaryEntry[] {
  return sortedEntriesAsc().filter((entry) => calendarYear(entry.date) === year);
}

function calendarYear(date: string): string {
  return String(parseLocalDate(date).getFullYear());
}

function buildEntryCapsuleBatches(entries: DiaryEntry[], settings: LlmSettings): Array<{ entries: DiaryEntry[]; bundle: LlmRequestBundle }> {
  if (!entries.length) return [];
  const batches: DiaryEntry[][] = [];
  let current: DiaryEntry[] = [];
  let currentChars = 0;

  for (const entry of entries) {
    const compact = compactEntryForLlm(entry);
    const serialized = JSON.stringify(compact);
    const wouldExceedEntryLimit = current.length >= LLM_CAPSULE_BATCH_ENTRY_LIMIT;
    const wouldExceedCharBudget = currentChars + serialized.length > LLM_CAPSULE_BATCH_CHAR_BUDGET;
    if (current.length && (wouldExceedEntryLimit || wouldExceedCharBudget)) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(entry);
    currentChars += serialized.length;
  }
  if (current.length) batches.push(current);

  return batches.map((batch) => ({
    entries: batch,
    bundle: buildRequestBundle(entryCapsulePromptText(batch), entryCapsuleCompletionTokens(batch), settings)
  }));
}

function entryCapsulePromptText(entries: DiaryEntry[]): string {
  const payload = {
    app: "Private Diary",
    task: "Create one reusable cache capsule for each diary entry.",
    today: todayLocal(),
    entries: entries.map(compactEntryForLlm)
  };
  return JSON.stringify(payload, null, 2);
}

function entryCapsuleCompletionTokens(entries: DiaryEntry[]): number {
  return Math.min(LLM_ENTRY_CAPSULE_COMPLETION_TOKENS, Math.max(1200, 450 + entries.length * 360));
}

function llmEntryCapsuleFormatInstructions(): string {
  return [
    "Do not return JSON.",
    "For each diary entry, emit this exact sequence:",
    "DATE: YYYY-MM-DD",
    "SUMMARY: one compact paragraph",
    "THEMES: semicolon-separated short themes",
    "EMOTIONAL_PATTERN: one compact paragraph",
    "STANDING_TOPICS: one item per line as NAME: detail with short evidence in the detail",
    "UNRESOLVED: one item per line",
    "NEXT_MOVES: one item per line",
    "QUESTIONS: one item per line.",
    "Start the next entry with a new DATE field. Do not add separators, markdown tables, or code fences."
  ].join(" ");
}

function llmInsightReportFormatInstructions(): string {
  return [
    "Do not return JSON.",
    "Return exactly six labeled fields in this order: SUMMARY, PATTERNS, PRESSURE_POINTS, STANDING_TOPICS, NEXT_MOVES, QUESTIONS.",
    "Start each field with NAME: and put multi-line field content after that label when needed.",
    "For PATTERNS, PRESSURE_POINTS, and STANDING_TOPICS, use one item per line as ITEM_NAME: detail with short date/year evidence in the detail.",
    "For NEXT_MOVES and QUESTIONS, use one plain item per line."
  ].join(" ");
}

function buildEntryCapsuleMessages(bundle: LlmRequestBundle, settings: LlmSettings): Array<{ role: "system" | "user"; content: string }> {
  const variables = llmPromptVariables(settings, bundle);
  return [
    {
      role: "system",
      content: renderLlmPromptTemplate(settings.prompts.entryCapsuleSystem, variables)
    },
    {
      role: "user",
      content: renderLlmPromptTemplate(settings.prompts.entryCapsuleUser, variables)
    }
  ];
}

function parseEntryCapsuleResponse(text: string, entries: DiaryEntry[], settings: LlmSettings): LlmEntryCapsule[] {
  const jsonCapsules = parseJsonEntryCapsuleResponse(text, entries, settings);
  if (jsonCapsules) return jsonCapsules;

  const delimitedCapsules = parseDelimitedEntryCapsuleResponse(text, entries, settings);
  if (delimitedCapsules) return delimitedCapsules;

  throw new Error("OpenRouter did not return usable entry capsule fields.");
}

function parseJsonEntryCapsuleResponse(text: string, entries: DiaryEntry[], settings: LlmSettings): LlmEntryCapsule[] | null {
  const parsed = parseLlmJson(text);
  const sourceItems = isRecord(parsed) && Array.isArray(parsed.capsules)
    ? parsed.capsules
    : Array.isArray(parsed)
      ? parsed
      : [];
  if (!sourceItems.length) return null;

  const wantedDates = new Set(entries.map((entry) => entry.date));
  const entryByDate = new Map(entries.map((entry) => [entry.date, entry]));
  const usedDates = new Set<string>();
  const nextUnusedEntry = () => entries.find((entry) => !usedDates.has(entry.date)) || null;
  const capsules: LlmEntryCapsule[] = [];

  for (const item of sourceItems) {
    if (!isRecord(item)) continue;
    const explicitDate = typeof item.date === "string" && wantedDates.has(item.date) ? item.date : "";
    const entry = explicitDate
      ? usedDates.has(explicitDate) ? null : entryByDate.get(explicitDate) || null
      : nextUnusedEntry();
    if (!entry) continue;

    const capsule: LlmEntryCapsule = {
      schemaVersion: LLM_CACHE_SCHEMA_VERSION,
      id: entryCapsuleRecordId(entry.date),
      date: entry.date,
      entryFingerprint: entryFingerprint(entry),
      promptFingerprint: entryCapsulePromptFingerprint(settings),
      model: settings.model,
      responseLanguage: settings.responseLanguage,
      generatedAt: new Date().toISOString(),
      summary: cleanLlmOutputText(item.summary, 1400),
      themes: normalizeLlmStringList(item.themes).slice(0, 12),
      emotionalPattern: cleanLlmOutputText(item.emotionalPattern || item.pattern, 900),
      standingTopics: normalizeLlmInsightItems(item.standingTopics || item.topics).slice(0, 10),
      unresolved: normalizeLlmStringList(item.unresolved || item.openThreads).slice(0, 10),
      nextActions: normalizeLlmStringList(item.nextActions || item.actions).slice(0, 8),
      questions: normalizeLlmStringList(item.questions).slice(0, 8),
      rawText: JSON.stringify(item)
    };
    if (!hasEntryCapsuleContent(capsule)) continue;

    usedDates.add(entry.date);
    capsules.push(capsule);
  }

  return capsules.length ? capsules : null;
}

function parseDelimitedEntryCapsuleResponse(text: string, entries: DiaryEntry[], settings: LlmSettings): LlmEntryCapsule[] | null {
  const fields = splitEntryCapsuleResponseFields(text);
  if (!fields.length) return null;

  const byDate = new Map<string, Map<string, string>>();
  const fieldOrders = entryCapsuleFieldOrders();
  let currentDate = "";
  let currentFields: Map<string, string> | null = null;
  let currentFieldOrder = -1;
  const wantedDates = new Set(entries.map((entry) => entry.date));
  const nextUnusedDate = () => entries.find((entry) => !byDate.has(entry.date))?.date || "";
  const startEntry = (date: string): Map<string, string> => {
    currentDate = date;
    currentFields = byDate.get(date) || new Map<string, string>();
    byDate.set(date, currentFields);
    currentFieldOrder = 0;
    return currentFields;
  };

  for (const field of fields) {
    if (field.key === "date") {
      const date = entryCapsuleDateFromField(field.body, wantedDates);
      if (date) startEntry(date);
      else {
        currentDate = "";
        currentFields = null;
        currentFieldOrder = -1;
      }
      continue;
    }

    const fieldOrder = fieldOrders.get(field.key) ?? 99;
    let fieldsForCurrentEntry: Map<string, string> | null = currentFields;
    if (!fieldsForCurrentEntry) {
      const date = nextUnusedDate();
      if (!date) continue;
      fieldsForCurrentEntry = startEntry(date);
    } else if (currentDate && fieldOrder <= currentFieldOrder) {
      const date = nextUnusedDate();
      if (date) fieldsForCurrentEntry = startEntry(date);
    }

    if (!fieldsForCurrentEntry) continue;
    const previous = fieldsForCurrentEntry.get(field.key);
    fieldsForCurrentEntry.set(field.key, previous ? `${previous}\n${field.body}` : field.body);
    currentFieldOrder = Math.max(currentFieldOrder, fieldOrder);
  }

  const capsules: LlmEntryCapsule[] = [];
  for (const entry of entries) {
    const fieldsForEntry = byDate.get(entry.date);
    if (!fieldsForEntry || !hasEntryCapsuleFieldContent(fieldsForEntry)) continue;

    const capsule: LlmEntryCapsule = {
      schemaVersion: LLM_CACHE_SCHEMA_VERSION,
      id: entryCapsuleRecordId(entry.date),
      date: entry.date,
      entryFingerprint: entryFingerprint(entry),
      promptFingerprint: entryCapsulePromptFingerprint(settings),
      model: settings.model,
      responseLanguage: settings.responseLanguage,
      generatedAt: new Date().toISOString(),
      summary: cleanLlmOutputText(fieldsForEntry.get("summary"), 1400),
      themes: parseDelimitedThemes(fieldsForEntry.get("themes") || "").slice(0, 12),
      emotionalPattern: cleanLlmOutputText(fieldsForEntry.get("emotionalpattern") || fieldsForEntry.get("pattern"), 900),
      standingTopics: parseDelimitedInsightItems(fieldsForEntry.get("standingtopics") || fieldsForEntry.get("topics") || "").slice(0, 10),
      unresolved: parseDelimitedStringList(fieldsForEntry.get("unresolved") || fieldsForEntry.get("openthreads") || "").slice(0, 10),
      nextActions: parseDelimitedStringList(fieldsForEntry.get("nextmoves") || fieldsForEntry.get("nextactions") || fieldsForEntry.get("actions") || "").slice(0, 8),
      questions: parseDelimitedStringList(fieldsForEntry.get("questions") || "").slice(0, 8),
      rawText: JSON.stringify(Object.fromEntries(fieldsForEntry))
    };
    if (hasEntryCapsuleContent(capsule)) capsules.push(capsule);
  }

  return capsules.length ? capsules : null;
}

function entryCapsuleFieldOrders(): Map<string, number> {
  return new Map([
    ["summary", 1],
    ["themes", 2],
    ["emotionalpattern", 3],
    ["pattern", 3],
    ["standingtopics", 4],
    ["topics", 4],
    ["unresolved", 5],
    ["openthreads", 5],
    ["nextmoves", 6],
    ["nextactions", 6],
    ["actions", 6],
    ["questions", 7]
  ]);
}

function entryCapsuleDateFromField(text: string, wantedDates: Set<string>): string {
  const normalized = cleanLlmOutputText(text, 80);
  if (wantedDates.has(normalized)) return normalized;
  const match = /\b\d{4}-\d{2}-\d{2}\b/.exec(normalized);
  return match && wantedDates.has(match[0]) ? match[0] : "";
}

function hasEntryCapsuleFieldContent(fields: Map<string, string>): boolean {
  return [
    "summary",
    "themes",
    "emotionalpattern",
    "pattern",
    "standingtopics",
    "topics",
    "unresolved",
    "openthreads",
    "nextmoves",
    "nextactions",
    "actions",
    "questions"
  ].some((key) => Boolean(fields.get(key)?.trim()));
}

function hasEntryCapsuleContent(capsule: LlmEntryCapsule): boolean {
  return Boolean(
    capsule.summary ||
    capsule.themes.length ||
    capsule.emotionalPattern ||
    capsule.standingTopics.length ||
    capsule.unresolved.length ||
    capsule.nextActions.length ||
    capsule.questions.length
  );
}

function splitEntryCapsuleResponseFields(text: string): LlmResponseField[] {
  return splitKnownLlmResponseFields(text, [
    "date",
    "summary",
    "themes",
    "emotionalpattern",
    "pattern",
    "standingtopics",
    "topics",
    "unresolved",
    "openthreads",
    "nextmoves",
    "nextactions",
    "actions",
    "questions"
  ]);
}

function buildYearSummaryBundle(year: string, settings: LlmSettings): LlmRequestBundle {
  const capsules = entriesForYear(year)
    .map((entry) => validEntryCapsuleFor(entry))
    .filter((capsule): capsule is LlmEntryCapsule => Boolean(capsule));
  if (!capsules.length || capsules.length !== entriesForYear(year).length) {
    throw new Error(`Update entry cache before summarizing ${year}.`);
  }

  const previous = validYearSummaryFor(String(Number(year) - 1));
  const payload = {
    app: "Private Diary",
    task: "Create a reusable yearly summary from cached entry capsules.",
    year,
    responseLanguage: settings.responseLanguage,
    previousYearSummary: previous ? previous.report : null,
    entryCapsules: capsules.map(compactCapsuleForPrompt)
  };

  return buildRequestBundle(JSON.stringify(payload, null, 2), LLM_YEAR_SUMMARY_COMPLETION_TOKENS, settings);
}

function buildYearSummaryMessages(year: string, bundle: LlmRequestBundle, settings: LlmSettings): Array<{ role: "system" | "user"; content: string }> {
  const variables = llmPromptVariables(settings, bundle, { year });
  return [
    {
      role: "system",
      content: renderLlmPromptTemplate(settings.prompts.yearSummarySystem, variables)
    },
    {
      role: "user",
      content: renderLlmPromptTemplate(settings.prompts.yearSummaryUser, variables)
    }
  ];
}

function buildCachedInsightBundle(settings: LlmSettings): { bundle: LlmRequestBundle; scopeLabel: string; selectedEntryCount: number; cacheSummary: string } {
  const selectedEntries = selectedLlmEntries();
  const missing = selectedEntries.filter((entry) => !validEntryCapsuleFor(entry));
  if (missing.length) {
    throw new Error(`Update entry cache first. ${missing.length} selected entr${missing.length === 1 ? "y is" : "ies are"} missing or stale.`);
  }

  const scope = llmScopeDefinition(state.llmScope);
  const currentYear = calendarYear(todayLocal());
  const coveredYears = new Set<string>();
  const yearSummaries: LlmYearSummary[] = [];

  if (state.llmScope === "all") {
    for (const year of selectedPastYears()) {
      const summary = validYearSummaryFor(year);
      if (summary) {
        coveredYears.add(year);
        yearSummaries.push(summary);
      }
    }
  }

  const entryCapsules = selectedEntries
    .filter((entry) => !coveredYears.has(calendarYear(entry.date)))
    .map((entry) => validEntryCapsuleFor(entry))
    .filter((capsule): capsule is LlmEntryCapsule => Boolean(capsule));
  const previousContext = state.llmScope === "all" ? null : latestPreviousYearSummary(selectedEntries[0]?.date || todayLocal());

  const payload = shrinkCachedInsightPayload({
    app: "Private Diary",
    task: "Generate the visible insight from cached LLM analysis only.",
    scope: scope.label,
    today: todayLocal(),
    responseLanguage: settings.responseLanguage,
    rawDiaryEntriesIncluded: false,
    previousYearContext: previousContext ? { year: previousContext.year, report: previousContext.report } : null,
    yearSummaries: yearSummaries.map((summary) => ({
      year: summary.year,
      entryCount: summary.entryCount,
      report: summary.report
    })),
    entryCapsules: entryCapsules.map(compactCapsuleForPrompt),
    omittedOlderCapsules: 0
  });
  const promptText = JSON.stringify(payload, null, 2);
  const cacheSummary = `${yearSummaries.length} year summar${yearSummaries.length === 1 ? "y" : "ies"}, ${payload.entryCapsules.length} entry capsule${payload.entryCapsules.length === 1 ? "" : "s"}, no raw entries`;

  return {
    bundle: buildRequestBundle(promptText, LLM_INSIGHT_COMPLETION_TOKENS, settings),
    scopeLabel: scope.label,
    selectedEntryCount: selectedEntries.length,
    cacheSummary
  };
}

function shrinkCachedInsightPayload<T extends { entryCapsules: unknown[]; omittedOlderCapsules: number }>(payload: T): T {
  while (payload.entryCapsules.length > 1 && JSON.stringify(payload).length > LLM_PROMPT_CHAR_BUDGET) {
    payload.entryCapsules.shift();
    payload.omittedOlderCapsules += 1;
  }
  return payload;
}

function buildFinalInsightMessages(bundle: LlmRequestBundle, settings: LlmSettings): Array<{ role: "system" | "user"; content: string }> {
  const variables = llmPromptVariables(settings, bundle);
  return [
    {
      role: "system",
      content: renderLlmPromptTemplate(settings.prompts.finalInsightSystem, variables)
    },
    {
      role: "user",
      content: renderLlmPromptTemplate(settings.prompts.finalInsightUser, variables)
    }
  ];
}

function latestPreviousYearSummary(date: string): LlmYearSummary | null {
  const year = Number(calendarYear(date));
  for (let candidate = year - 1; candidate >= 1900; candidate -= 1) {
    const summary = validYearSummaryFor(String(candidate));
    if (summary) return summary;
  }
  return null;
}

function compactEntryForLlm(entry: DiaryEntry): LlmPromptEntry {
  const promptAnswers = Object.entries(entry.promptAnswers || {})
    .filter(([, answer]) => answer.trim())
    .sort(([first], [second]) => first.localeCompare(second))
    .slice(0, 24)
    .map(([prompt, answer]) => ({
      prompt: trimLlmText(prompt.replace(/^Weekly review: /, "Weekly review - "), LLM_FIELD_TEXT_LIMIT),
      answer: trimLlmText(answer, LLM_FIELD_TEXT_LIMIT)
    }));

  return {
    date: entry.date,
    mood: entry.mood ? moodLabel(entry.mood) : "",
    energy: entry.energy,
    stress: entry.stress,
    themes: (entry.themes || []).slice(0, 20),
    journal: trimLlmText(entry.journalText, LLM_ENTRY_TEXT_LIMIT),
    reflections: promptAnswers,
    standingTopics: (entry.standingTopics || [])
      .filter((topic) => topic.active !== false)
      .slice(0, 40)
      .map((topic) => ({
        title: trimLlmText(topic.title, 120),
        acuteness: topic.acuteness,
        direction: topic.direction,
        comment: trimLlmText(topic.comment, LLM_FIELD_TEXT_LIMIT),
        nextStep: trimLlmText(topic.nextStep, 220)
      }))
  };
}

function compactCapsuleForPrompt(capsule: LlmEntryCapsule): JsonRecord {
  return {
    date: capsule.date,
    summary: capsule.summary,
    themes: capsule.themes,
    emotionalPattern: capsule.emotionalPattern,
    standingTopics: capsule.standingTopics,
    unresolved: capsule.unresolved,
    nextActions: capsule.nextActions,
    questions: capsule.questions
  };
}

function llmPromptVariables(settings: LlmSettings, bundle: LlmRequestBundle, extra: Record<string, string> = {}): Record<string, string> {
  return {
    responseLanguage: settings.responseLanguage,
    promptText: bundle.promptText,
    entryCapsuleFormatInstructions: llmEntryCapsuleFormatInstructions(),
    insightReportFormatInstructions: llmInsightReportFormatInstructions(),
    ...extra
  };
}

function renderLlmPromptTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] ?? "" : match;
  }).trim();
}

function entryAdvicePromptFingerprint(settings: LlmSettings): string {
  return llmPromptFingerprint(settings, "entry-advice", settings.prompts.entryAdviceSystem, settings.prompts.entryAdviceUser);
}

function entryCapsulePromptFingerprint(settings: LlmSettings): string {
  return llmPromptFingerprint(settings, "entry-capsule", settings.prompts.entryCapsuleSystem, settings.prompts.entryCapsuleUser);
}

function yearSummaryPromptFingerprint(settings: LlmSettings): string {
  return llmPromptFingerprint(settings, "year-summary", settings.prompts.yearSummarySystem, settings.prompts.yearSummaryUser);
}

function llmPromptFingerprint(settings: LlmSettings, kind: string, systemPrompt: string, userPrompt: string): string {
  return hashText([
    kind,
    settings.responseLanguage,
    systemPrompt,
    userPrompt
  ].join("\n---\n"));
}

function buildRequestBundle(promptText: string, completionTokens: number, settings: LlmSettings): LlmRequestBundle {
  const promptTokens = estimateTokenCount(promptText) + 500;
  return {
    promptText,
    promptTokens,
    completionTokens,
    estimatedCost: estimateLlmCost(promptTokens, completionTokens)
  };
}

async function requestOpenRouterText(
  settings: LlmSettings,
  bundle: LlmRequestBundle,
  messages: Array<{ role: "system" | "user"; content: string }>
): Promise<{ rawText: string; model: string; cost: LlmCostReport }> {
  const { response, payload } = await fetchOpenRouterJson(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + settings.apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      provider: {
        data_collection: "deny",
        zdr: true
      },
      temperature: 0.25,
      max_completion_tokens: bundle.completionTokens
    })
  });

  if (!response.ok) throw new Error(openRouterErrorMessage(payload, response.status));
  if (!isRecord(payload)) throw new Error("OpenRouter returned an invalid response.");

  const chat = payload as OpenRouterChatResponse;
  const rawText = openRouterChoiceText(chat.choices).trim();
  if (!rawText) throw new Error("OpenRouter returned no text.");

  return {
    rawText,
    model: typeof chat.model === "string" ? chat.model : settings.model,
    cost: await openRouterCostReport(settings.apiKey, chat, bundle)
  };
}

async function saveLlmRunLog(kind: LlmRunLog["kind"], scopeLabel: string, cost: LlmCostReport): Promise<void> {
  try {
    const generatedAt = new Date().toISOString();
    const id = `run-log:${generatedAt}:${kind}`;
    const log: LlmRunLog = {
      schemaVersion: LLM_CACHE_SCHEMA_VERSION,
      kind,
      generatedAt,
      model: state.llmSettings.model,
      responseLanguage: state.llmSettings.responseLanguage,
      scopeLabel,
      cost
    };
    await putEncryptedLlmRecord(id, "run-log", log);
    state.llmRunLogs.set(id, log);
  } catch (error) {
    // Run logs are useful for audit, but the user-facing cache should not fail if a log write fails.
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    return { error: { message: text.slice(0, 600) } };
  }
}

function openRouterErrorMessage(payload: unknown, status: number): string {
  const message = openRouterPayloadMessage(payload);
  return `OpenRouter ${status}${message ? ": " + message : ""}`;
}

function openRouterPayloadMessage(payload: unknown): string {
  if (!isRecord(payload)) return "";
  const error = payload.error;
  if (typeof error === "string") return error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  if (typeof payload.message === "string") return payload.message;
  return "";
}

function openRouterChoiceText(choices: unknown): string {
  if (!Array.isArray(choices) || !choices.length) return "";
  const first = choices[0];
  if (!isRecord(first)) return "";
  const message = first.message;
  if (isRecord(message)) return openRouterContentText(message.content);
  const text = first.text;
  return typeof text === "string" ? text : "";
}

function openRouterContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (!isRecord(part)) return "";
    if (typeof part.text === "string") return part.text;
    if (typeof part.content === "string") return part.content;
    return "";
  }).join("");
}

async function openRouterCostReport(apiKey: string, chat: OpenRouterChatResponse, bundle: LlmRequestBundle): Promise<LlmCostReport> {
  const usageReport = costReportFromUsage(chat.usage, bundle);
  if (usageReport.actualCost !== null || typeof chat.id !== "string") return usageReport;

  try {
    const generation = await fetchOpenRouterGeneration(apiKey, chat.id);
    return mergeGenerationCost(usageReport, generation);
  } catch (error) {
    return usageReport;
  }
}

function costReportFromUsage(usage: OpenRouterUsage | undefined, bundle: LlmRequestBundle): LlmCostReport {
  const promptTokens = numberOrZero(usage?.prompt_tokens);
  const completionTokens = numberOrZero(usage?.completion_tokens);
  const totalTokens = numberOrZero(usage?.total_tokens) || promptTokens + completionTokens;
  const actualCost = numberOrNull(usage?.cost);

  return {
    projectedCost: bundle.estimatedCost,
    actualCost,
    actualCostSource: actualCost === null ? "" : "usage",
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedPromptTokens: bundle.promptTokens,
    estimatedCompletionTokens: bundle.completionTokens
  };
}

async function fetchOpenRouterGeneration(apiKey: string, generationId: string): Promise<OpenRouterGenerationResponse> {
  const url = `${OPENROUTER_GENERATION_URL}?id=${encodeURIComponent(generationId)}`;
  const { response, payload } = await fetchOpenRouterJson(url, {
    method: "GET",
    headers: {
      "Authorization": "Bearer " + apiKey
    }
  });
  if (!response.ok) throw new Error(openRouterErrorMessage(payload, response.status));
  return isRecord(payload) ? payload as OpenRouterGenerationResponse : {};
}

function mergeGenerationCost(current: LlmCostReport, generation: OpenRouterGenerationResponse): LlmCostReport {
  if (!isRecord(generation.data)) return current;
  const data = generation.data;
  const actualCost = numberOrNull(data.total_cost) ?? numberOrNull(data.usage);
  const promptTokens = numberOrZero(data.tokens_prompt) || numberOrZero(data.native_tokens_prompt) || current.promptTokens;
  const completionTokens = numberOrZero(data.tokens_completion) || numberOrZero(data.native_tokens_completion) || current.completionTokens;
  const totalTokens = promptTokens + completionTokens || current.totalTokens;

  return {
    ...current,
    actualCost,
    actualCostSource: actualCost === null ? current.actualCostSource : "generation",
    promptTokens,
    completionTokens,
    totalTokens
  };
}

function addCostReport(total: LlmCostReport, next: LlmCostReport): void {
  total.projectedCost += next.projectedCost;
  total.promptTokens += next.promptTokens;
  total.completionTokens += next.completionTokens;
  total.totalTokens += next.totalTokens;
  total.estimatedPromptTokens += next.estimatedPromptTokens;
  total.estimatedCompletionTokens += next.estimatedCompletionTokens;
  if (next.actualCost !== null) {
    if (total.actualCostSource !== "partial") {
      total.actualCost = (total.actualCost || 0) + next.actualCost;
      total.actualCostSource = next.actualCostSource || total.actualCostSource;
    }
  } else {
    total.actualCost = null;
    total.actualCostSource = "partial";
  }
}

function emptyCostReport(projectedCost: number): LlmCostReport {
  return {
    projectedCost,
    actualCost: null,
    actualCostSource: "",
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedPromptTokens: 0,
    estimatedCompletionTokens: 0
  };
}

function parseLlmInsightReport(text: string): LlmInsightReport | null {
  const parsed = parseLlmJson(text);
  if (isRecord(parsed)) return normalizeLlmInsightReportRecord(parsed);

  return parseDelimitedLlmInsightReport(text);
}

function normalizeLlmInsightReportRecord(parsed: JsonRecord): LlmInsightReport | null {
  const report: LlmInsightReport = {
    summary: cleanLlmOutputText(parsed.summary, 1400),
    patterns: normalizeLlmInsightItems(parsed.patterns),
    pressurePoints: normalizeLlmInsightItems(parsed.pressurePoints || parsed.tensions || parsed.risks),
    standingTopics: normalizeLlmInsightItems(parsed.standingTopics || parsed.topics),
    nextActions: normalizeLlmStringList(parsed.nextActions || parsed.actions),
    questions: normalizeLlmStringList(parsed.questions)
  };

  return hasLlmInsightReportContent(report) ? report : null;
}

function parseDelimitedLlmInsightReport(text: string): LlmInsightReport | null {
  const fields = splitLlmResponseFields(text);
  if (!fields.length) return null;

  const report: LlmInsightReport = {
    summary: cleanLlmOutputText(llmFieldBody(fields, ["summary"]), 1400),
    patterns: parseDelimitedInsightItems(llmFieldBody(fields, ["patterns"])),
    pressurePoints: parseDelimitedInsightItems(llmFieldBody(fields, ["pressurepoints", "tensions", "risks"])),
    standingTopics: parseDelimitedInsightItems(llmFieldBody(fields, ["standingtopics", "topics"])),
    nextActions: parseDelimitedStringList(llmFieldBody(fields, ["nextmoves", "nextactions", "actions"])),
    questions: parseDelimitedStringList(llmFieldBody(fields, ["questions"]))
  };

  return hasLlmInsightReportContent(report) ? report : null;
}

function hasLlmInsightReportContent(report: LlmInsightReport): boolean {
  return Boolean(
    report.summary ||
    report.patterns.length ||
    report.pressurePoints.length ||
    report.standingTopics.length ||
    report.nextActions.length ||
    report.questions.length
  );
}

type LlmResponseField = {
  key: string;
  name: string;
  body: string;
};

function splitLlmResponseFields(text: string): LlmResponseField[] {
  return splitKnownLlmResponseFields(text, [
    "summary",
    "patterns",
    "pressurepoints",
    "tensions",
    "risks",
    "standingtopics",
    "topics",
    "nextmoves",
    "nextactions",
    "actions",
    "questions"
  ]);
}

function splitKnownLlmResponseFields(text: string, allowedFieldKeys: string[]): LlmResponseField[] {
  const allowedKeys = new Set(allowedFieldKeys);
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const fields: LlmResponseField[] = [];
  let current: LlmResponseField | null = null;

  const pushCurrent = () => {
    if (!current) return;
    current.body = current.body.trim();
    fields.push(current);
    current = null;
  };

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim().toUpperCase() === LLM_RESPONSE_FIELD_SEPARATOR) continue;

    const match = /^([A-Za-z][A-Za-z0-9 _-]{0,80})\s*:\s*(.*)$/.exec(line.trimStart());
    const key = match ? normalizeLlmFieldName(match[1] || "") : "";
    if (match && allowedKeys.has(key)) {
      pushCurrent();
      const name = cleanLlmOutputText(match[1], 80);
      current = { key, name, body: match[2]?.trim() || "" };
      continue;
    }

    if (current) {
      current.body = current.body ? `${current.body}\n${line}` : line.trim();
    }
  }

  pushCurrent();
  return fields;
}

function normalizeLlmFieldName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function llmFieldBody(fields: LlmResponseField[], names: string[]): string {
  const keys = new Set(names.map(normalizeLlmFieldName));
  return fields
    .filter((field) => keys.has(field.key))
    .map((field) => field.body)
    .filter(Boolean)
    .join("\n");
}

function parseDelimitedInsightItems(text: string): LlmInsightItem[] {
  const lines = normalizedDelimitedLines(text);
  const items: Array<{ title: string; detail: string[]; evidence: string[] }> = [];
  let current: { title: string; detail: string[]; evidence: string[] } | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const title = cleanLlmOutputText(current.title, 140);
    const detail = cleanLlmOutputText(current.detail.join(" "), 900);
    const evidence = current.evidence.map((item) => cleanLlmOutputText(item, 220)).filter(Boolean).slice(0, 5);
    if (title || detail) items.push({ title, detail: detail ? [detail] : [], evidence });
    current = null;
  };

  for (const line of lines) {
    const parsed = parseNameValueLine(line);
    if (!parsed) {
      if (current) current.detail.push(line);
      else current = { title: "", detail: [line], evidence: [] };
      continue;
    }

    const key = normalizeLlmFieldName(parsed.name);
    if (current && (key === "evidence" || key === "examples")) {
      current.evidence.push(...splitDelimitedEvidence(parsed.value));
      continue;
    }

    if (current && (key === "detail" || key === "details" || key === "description")) {
      current.detail.push(parsed.value);
      continue;
    }

    if (current && /^\d{4}(-\d{2}){0,2}$/.test(parsed.name)) {
      current.evidence.push(`${parsed.name}: ${parsed.value}`);
      continue;
    }

    pushCurrent();
    current = { title: parsed.name, detail: parsed.value ? [parsed.value] : [], evidence: [] };
  }

  pushCurrent();
  return items
    .map((item) => ({
      title: cleanLlmOutputText(item.title, 140),
      detail: cleanLlmOutputText(item.detail.join(" "), 900),
      evidence: item.evidence.map((evidence) => cleanLlmOutputText(evidence, 220)).filter(Boolean).slice(0, 5)
    }))
    .filter((item) => item.title || item.detail)
    .slice(0, 12);
}

function parseNameValueLine(line: string): { name: string; value: string } | null {
  const index = line.indexOf(":");
  if (index <= 0 || index > 140) return null;
  const name = cleanLlmOutputText(line.slice(0, index), 140);
  const value = line.slice(index + 1).trim();
  return name ? { name, value } : null;
}

function parseDelimitedStringList(text: string): string[] {
  const lines = normalizedDelimitedLines(text);
  const source = lines.length > 1 ? lines : text.split(/[;\n]+/);
  return source
    .map((line) => cleanLlmOutputText(cleanDelimitedListLine(line), 360))
    .filter(Boolean)
    .slice(0, 12);
}

function parseDelimitedThemes(text: string): string[] {
  return text
    .split(/[;,\n]+/)
    .map((line) => cleanLlmOutputText(cleanDelimitedListLine(line), 80))
    .filter(Boolean)
    .slice(0, 12);
}

function splitDelimitedEvidence(text: string): string[] {
  return text
    .split(/[;|]+/)
    .map((item) => cleanLlmOutputText(item, 220))
    .filter(Boolean)
    .slice(0, 5);
}

function normalizedDelimitedLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(cleanDelimitedListLine)
    .filter(Boolean);
}

function cleanDelimitedListLine(text: string): string {
  return text.replace(/^\s*(?:[-*]\s+|\d+[.)]\s*)/, "").trim();
}

function parseLlmJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1)) as unknown;
    } catch (innerError) {
      return null;
    }
  }
}

function normalizeLoadedLlmEntryCapsule(value: unknown): LlmEntryCapsule | null {
  if (!isRecord(value) || typeof value.date !== "string") return null;
  return {
    schemaVersion: value.schemaVersion === LLM_CACHE_SCHEMA_VERSION ? LLM_CACHE_SCHEMA_VERSION : 0,
    id: typeof value.id === "string" ? value.id : entryCapsuleRecordId(value.date),
    date: value.date,
    entryFingerprint: typeof value.entryFingerprint === "string" ? value.entryFingerprint : "",
    promptFingerprint: typeof value.promptFingerprint === "string" ? value.promptFingerprint : "",
    model: typeof value.model === "string" ? value.model : "",
    responseLanguage: typeof value.responseLanguage === "string" ? value.responseLanguage : "",
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : "",
    summary: cleanLlmOutputText(value.summary, 1400),
    themes: normalizeLlmStringList(value.themes),
    emotionalPattern: cleanLlmOutputText(value.emotionalPattern, 900),
    standingTopics: normalizeLlmInsightItems(value.standingTopics),
    unresolved: normalizeLlmStringList(value.unresolved),
    nextActions: normalizeLlmStringList(value.nextActions),
    questions: normalizeLlmStringList(value.questions),
    rawText: typeof value.rawText === "string" ? value.rawText : ""
  };
}

function normalizeLoadedLlmYearSummary(value: unknown): LlmYearSummary | null {
  if (!isRecord(value) || typeof value.year !== "string") return null;
  const report = isRecord(value.report) ? parseLlmInsightReport(JSON.stringify(value.report)) : null;
  if (!report) return null;
  return {
    schemaVersion: value.schemaVersion === LLM_CACHE_SCHEMA_VERSION ? LLM_CACHE_SCHEMA_VERSION : 0,
    id: typeof value.id === "string" ? value.id : yearSummaryRecordId(value.year),
    year: value.year,
    promptFingerprint: typeof value.promptFingerprint === "string" ? value.promptFingerprint : "",
    model: typeof value.model === "string" ? value.model : "",
    responseLanguage: typeof value.responseLanguage === "string" ? value.responseLanguage : "",
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : "",
    sourceFingerprint: typeof value.sourceFingerprint === "string" ? value.sourceFingerprint : "",
    previousYearSourceFingerprint: typeof value.previousYearSourceFingerprint === "string" ? value.previousYearSourceFingerprint : "",
    entryCount: numberOrZero(value.entryCount),
    report,
    rawText: typeof value.rawText === "string" ? value.rawText : ""
  };
}

function normalizeLoadedLlmRunLog(value: unknown): LlmRunLog | null {
  if (!isRecord(value)) return null;
  const kind = value.kind === "entry-cache" || value.kind === "year-summary" || value.kind === "final-insight"
    ? value.kind
    : null;
  if (!kind) return null;
  return {
    schemaVersion: value.schemaVersion === LLM_CACHE_SCHEMA_VERSION ? LLM_CACHE_SCHEMA_VERSION : 0,
    kind,
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : "",
    model: typeof value.model === "string" ? value.model : "",
    responseLanguage: typeof value.responseLanguage === "string" ? value.responseLanguage : "",
    scopeLabel: typeof value.scopeLabel === "string" ? value.scopeLabel : "",
    cost: normalizeLlmCostReport(value.cost)
  };
}

function normalizeLlmCostReport(value: unknown): LlmCostReport {
  if (!isRecord(value)) return emptyCostReport(0);
  const source = value.actualCostSource;
  return {
    projectedCost: numberOrZero(value.projectedCost),
    actualCost: numberOrNull(value.actualCost),
    actualCostSource: source === "usage" || source === "generation" || source === "partial" ? source : "",
    promptTokens: numberOrZero(value.promptTokens),
    completionTokens: numberOrZero(value.completionTokens),
    totalTokens: numberOrZero(value.totalTokens),
    estimatedPromptTokens: numberOrZero(value.estimatedPromptTokens),
    estimatedCompletionTokens: numberOrZero(value.estimatedCompletionTokens)
  };
}

function normalizeLlmInsightItems(value: unknown): LlmInsightItem[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeLlmInsightItem).filter((item): item is LlmInsightItem => Boolean(item)).slice(0, 12);
}

function normalizeLlmInsightItem(value: unknown): LlmInsightItem | null {
  if (typeof value === "string") {
    const detail = cleanLlmOutputText(value, 900);
    return detail ? { title: "", detail, evidence: [] } : null;
  }
  if (!isRecord(value)) return null;
  const title = cleanLlmOutputText(value.title || value.name, 140);
  const detail = cleanLlmOutputText(value.detail || value.description || value.text, 900);
  const evidence = normalizeLlmStringList(value.evidence).slice(0, 5);
  if (!title && !detail) return null;
  return { title, detail, evidence };
}

function normalizeLlmStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanLlmOutputText(item, 360))
    .filter(Boolean)
    .slice(0, 12);
}

function cleanLlmOutputText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

function appendLlmReport(report: LlmInsightReport): void {
  if (report.summary) {
    const summary = document.createElement("section");
    summary.className = "llm-result-section";
    const heading = document.createElement("h3");
    heading.textContent = "Summary";
    const text = document.createElement("p");
    text.className = "read-text";
    text.textContent = report.summary;
    summary.append(heading, text);
    els.llmResult.append(summary);
  }

  appendLlmItemSection("Patterns", report.patterns);
  appendLlmItemSection("Pressure Points", report.pressurePoints);
  appendLlmItemSection("Standing Topics", report.standingTopics);
  appendLlmStringSection("Next Moves", report.nextActions);
  appendLlmStringSection("Questions", report.questions);
}

function appendLlmItemSection(title: string, items: LlmInsightItem[]): void {
  if (!items.length) return;
  const section = document.createElement("section");
  section.className = "llm-result-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("div");
  list.className = "llm-item-list";

  for (const item of items) {
    const article = document.createElement("article");
    article.className = "llm-item";
    if (item.title) {
      const itemTitle = document.createElement("strong");
      itemTitle.textContent = item.title;
      article.append(itemTitle);
    }
    if (item.detail) {
      const detail = document.createElement("p");
      detail.textContent = item.detail;
      article.append(detail);
    }
    if (item.evidence.length) {
      const evidence = document.createElement("p");
      evidence.className = "topic-meta";
      evidence.textContent = item.evidence.join(" | ");
      article.append(evidence);
    }
    list.append(article);
  }

  section.append(heading, list);
  els.llmResult.append(section);
}

function appendLlmStringSection(title: string, items: string[]): void {
  if (!items.length) return;
  const section = document.createElement("section");
  section.className = "llm-result-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("ul");
  list.className = "llm-bullet-list";

  for (const item of items) {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    list.append(listItem);
  }

  section.append(heading, list);
  els.llmResult.append(section);
}

function trimLlmText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/\r\n/g, "\n").trim();
  if (text.length <= limit) return text;
  return text.slice(0, Math.max(0, limit - 18)).trimEnd() + " [truncated]";
}

function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateLlmCost(promptTokens: number, completionTokens: number): number {
  const pricing = state.llmPricing;
  if (!pricing || pricing.model !== state.llmSettings.model) return 0;
  const input = (promptTokens / 1000000) * pricing.inputPricePerMillion;
  const output = (completionTokens / 1000000) * pricing.outputPricePerMillion;
  return input + output;
}

function llmCostReportText(cost: LlmCostReport): string {
  const actual = cost.actualCost === null
    ? cost.actualCostSource === "partial" ? "reported cost partially unavailable" : "reported cost unavailable"
    : `reported ${formatCreditCost(cost.actualCost)}${cost.actualCostSource ? " from " + cost.actualCostSource : ""}`;
  const tokenText = cost.totalTokens
    ? `${cost.promptTokens} input, ${cost.completionTokens} output tokens`
    : `estimated ${cost.estimatedPromptTokens + cost.estimatedCompletionTokens} max tokens`;
  return `Projected ${formatUsdCost(cost.projectedCost)}; ${actual}; ${tokenText}.`;
}

function formatOpenRouterBalance(value: number): string {
  if (!Number.isFinite(value)) return "unavailable";
  if (value < 0) return "-" + formatUsdCost(Math.abs(value));
  return formatUsdCost(value);
}

function formatUsdCost(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value < 0.000001) return "<$0.000001";
  if (value < 0.01) return "$" + trimTrailingZeros(value.toFixed(6));
  if (value < 1) return "$" + trimTrailingZeros(value.toFixed(4));
  return "$" + value.toFixed(2);
}

function formatCreditCost(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 credits";
  if (value < 0.000001) return "<0.000001 credits";
  const formatted = value < 0.01 ? trimTrailingZeros(value.toFixed(6)) : trimTrailingZeros(value.toFixed(4));
  return `${formatted} credit${value === 1 ? "" : "s"}`;
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.?0+$/, "");
}

function numberOrZero(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function entryCapsuleRecordId(date: string): string {
  return `entry-capsule:${date}`;
}

function yearSummaryRecordId(year: string): string {
  return `year-summary:${year}`;
}
