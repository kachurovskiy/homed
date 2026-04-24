function renderAuthMode(): void {
  const hasVault = Boolean(state.vault);
  els.vaultState.textContent = hasVault ? "Vault found" : "No vault yet";
  els.lockTitle.textContent = hasVault ? "Unlock your diary" : "Create your encrypted diary";
  els.authButton.textContent = hasVault ? "Unlock" : "Create vault";
  els.passwordInput.autocomplete = hasVault ? "current-password" : "new-password";
  els.confirmPasswordWrap.classList.toggle("hidden", hasVault);
  els.confirmPasswordInput.required = !hasVault;
}

function renderAll(): void {
  renderEntryScreen();
  renderRecentEntries();
  renderLlmSettingsControls();
  renderInsights();
}

function renderEntryScreen(): void {
  const record = state.records.get(state.currentDate);
  const entry = state.entries.get(state.currentDate);
  els.entryDate.value = state.currentDate;
  els.moodSelect.value = entry?.mood || "";
  els.energyInput.value = String(clampNumber(entry?.energy, 1, 10, 5));
  els.stressInput.value = String(clampNumber(entry?.stress, 1, 10, 5));
  syncEntryChoiceControls();
  els.journalText.value = entry?.journalText || "";
  els.themesInput.value = Array.isArray(entry?.themes) ? entry.themes.join(", ") : "";
  els.entrySavedState.textContent = record ? "Updated " + formatDateTime(record.updatedAt) : "Not saved yet";
  renderStandingTopics();
  renderPrompts();
  renderWeeklyReview();
  renderEntryAdviceControls();
  renderEntryAdviceResult();
  state.lastSavedFingerprint = record || entry ? currentEntryFingerprint() : "";
}

function renderPrompts(): void {
  const entry = state.entries.get(state.currentDate);
  const answers = entry?.promptAnswers || {};
  const prompts = promptsForDate(state.currentDate, state.promptShift);
  const visiblePrompts = promptsWithSavedReflectionAnswers(prompts, answers);
  els.promptList.replaceChildren();

  for (const prompt of visiblePrompts) {
    const wrap = document.createElement("label");
    wrap.className = "prompt-field";
    const span = document.createElement("span");
    span.textContent = prompt;
    const textarea = document.createElement("textarea");
    textarea.dataset.promptField = prompt;
    textarea.value = answers[prompt] || "";
    wrap.append(span, textarea);
    els.promptList.append(wrap);
  }
}

function promptsWithSavedReflectionAnswers(prompts: string[], answers: Record<string, string>): string[] {
  const seen = new Set(prompts);
  const savedPrompts = Object.entries(answers)
    .filter(([prompt, answer]) => isSavedReflectionPrompt(prompt, answer) && !seen.has(prompt))
    .map(([prompt]) => prompt)
    .sort(compareReflectionPromptOrder);

  return [...prompts, ...savedPrompts];
}

function isSavedReflectionPrompt(prompt: string, answer: string): boolean {
  return !prompt.startsWith("Weekly review: ") && Boolean(answer.trim());
}

function compareReflectionPromptOrder(first: string, second: string): number {
  const firstOrder = reflectionPromptOrder(first);
  const secondOrder = reflectionPromptOrder(second);
  if (firstOrder !== secondOrder) return firstOrder - secondOrder;
  return first.localeCompare(second);
}

function reflectionPromptOrder(prompt: string): number {
  const index = (REFLECTION_PROMPTS as readonly string[]).indexOf(prompt);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function renderWeeklyReview(): void {
  const entry = state.entries.get(state.currentDate);
  const answers = entry?.promptAnswers || {};
  const range = getWeekRange(state.currentDate);
  const weekEntries = sortedEntriesAsc().filter((item) => item.date >= range.start && item.date <= range.end);

  els.weekRange.textContent = `${formatDateShort(range.start)} - ${formatDateShort(range.end)}`;
  els.weekSummary.replaceChildren();

  if (!weekEntries.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No entries saved in this week yet.";
    els.weekSummary.append(empty);
  } else {
    const count = document.createElement("p");
    count.textContent = `${weekEntries.length} saved entr${weekEntries.length === 1 ? "y" : "ies"} in this week.`;
    const moodLine = document.createElement("p");
    moodLine.textContent = weeklyMoodLine(weekEntries);
    els.weekSummary.append(count, moodLine);
  }

  els.weeklyQuestions.replaceChildren();
  for (const question of WEEKLY_QUESTIONS) {
    const key = weeklyAnswerKey(question);
    const wrap = document.createElement("label");
    wrap.className = "weekly-field";
    const span = document.createElement("span");
    span.textContent = question;
    const textarea = document.createElement("textarea");
    textarea.dataset.weeklyField = question;
    textarea.value = answers[key] || "";
    wrap.append(span, textarea);
    els.weeklyQuestions.append(wrap);
  }
}

function renderStandingTopics(): void {
  const entry = state.entries.get(state.currentDate);
  const observations = standingTopicMap(entry);
  const topics = trackedStandingTopics();
  els.topicList.replaceChildren();
  els.topicTitleInput.value = "";

  if (!topics.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No standing topics yet.";
    els.topicList.append(empty);
  } else {
    for (const topic of topics) {
      els.topicList.append(standingTopicCard(topic, observations.get(topic.id)));
    }
  }

  updateTopicCount();
}

function standingTopicCard(topic: StandingTopicIdentity, observation?: StandingTopic | null): HTMLElement {
  const card = document.createElement("article");
  card.className = "topic-card";
  card.dataset.topicId = topic.id;
  card.dataset.topicTitle = topic.title;

  const head = document.createElement("div");
  head.className = "topic-card-head";
  const title = document.createElement("strong");
  title.textContent = topic.title;
  const value = document.createElement("span");
  const valueNumber = document.createElement("strong");
  valueNumber.dataset.topicValue = "true";
  valueNumber.textContent = String(clampNumber(observation?.acuteness, 0, 10, 0));
  value.append("Acuteness ", valueNumber, "/10");
  head.append(title, value);

  const grid = document.createElement("div");
  grid.className = "topic-grid";

  const acutenessLabel = document.createElement("label");
  const acutenessText = document.createElement("span");
  acutenessText.textContent = "Acuteness";
  const acutenessInput = document.createElement("input");
  acutenessInput.type = "range";
  acutenessInput.min = "0";
  acutenessInput.max = "10";
  acutenessInput.step = "1";
  acutenessInput.value = String(clampNumber(observation?.acuteness, 0, 10, 0));
  acutenessInput.dataset.topicField = "acuteness";
  acutenessInput.dataset.topicAcuteness = "true";
  acutenessLabel.append(acutenessText, acutenessInput);

  const directionLabel = document.createElement("label");
  const directionText = document.createElement("span");
  directionText.textContent = "Direction";
  const directionSelect = document.createElement("select");
  directionSelect.dataset.topicField = "direction";
  const directionValue = normalizeDirectionValue(observation?.direction);
  for (const item of TOPIC_DIRECTIONS) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    directionSelect.append(option);
  }
  directionSelect.value = TOPIC_DIRECTIONS.some((item) => item.value === directionValue) ? directionValue : "";
  directionLabel.append(directionText, directionSelect);

  const nextStepLabel = document.createElement("label");
  const nextStepText = document.createElement("span");
  nextStepText.textContent = "Next small action";
  const nextStepInput = document.createElement("input");
  nextStepInput.type = "text";
  nextStepInput.maxLength = 140;
  nextStepInput.placeholder = "optional";
  nextStepInput.value = typeof observation?.nextStep === "string" ? observation.nextStep : "";
  nextStepInput.dataset.topicField = "nextStep";
  nextStepLabel.append(nextStepText, nextStepInput);

  grid.append(acutenessLabel, directionLabel, nextStepLabel);

  const commentLabel = document.createElement("label");
  const commentText = document.createElement("span");
  commentText.textContent = "Comment";
  const comment = document.createElement("textarea");
  comment.placeholder = "What changed, what triggered it, or what needs attention?";
  comment.value = typeof observation?.comment === "string" ? observation.comment : "";
  comment.dataset.topicField = "comment";
  commentLabel.append(commentText, comment);

  const stats = document.createElement("p");
  stats.className = "topic-meta";
  stats.textContent = standingTopicCardSummary(topic.id);

  card.append(head, grid, commentLabel, stats);
  return card;
}

function addStandingTopic(): void {
  const title = normalizeTopicTitle(els.topicTitleInput.value);
  if (!title) {
    setStatus(els.entryStatus, "Add a short topic title first.", "error");
    els.topicTitleInput.focus();
    return;
  }

  const id = topicIdForTitle(title);
  if (standingTopicExistsInForm(id)) {
    setStatus(els.entryStatus, "That topic is already being tracked.", "warn");
    els.topicTitleInput.select();
    return;
  }

  const empty = els.topicList.querySelector(".empty");
  if (empty) empty.remove();
  els.topicList.append(standingTopicCard({ id, title }, { id, title, acuteness: 5, direction: "", comment: "", nextStep: "", active: true }));
  els.topicTitleInput.value = "";
  updateTopicCount();
  setStatus(els.entryStatus, "Tracking topic. Auto-save is on.", "warn");
  scheduleAutoSave();
}

function updateTopicCount(): void {
  const count = els.topicList.querySelectorAll("[data-topic-id]").length;
  els.topicCount.textContent = `${count} tracked`;
}

function standingTopicExistsInForm(id: string): boolean {
  return Array.from(els.topicList.querySelectorAll<HTMLElement>("[data-topic-id]")).some((card) => card.dataset.topicId === id);
}

function renderRecentEntries(): void {
  const entries = sortedEntriesDesc();
  renderBrowseCharts(sortedEntriesAsc());
  const query = els.searchInput.value.trim().toLowerCase();
  const yearFilter = state.browseYearFilter;
  const yearEntries = yearFilter ? entries.filter((entry) => entry.date.startsWith(yearFilter + "-")) : entries;
  const visibleEntries = query ? yearEntries.filter((entry) => entrySearchText(entry).includes(query)) : yearEntries;

  els.entryCount.textContent = browseEntryCountText(entries.length, yearEntries.length, visibleEntries.length, query, yearFilter);
  els.recentEntries.replaceChildren();

  if (!entries.length) {
    state.browseDate = "";
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No entries yet.";
    els.recentEntries.append(empty);
    renderBrowseEntryDetail();
    return;
  }

  if (yearFilter && !yearEntries.length) {
    state.browseYearFilter = "";
    renderRecentEntries();
    return;
  }

  if (!state.browseDate || !state.entries.has(state.browseDate) || !entryMatchesBrowseFilters(state.entries.get(state.browseDate), query, state.browseYearFilter)) {
    state.browseDate = visibleEntries[0]?.date || yearEntries[0]?.date || entries[0]?.date || "";
  }

  if (!visibleEntries.length) {
    state.browseDate = yearEntries[0]?.date || entries[0]?.date || "";
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No matching entries.";
    els.recentEntries.append(empty);
    renderBrowseEntryDetail();
    return;
  }

  for (const entry of visibleEntries) {
    els.recentEntries.append(entryButton(entry, "browse"));
  }

  renderBrowseEntryDetail();
}

function browseEntryCountText(totalCount: number, yearCount: number, visibleCount: number, query: string, yearFilter: string): string {
  if (yearFilter && query) {
    return `${visibleCount} of ${yearCount} in ${yearFilter}; ${totalCount} total`;
  }
  if (yearFilter) {
    return `${yearCount} entr${yearCount === 1 ? "y" : "ies"} in ${yearFilter}; ${totalCount} total`;
  }
  if (query) {
    return `${visibleCount} of ${totalCount} entr${totalCount === 1 ? "y" : "ies"}`;
  }
  return `${totalCount} entr${totalCount === 1 ? "y" : "ies"}`;
}

function entryMatchesBrowseFilters(entry: DiaryEntry | undefined, query: string, yearFilter: string): boolean {
  if (!entry) return false;
  if (yearFilter && !entry.date.startsWith(yearFilter + "-")) return false;
  return !query || entrySearchText(entry).includes(query);
}

type BrowseChartDatum = {
  label: string;
  value: number;
  valueLabel: string;
  ariaLabel: string;
  filterValue?: string;
};

function renderBrowseCharts(entries: DiaryEntry[]): void {
  renderBarChart(els.browseEntriesByYearChart, entriesByYearChartData(entries), "No entries yet.", onBrowseYearChartSelected);
  renderBarChart(els.browseLengthByYearChart, entryLengthByYearChartData(entries), "No entry text yet.", onBrowseYearChartSelected);
}

function entriesByYearChartData(entries: DiaryEntry[]): BrowseChartDatum[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const year = entry.date.slice(0, 4);
    counts.set(year, (counts.get(year) || 0) + 1);
  }
  return Array.from(counts.entries()).sort(([first], [second]) => first.localeCompare(second)).map(([year, count]) => ({
    label: year,
    value: count,
    valueLabel: formatChartInteger(count),
    ariaLabel: `${year}: ${formatEntryUnit(count)}`,
    filterValue: year
  }));
}

function entryLengthByYearChartData(entries: DiaryEntry[]): BrowseChartDatum[] {
  const lengths = new Map<string, number>();
  for (const entry of entries) {
    const year = entry.date.slice(0, 4);
    lengths.set(year, (lengths.get(year) || 0) + entryTextLength(entry));
  }
  return Array.from(lengths.entries()).sort(([first], [second]) => first.localeCompare(second)).map(([year, length]) => ({
    label: year,
    value: length,
    valueLabel: formatChartLength(length),
    ariaLabel: `${year}: ${formatChartInteger(length)} character${length === 1 ? "" : "s"}`,
    filterValue: year
  }));
}

function renderBarChart(container: HTMLElement, data: BrowseChartDatum[], emptyText: string, onSelect?: (value: string) => void): void {
  container.replaceChildren();
  if (!data.length) {
    container.append(emptyInline(emptyText));
    return;
  }

  const max = Math.max(1, ...data.map((item) => item.value));
  for (const item of data) {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.setAttribute("aria-label", item.ariaLabel);
    row.title = item.ariaLabel;
    if (item.filterValue && onSelect) {
      const selected = state.browseYearFilter === item.filterValue;
      row.classList.add("bar-row-button");
      row.classList.toggle("active", selected);
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-pressed", String(selected));
      row.addEventListener("click", () => onSelect(item.filterValue || ""));
      row.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect(item.filterValue || "");
      });
    }

    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = item.label;

    const track = document.createElement("span");
    track.className = "bar-track";
    if (item.value > 0) {
      const fill = document.createElement("span");
      fill.className = "bar-fill";
      fill.style.width = `${Math.max(3, (item.value / max) * 100)}%`;
      track.append(fill);
    }

    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = item.valueLabel;

    row.append(label, track, value);
    container.append(row);
  }
}

function onBrowseYearChartSelected(year: string): void {
  state.browseYearFilter = state.browseYearFilter === year ? "" : year;
  renderRecentEntries();
  resetAutoLockTimer();
}

function entryTextLength(entry: DiaryEntry): number {
  return [
    entry.journalText,
    ...Object.values(entry.promptAnswers || {}),
    ...(entry.standingTopics || []).flatMap((topic) => [topic.title, topic.comment, topic.nextStep])
  ].join("\n").trim().length;
}

function formatEntryUnit(count: number): string {
  return `${formatChartInteger(count)} entr${count === 1 ? "y" : "ies"}`;
}

function formatChartInteger(value: number): string {
  return Math.round(value).toLocaleString();
}

function formatChartLength(value: number): string {
  if (value >= 1000000) return `${formatChartCompact(value / 1000000)}M`;
  if (value >= 1000) return `${formatChartCompact(value / 1000)}k`;
  return formatChartInteger(value);
}

function formatChartCompact(value: number): string {
  return value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, "");
}

function renderSearch(): void {
  if (!state.key) return;
  renderRecentEntries();
}

function renderInsights(): void {
  const entries = sortedEntriesAsc();
  const cutoff = addDays(todayLocal(), -29);
  const recentEntries = entries.filter((entry) => entry.date >= cutoff);
  const scopeEntries = recentEntries.length ? recentEntries : entries;
  renderLlmInsightControls();
  renderLlmInsightResult();
  els.topicTrendList.replaceChildren();

  if (!scopeEntries.length) {
    els.topicTrendScope.textContent = "No topics";
    els.topicTrendList.append(emptyInline("No standing topics yet."));
    return;
  }

  renderStandingTopicTrends(entries, scopeEntries);
}

function renderStandingTopicTrends(allEntries: DiaryEntry[], scopeEntries: DiaryEntry[]): void {
  const topics = trackedStandingTopics();
  els.topicTrendScope.textContent = scopeEntries.length === allEntries.length ? "All entries" : "Last 30 days";

  if (!topics.length) {
    els.topicTrendList.append(emptyInline("No standing topics yet."));
    return;
  }

  for (const topic of topics) {
    els.topicTrendList.append(standingTopicTrendCard(topic, allEntries, scopeEntries));
  }
}

function standingTopicTrendCard(topic: StandingTopicIdentity, allEntries: DiaryEntry[], scopeEntries: DiaryEntry[]): HTMLElement {
  const stats = standingTopicStats(topic.id, allEntries, scopeEntries);
  const card = document.createElement("div");
  card.className = "topic-trend";

  const head = document.createElement("div");
  head.className = "topic-trend-head";
  const title = document.createElement("strong");
  title.textContent = topic.title;
  const current = document.createElement("span");
  current.textContent = stats.latest ? `${stats.latest.acuteness}/10` : "-";
  head.append(title, current);

  const meta = document.createElement("div");
  meta.className = "topic-meta";
  meta.textContent = stats.observationCount
    ? `Avg ${stats.average.toFixed(1)}; peak ${stats.peak}/10; ${stats.observationCount} record${stats.observationCount === 1 ? "" : "s"}${stats.change}`
    : "No ratings in this scope.";

  const spark = document.createElement("div");
  spark.className = "topic-spark";
  const values = stats.sparkValues.length ? stats.sparkValues : [0];
  for (const value of padSparkValues(values, 12)) {
    const bar = document.createElement("span");
    bar.style.height = `${Math.max(3, value * 10)}%`;
    if (value >= 7) bar.dataset.hot = "true";
    spark.append(bar);
  }

  card.append(head, meta, spark);

  if (stats.latestComment) {
    const note = document.createElement("div");
    note.className = "latest-topic-note";
    note.textContent = `${formatDateShort(stats.latestComment.date)}: ${stats.latestComment.text}`;
    card.append(note);
  }

  if (stats.latestNextStep) {
    const next = document.createElement("div");
    next.className = "latest-topic-note";
    next.textContent = `Next: ${stats.latestNextStep}`;
    card.append(next);
  }

  return card;
}

function renderBrowseEntryDetail(): void {
  const entry = state.browseDate ? state.entries.get(state.browseDate) : undefined;
  els.browseEntryDetail.replaceChildren();

  if (!entry) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Select an entry to read it here.";
    els.browseEntryDetail.append(empty);
    return;
  }

  const record = state.records.get(entry.date);
  const head = document.createElement("div");
  head.className = "read-entry-head";
  const title = document.createElement("h2");
  title.textContent = formatDateLong(entry.date);
  const meta = document.createElement("p");
  meta.className = "subtle";
  meta.textContent = [
    entry.mood ? moodLabel(entry.mood) : "",
    record ? "Updated " + formatDateTime(record.updatedAt) : ""
  ].filter(Boolean).join(" - ") || "Saved entry";
  const actions = document.createElement("div");
  actions.className = "read-entry-actions";
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger";
  deleteButton.textContent = "Delete entry";
  deleteButton.addEventListener("click", () => void deleteBrowseEntry(entry.date));
  actions.append(deleteButton);
  head.append(title, meta, actions);

  const metrics = document.createElement("div");
  metrics.className = "read-entry-metrics";
  metrics.append(
    statBox(entry.mood ? moodLabel(entry.mood) : "-", "Mood"),
    statBox(`${entry.energy}/10`, "Energy"),
    statBox(`${entry.stress}/10`, "Stress")
  );

  els.browseEntryDetail.append(
    head,
    metrics,
    readOnlyTextBlock("Journal", entry.journalText || "No journal text saved."),
    readOnlyThemesBlock(entry.themes),
    readOnlyAnswerBlock("Reflection", reflectionAnswers(entry)),
    readOnlyAnswerBlock("Weekly Review", weeklyAnswers(entry)),
    readOnlyTopicsBlock(entry.standingTopics),
    renderLlmCacheRecordsForEntry(entry)
  );
}

async function deleteBrowseEntry(date: string): Promise<void> {
  const entry = state.entries.get(date);
  if (!entry) return;
  if (state.llmBusyAction) {
    setStatus(els.browseStatus, "Wait for the current LLM request to finish before deleting entries.", "warn");
    return;
  }
  if (!window.confirm(`Delete ${formatDateLong(date)}? This removes the encrypted entry and cached LLM analysis derived from it. This cannot be undone.`)) return;

  const saved = await flushAutoSave();
  if (!saved) {
    setStatus(els.browseStatus, "Delete cancelled because the current entry was not saved.", "error");
    return;
  }

  const session = state.unlockedSession;
  const affectedLlmRecordIds = llmRecordIdsAffectedByEntryDelete(date);

  try {
    await deleteEntryAndLlmRecords(date, affectedLlmRecordIds);
    if (state.unlockedSession !== session || !state.key) return;

    removeDeletedEntryFromState(date);
    if (state.currentDate === date) {
      state.lastSavedFingerprint = "";
      renderEntryScreen();
    }
    renderRecentEntries();
    renderInsights();
    setStatus(els.browseStatus, `Deleted entry for ${formatDateLong(date)}.`, "ok");
    resetAutoLockTimer();
  } catch (error) {
    if (state.unlockedSession === session && state.key) {
      setStatus(els.browseStatus, "Entry was not deleted: " + readableError(error), "error");
    }
  }
}

function llmRecordIdsAffectedByEntryDelete(date: string): string[] {
  const entryYear = calendarYear(date);
  const ids = [entryCapsuleRecordId(date)];
  for (const [year, summary] of state.llmYearSummaries) {
    if (year >= entryYear) ids.push(summary.id || yearSummaryRecordId(year));
  }
  return Array.from(new Set(ids));
}

function removeDeletedEntryFromState(date: string): void {
  const entryYear = calendarYear(date);
  state.records.delete(date);
  state.entries.delete(date);
  state.llmEntryCapsules.delete(date);
  state.llmEntryAdviceRuns.delete(date);
  state.llmLastRun = null;

  for (const year of Array.from(state.llmYearSummaries.keys())) {
    if (year >= entryYear) state.llmYearSummaries.delete(year);
  }

  if (state.browseDate === date) {
    state.browseDate = sortedEntriesDesc()[0]?.date || "";
  }
}

function formatDateLong(date: string): string {
  return parseLocalDate(date).toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function readOnlyTextBlock(title: string, text: string): HTMLElement {
  const block = document.createElement("section");
  block.className = "read-block";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const body = document.createElement("p");
  body.className = text ? "read-text" : "subtle";
  body.textContent = text || "None saved.";
  block.append(heading, body);
  return block;
}

function readOnlyThemesBlock(themes: string[]): HTMLElement {
  const block = document.createElement("section");
  block.className = "read-block";
  const heading = document.createElement("h3");
  heading.textContent = "Themes";
  const row = document.createElement("div");
  row.className = "chip-row";

  if (themes.length) {
    for (const theme of themes) row.append(chip(theme));
  } else {
    row.append(emptyInline("No themes saved."));
  }

  block.append(heading, row);
  return block;
}

function reflectionAnswers(entry: DiaryEntry): Array<[string, string]> {
  return Object.entries(entry.promptAnswers || {})
    .filter(([question, answer]) => !question.startsWith("Weekly review: ") && answer.trim())
    .sort(([first], [second]) => first.localeCompare(second));
}

function weeklyAnswers(entry: DiaryEntry): Array<[string, string]> {
  return Object.entries(entry.promptAnswers || {})
    .filter(([question, answer]) => question.startsWith("Weekly review: ") && answer.trim())
    .map(([question, answer]) => [question.replace(/^Weekly review: /, ""), answer] as [string, string])
    .sort(([first], [second]) => first.localeCompare(second));
}

function readOnlyAnswerBlock(title: string, answers: Array<[string, string]>): HTMLElement {
  const block = document.createElement("section");
  block.className = "read-block";
  const heading = document.createElement("h3");
  heading.textContent = title;
  block.append(heading);

  if (!answers.length) {
    block.append(emptyInline("No answers saved."));
    return block;
  }

  const list = document.createElement("div");
  list.className = "read-answer-list";
  for (const [question, answer] of answers) {
    const item = document.createElement("article");
    item.className = "read-answer";
    const label = document.createElement("strong");
    label.textContent = question;
    const text = document.createElement("p");
    text.className = "read-text";
    text.textContent = answer;
    item.append(label, text);
    list.append(item);
  }

  block.append(list);
  return block;
}

function readOnlyTopicsBlock(topics: StandingTopic[]): HTMLElement {
  const block = document.createElement("section");
  block.className = "read-block";
  const heading = document.createElement("h3");
  heading.textContent = "Standing Topics";
  block.append(heading);

  if (!topics.length) {
    block.append(emptyInline("No standing topics saved."));
    return block;
  }

  const list = document.createElement("div");
  list.className = "read-topic-list";
  for (const topic of topics) {
    const item = document.createElement("article");
    item.className = "read-topic";
    const head = document.createElement("div");
    head.className = "read-topic-head";
    const title = document.createElement("strong");
    title.textContent = topic.title;
    const meta = document.createElement("span");
    const direction = topic.direction ? topicDirectionLabel(topic.direction) : "";
    meta.textContent = `${topic.acuteness}/10${direction ? " - " + direction : ""}`;
    head.append(title, meta);
    item.append(head);

    if (topic.comment) {
      const comment = document.createElement("p");
      comment.className = "read-text";
      comment.textContent = topic.comment;
      item.append(comment);
    }

    if (topic.nextStep) {
      const next = document.createElement("p");
      next.className = "topic-meta";
      next.textContent = "Next: " + topic.nextStep;
      item.append(next);
    }

    list.append(item);
  }

  block.append(list);
  return block;
}

function topicDirectionLabel(value: TopicDirection): string {
  return TOPIC_DIRECTIONS.find((item) => item.value === value)?.label || "";
}

function formatBrowseEntryDate(date: string): string {
  const entryDate = parseLocalDate(date);
  const currentYear = parseLocalDate(todayLocal()).getFullYear();
  const options: Intl.DateTimeFormatOptions = entryDate.getFullYear() === currentYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return entryDate.toLocaleDateString([], options);
}

function entryButton(entry: DiaryEntry, mode: "write" | "browse" = "write"): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "entry-item";
  if (entry.date === (mode === "browse" ? state.browseDate : state.currentDate)) button.classList.add("active");
  const title = document.createElement("strong");
  const entryDate = mode === "browse" ? formatBrowseEntryDate(entry.date) : formatDateShort(entry.date);
  title.textContent = `${entryDate}${entry.mood ? " - " + moodLabel(entry.mood) : ""}`;
  const excerpt = document.createElement("span");
  excerpt.textContent = entryExcerpt(entry);
  button.append(title, excerpt);
  button.addEventListener("click", async () => {
    if (mode === "browse") {
      state.browseDate = entry.date;
      renderRecentEntries();
      resetAutoLockTimer();
      return;
    }

    const saved = await flushAutoSave();
    if (!saved) return;
    state.currentDate = entry.date;
    state.promptShift = 0;
    renderAll();
    activateTab("write");
    resetAutoLockTimer();
  });
  return button;
}

function statBox(value: string, label: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "stat";
  const strong = document.createElement("strong");
  strong.textContent = value;
  const span = document.createElement("span");
  span.textContent = label;
  box.append(strong, span);
  return box;
}

function chip(text: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "chip";
  span.textContent = text;
  return span;
}

function emptyInline(text: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "subtle";
  span.textContent = text;
  return span;
}
