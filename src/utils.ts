function requireDb(): IDBDatabase {
  if (!state.db) throw new Error("The local database is not open.");
  return state.db;
}

function requireKey(): CryptoKey {
  if (!state.key) throw new Error("The vault is locked.");
  return state.key;
}

function normalizeMoodValue(value: unknown): MoodValue {
  return MOODS.some((mood) => mood.value === value) ? value as MoodValue : "";
}

function normalizeDirectionValue(value: unknown): TopicDirection {
  return TOPIC_DIRECTIONS.some((item) => item.value === value) ? value as TopicDirection : "";
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStandardNotesReference(value: unknown): value is StandardNotesReference & { uuid: string } {
  return isRecord(value) && typeof value.uuid === "string";
}

function requireStringProperty(record: JsonRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value) throw new Error(`${label} is missing.`);
  return value;
}

function setStatus(element: HTMLElement, message: string, tone: StatusTone): void {
  element.classList.remove("busy-status");
  element.textContent = message || "";
  if (tone) element.dataset.tone = tone;
  else delete element.dataset.tone;
}

function readableError(error: unknown): string {
  if (!error) return "Unknown error.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return "Unknown error.";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function isFiniteNumber(value: unknown): value is number {
  return Number.isFinite(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && toIsoDate(parseLocalDate(value)) === value;
}

function todayLocal(): string {
  return toIsoDate(new Date());
}

function parseLocalDate(value: string): Date {
  const [year = NaN, month = NaN, day = NaN] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date): string {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

function addDays(date: string, amount: number): string {
  const parsed = parseLocalDate(date);
  parsed.setDate(parsed.getDate() + amount);
  return toIsoDate(parsed);
}

function formatDateShort(date: string): string {
  return parseLocalDate(date).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
