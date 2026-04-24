function standingTopicCardSummary(topicId: string): string {
  const stats = standingTopicStats(topicId, sortedEntriesAsc(), sortedEntriesAsc());
  if (!stats.observationCount) return "No history yet.";
  const last = stats.latest ? `last ${stats.latest.acuteness}/10 on ${formatDateShort(stats.latest.date)}` : "no rating yet";
  return `${last}; average ${stats.average.toFixed(1)}, peak ${stats.peak}/10.`;
}

function standingTopicStats(topicId: string, allEntries: DiaryEntry[], scopeEntries: DiaryEntry[]): StandingTopicStats {
  const allObservations = topicObservations(topicId, allEntries);
  const scopedObservations = topicObservations(topicId, scopeEntries);
  const latest = allObservations.at(-1) || null;
  const previous = allObservations.length > 1 ? allObservations.at(-2) : null;
  const values = scopedObservations.map((item) => item.acuteness);
  const averageValue = average(values);
  const latestComment = Array.from(allObservations).reverse().find((item) => item.comment);
  const latestNextStep = Array.from(allObservations).reverse().find((item) => item.nextStep)?.nextStep || "";
  let change = "";

  if (latest && previous) {
    const delta = latest.acuteness - previous.acuteness;
    if (delta > 0) change = `; up ${delta}`;
    else if (delta < 0) change = `; down ${Math.abs(delta)}`;
    else change = "; flat";
  }

  return {
    latest,
    latestComment: latestComment ? { date: latestComment.date, text: latestComment.comment } : null,
    latestNextStep,
    observationCount: scopedObservations.length,
    average: averageValue,
    peak: values.length ? Math.max(...values) : 0,
    change,
    sparkValues: allObservations.slice(-12).map((item) => item.acuteness)
  };
}

function topicObservations(topicId: string, entries: DiaryEntry[]): TopicObservation[] {
  const observations: TopicObservation[] = [];
  for (const entry of entries) {
    const topic = (entry.standingTopics || []).find((item) => item.id === topicId && item.active !== false);
    if (!topic) continue;
    observations.push({
      date: entry.date,
      title: topic.title,
      acuteness: clampNumber(topic.acuteness, 0, 10, 0),
      direction: topic.direction || "",
      comment: topic.comment || "",
      nextStep: topic.nextStep || ""
    });
  }
  return observations;
}

function padSparkValues(values: number[], length: number): number[] {
  if (values.length >= length) return values.slice(-length);
  return Array.from({ length: length - values.length }, () => 0).concat(values);
}

function weeklyMoodLine(entries: DiaryEntry[]): string {
  const energy = average(entries.map((entry) => Number(entry.energy)).filter(isFiniteNumber));
  const stress = average(entries.map((entry) => Number(entry.stress)).filter(isFiniteNumber));
  const moodAverage = average(entries.map((entry) => moodScore(entry.mood)).filter(isFiniteNumber));
  const parts: string[] = [];
  if (moodAverage) parts.push(`average mood ${moodLabelForScore(moodAverage).toLowerCase()}`);
  if (energy) parts.push(`energy ${energy.toFixed(1)}`);
  if (stress) parts.push(`stress ${stress.toFixed(1)}`);
  return parts.length ? parts.join(", ") + "." : "Not enough ratings for a weekly pattern yet.";
}

function moodLabel(value: string): string {
  return MOODS.find((mood) => mood.value === value)?.label || "";
}

function moodScore(value: string): number | undefined {
  return MOODS.find((mood) => mood.value === value)?.score;
}

function moodLabelForScore(score: number): string {
  const firstMood = MOODS[0];
  if (!firstMood) return "";
  let closest: (typeof MOODS)[number] = firstMood;
  for (const mood of MOODS) {
    if (Math.abs(mood.score - score) < Math.abs(closest.score - score)) {
      closest = mood;
    }
  }
  return closest.label;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getWeekRange(date: string): { start: string; end: string } {
  const day = parseLocalDate(date);
  const dayOfWeek = day.getDay() || 7;
  const start = new Date(day);
  start.setDate(day.getDate() - dayOfWeek + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: toIsoDate(start),
    end: toIsoDate(end)
  };
}

function weeklyAnswerKey(question: string): string {
  return "Weekly review: " + question;
}

function getAutoLockMinutes(): number {
  return clampNumber(state.vault?.autoLockMinutes, 1, 120, 10);
}

function getIterations(vault: VaultMeta): number {
  const iterations = vault?.kdf?.iterations;
  if (!Number.isInteger(iterations) || iterations < 100000) {
    throw new Error("The vault has unsupported PBKDF2 settings.");
  }
  return iterations;
}
