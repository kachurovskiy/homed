function normalizeEntry(entry: unknown): DiaryEntry {
  const source = isRecord(entry) ? entry : {};
  return {
    date: isIsoDate(source.date) ? source.date : todayLocal(),
    mood: normalizeMoodValue(source.mood),
    energy: clampNumber(source.energy, 1, 10, 5),
    stress: clampNumber(source.stress, 1, 10, 5),
    journalText: typeof source.journalText === "string" ? source.journalText : "",
    promptAnswers: normalizePromptAnswers(source.promptAnswers),
    themes: Array.isArray(source.themes) ? source.themes.filter((item): item is string => typeof item === "string") : [],
    standingTopics: normalizeStandingTopics(source.standingTopics)
  };
}

function normalizePromptAnswers(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const answers: Record<string, string> = {};
  for (const [key, answer] of Object.entries(value)) {
    if (typeof answer === "string") answers[key] = answer;
  }
  return answers;
}

function parseThemes(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeStandingTopics(value: unknown): StandingTopic[] {
  if (!Array.isArray(value)) return [];
  const topics: StandingTopic[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const topic = normalizeStandingTopic(item);
    if (!topic || seen.has(topic.id)) continue;
    seen.add(topic.id);
    topics.push(topic);
  }

  return topics.slice(0, 40);
}

function normalizeStandingTopic(value: unknown): StandingTopic | null {
  if (!isRecord(value)) return null;
  const title = normalizeTopicTitle(value.title);
  let id = normalizeTopicId(value.id);
  if (!id) id = normalizeTopicId(topicIdForTitle(title));
  if (!title || !id) return null;
  const direction = normalizeDirectionValue(value.direction);
  return {
    id,
    title,
    acuteness: clampNumber(value.acuteness, 0, 10, 0),
    direction,
    comment: cleanEntryText(value.comment, 1200),
    nextStep: cleanEntryText(value.nextStep, 180),
    active: value.active !== false
  };
}

function trackedStandingTopics(): StandingTopicIdentity[] {
  const byId = new Map<string, StandingTopicIdentity>();
  for (const entry of sortedEntriesAsc()) {
    for (const topic of entry.standingTopics || []) {
      if (!topic.active) {
        byId.delete(topic.id);
        continue;
      }
      byId.set(topic.id, { id: topic.id, title: topic.title });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.title.localeCompare(b.title));
}

function standingTopicMap(entry: DiaryEntry | undefined): Map<string, StandingTopic> {
  const map = new Map<string, StandingTopic>();
  for (const topic of entry?.standingTopics || []) {
    map.set(topic.id, topic);
  }
  return map;
}

function normalizeTopicTitle(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

function topicIdForTitle(title: string): string {
  const normalized = normalizeTopicTitle(title).toLowerCase();
  const slug = normalized
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || `topic-${hashText(normalized)}`;
}

function normalizeTopicId(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) : "";
}

function hashText(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function cleanEntryText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, limit);
}

function promptsForDate(date: string, shift: number): string[] {
  const dateObj = parseLocalDate(date);
  const yearStart = new Date(dateObj.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((dateObj.getTime() - yearStart.getTime()) / DAY_MS);
  const start = (dayOfYear * 3 + shift) % REFLECTION_PROMPTS.length;
  return [0, 1, 2, 3].map((offset) => REFLECTION_PROMPTS[(start + offset) % REFLECTION_PROMPTS.length] ?? "");
}

function sortedEntriesAsc(): DiaryEntry[] {
  return Array.from(state.entries.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function sortedEntriesDesc(): DiaryEntry[] {
  return Array.from(state.entries.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function entrySearchText(entry: DiaryEntry): string {
  return [
    entry.date,
    moodLabel(entry.mood),
    entry.journalText,
    ...(entry.themes || []),
    ...(entry.standingTopics || []).flatMap((topic) => [topic.title, topic.direction, topic.comment, topic.nextStep]),
    ...Object.keys(entry.promptAnswers || {}),
    ...Object.values(entry.promptAnswers || {})
  ].join(" ").toLowerCase();
}

function entryExcerpt(entry: DiaryEntry): string {
  const text = [
    entry.journalText,
    ...(entry.standingTopics || []).flatMap((topic) => [topic.comment, topic.nextStep]),
    ...Object.values(entry.promptAnswers || {})
  ].join(" ").replace(/\s+/g, " ").trim();
  if (!text) return "No text saved.";
  return text.length > 92 ? text.slice(0, 89) + "..." : text;
}
