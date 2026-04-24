type MoodValue = (typeof MOODS)[number]["value"] | "";
type TopicDirection = (typeof TOPIC_DIRECTIONS)[number]["value"];
type AppTab = (typeof TABS)[number];
type UiThemeValue = (typeof UI_THEMES)[number]["value"];
type UiFontValue = (typeof UI_FONTS)[number]["value"];
type LlmInsightScope = (typeof LLM_INSIGHT_SCOPES)[number]["value"];
type LlmBusyAction = "" | "settings" | "entry-advice" | "entries" | "years" | "insight" | "delete-cache";
type LlmCacheRecordKind = "entry-capsule" | "year-summary" | "run-log";
type LlmCacheRecordMode = "editable" | "readonly";
type StatusTone = "" | "ok" | "warn" | "error";
type JsonRecord = Record<string, unknown>;

interface EncryptedPart {
  encryptedData: string;
  iv: string;
}

interface VaultMeta {
  version: 1;
  createdAt: string;
  updatedAt: string;
  salt: string;
  kdf: {
    name: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
  };
  cipher: {
    name: "AES-GCM";
    length: 256;
  };
  verifier: EncryptedPart;
  autoLockMinutes: number;
}

interface EntryRecord {
  id: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  encryptedData: string;
  iv: string;
}

interface LlmEncryptedRecord {
  id: string;
  kind: "settings" | "entry-capsule" | "year-summary" | "run-log";
  createdAt: string;
  updatedAt: string;
  encryptedData: string;
  iv: string;
}

interface StandingTopic {
  id: string;
  title: string;
  acuteness: number;
  direction: TopicDirection;
  comment: string;
  nextStep: string;
  active: boolean;
}

interface StandingTopicIdentity {
  id: string;
  title: string;
}

interface DiaryEntry {
  date: string;
  mood: MoodValue;
  energy: number;
  stress: number;
  journalText: string;
  promptAnswers: Record<string, string>;
  themes: string[];
  standingTopics: StandingTopic[];
}

interface PrivateDiaryBackup {
  app: typeof APP_ID;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  exportedAt: string;
  vault: VaultMeta;
  entries: EntryRecord[];
}

interface StandardNotesReference {
  uuid?: string;
}

interface StandardNotesContent extends JsonRecord {
  title?: unknown;
  text?: unknown;
  preview_plain?: unknown;
  references?: unknown;
  appData?: {
    "org.standardnotes.sn"?: {
      client_updated_at?: unknown;
    };
  };
}

interface StandardNotesItem extends JsonRecord {
  uuid?: string;
  content_type?: string;
  deleted?: boolean;
  content?: StandardNotesContent;
  created_at?: unknown;
  updated_at?: unknown;
}

interface StandardNotesGroup {
  date: string;
  noteTexts: string[];
  themes: Set<string>;
  sourceCreatedAt: string;
  sourceUpdatedAt: string;
  sourceNoteCount: number;
}

interface StandardNotesImportedEntry extends DiaryEntry {
  sourceCreatedAt: string;
  sourceUpdatedAt: string;
  sourceNoteCount: number;
}

interface StandardNotesImportPlan {
  entries: StandardNotesImportedEntry[];
  noteCount: number;
  skipped: number;
}

interface TopicObservation {
  date: string;
  title: string;
  acuteness: number;
  direction: TopicDirection;
  comment: string;
  nextStep: string;
}

interface StandingTopicStats {
  latest: TopicObservation | null;
  latestComment: { date: string; text: string } | null;
  latestNextStep: string;
  observationCount: number;
  average: number;
  peak: number;
  change: string;
  sparkValues: number[];
}

interface LlmPromptEntry {
  date: string;
  mood: string;
  energy: number;
  stress: number;
  themes: string[];
  journal: string;
  reflections: Array<{ prompt: string; answer: string }>;
  standingTopics: Array<{
    title: string;
    acuteness: number;
    direction: string;
    comment: string;
    nextStep: string;
  }>;
}

interface LlmSettings {
  apiKey: string;
  model: string;
  responseLanguage: string;
  prompts: LlmPromptSettings;
}

interface LlmPromptSettings {
  entryAdviceSystem: string;
  entryAdviceUser: string;
  entryCapsuleSystem: string;
  entryCapsuleUser: string;
  yearSummarySystem: string;
  yearSummaryUser: string;
  finalInsightSystem: string;
  finalInsightUser: string;
}

interface LlmModelPricing {
  model: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  fetchedAt: string;
}

interface LlmCredits {
  totalCredits: number;
  totalUsage: number;
  balance: number;
  fetchedAt: string;
}

interface LlmRequestBundle {
  promptText: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
}

interface LlmInsightItem {
  title: string;
  detail: string;
  evidence: string[];
}

interface LlmInsightReport {
  summary: string;
  patterns: LlmInsightItem[];
  pressurePoints: LlmInsightItem[];
  standingTopics: LlmInsightItem[];
  nextActions: string[];
  questions: string[];
}

interface LlmEntryCapsule {
  schemaVersion: number;
  id: string;
  date: string;
  entryFingerprint: string;
  promptFingerprint: string;
  model: string;
  responseLanguage: string;
  generatedAt: string;
  summary: string;
  themes: string[];
  emotionalPattern: string;
  standingTopics: LlmInsightItem[];
  unresolved: string[];
  nextActions: string[];
  questions: string[];
  rawText: string;
}

interface LlmYearSummary {
  schemaVersion: number;
  id: string;
  year: string;
  promptFingerprint: string;
  model: string;
  responseLanguage: string;
  generatedAt: string;
  sourceFingerprint: string;
  previousYearSourceFingerprint: string;
  entryCount: number;
  report: LlmInsightReport;
  rawText: string;
}

interface LlmRunLog {
  schemaVersion: number;
  kind: "entry-cache" | "year-summary" | "final-insight";
  generatedAt: string;
  model: string;
  responseLanguage: string;
  scopeLabel: string;
  cost: LlmCostReport;
}

interface LlmCacheStatus {
  selectedEntryCount: number;
  validEntryCount: number;
  staleEntryCount: number;
  missingEntryCount: number;
  currentYearEntryCount: number;
  validPastYearCount: number;
  stalePastYearCount: number;
  missingPastYearCount: number;
  processEntryCost: number;
  processYearCost: number;
  insightCost: number;
  pricingAvailable: boolean;
  canGenerateInsight: boolean;
}

interface LlmCostReport {
  projectedCost: number;
  actualCost: number | null;
  actualCostSource: "usage" | "generation" | "partial" | "";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
}

interface LlmInsightRunResult {
  generatedAt: string;
  model: string;
  responseLanguage: string;
  scopeLabel: string;
  selectedEntryCount: number;
  cacheSummary: string;
  report: LlmInsightReport | null;
  rawText: string;
  cost: LlmCostReport;
}

interface LlmEntryAdviceRunResult {
  generatedAt: string;
  date: string;
  entryFingerprint: string;
  promptFingerprint: string;
  model: string;
  responseLanguage: string;
  rawText: string;
  cost: LlmCostReport;
}

interface OpenRouterUsage {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  total_tokens?: unknown;
  cost?: unknown;
}

interface OpenRouterChatResponse {
  id?: unknown;
  model?: unknown;
  choices?: unknown;
  usage?: OpenRouterUsage;
  error?: unknown;
}

interface OpenRouterGenerationResponse {
  data?: unknown;
  error?: unknown;
}

interface OpenRouterModelsResponse {
  data?: unknown;
  error?: unknown;
}

interface UiPreferences {
  theme: UiThemeValue;
  font: UiFontValue;
  uiMaxWidth: number;
}

interface AppState {
  db: IDBDatabase | null;
  vault: VaultMeta | null;
  key: CryptoKey | null;
  entries: Map<string, DiaryEntry>;
  records: Map<string, EntryRecord>;
  currentDate: string;
  promptShift: number;
  lockTimer: number | undefined;
  hiddenAt: number;
  activityThrottleAt: number;
  busy: boolean;
  autoSaveTimer: number | undefined;
  savePromise: Promise<boolean> | null;
  saveQueued: boolean;
  lastSavedFingerprint: string;
  unlockedSession: number;
  activeTab: AppTab;
  browseDate: string;
  browseYearFilter: string;
  uiTheme: UiThemeValue;
  uiFont: UiFontValue;
  uiMaxWidth: number;
  remoteRequestsInFlight: number;
  llmScope: LlmInsightScope;
  llmSettings: LlmSettings;
  llmPricing: LlmModelPricing | null;
  llmCredits: LlmCredits | null;
  llmEntryCapsules: Map<string, LlmEntryCapsule>;
  llmYearSummaries: Map<string, LlmYearSummary>;
  llmRunLogs: Map<string, LlmRunLog>;
  llmCacheBrowserOpen: boolean;
  llmBusyAction: LlmBusyAction;
  llmLastRun: LlmInsightRunResult | null;
  llmEntryAdviceRuns: Map<string, LlmEntryAdviceRunResult>;
}

interface AppElements {
  lockedView: HTMLElement;
  unlockedView: HTMLElement;
  vaultState: HTMLElement;
  lockTitle: HTMLElement;
  authForm: HTMLFormElement;
  passwordInput: HTMLInputElement;
  confirmPasswordWrap: HTMLElement;
  confirmPasswordInput: HTMLInputElement;
  authButton: HTMLButtonElement;
  authStatus: HTMLElement;
  lockedImportButton: HTMLButtonElement;
  unlockedImportButton: HTMLButtonElement;
  backupFileInput: HTMLInputElement;
  remoteActivity: HTMLElement;
  unlockSummary: HTMLElement;
  autoLockSelect: HTMLSelectElement;
  lockButton: HTMLButtonElement;
  entryCount: HTMLElement;
  browseEntriesByYearChart: HTMLElement;
  browseLengthByYearChart: HTMLElement;
  recentEntries: HTMLElement;
  searchInput: HTMLInputElement;
  browseEntryDetail: HTMLElement;
  browseStatus: HTMLElement;
  newEntryButton: HTMLButtonElement;
  exportButton: HTMLButtonElement;
  backupStatus: HTMLElement;
  entryForm: HTMLFormElement;
  entryDate: HTMLInputElement;
  moodSelect: HTMLSelectElement;
  moodPills: HTMLElement;
  energyInput: HTMLInputElement;
  energyValue: HTMLElement;
  energyScale: HTMLElement;
  stressInput: HTMLInputElement;
  stressValue: HTMLElement;
  stressScale: HTMLElement;
  journalText: HTMLTextAreaElement;
  themesInput: HTMLInputElement;
  topicTitleInput: HTMLInputElement;
  addTopicButton: HTMLButtonElement;
  topicCount: HTMLElement;
  topicList: HTMLElement;
  rotatePromptsButton: HTMLButtonElement;
  promptList: HTMLElement;
  weekRange: HTMLElement;
  weekSummary: HTMLElement;
  weeklyQuestions: HTMLElement;
  entryStatus: HTMLElement;
  entrySavedState: HTMLElement;
  entryAdviceButton: HTMLButtonElement;
  entryAdviceEstimate: HTMLElement;
  entryAdviceStatus: HTMLElement;
  entryAdviceResult: HTMLElement;
  topicTrendScope: HTMLElement;
  topicTrendList: HTMLElement;
  llmRuntimeLabel: HTMLElement;
  llmScopeSelect: HTMLSelectElement;
  llmEntryCacheButton: HTMLButtonElement;
  llmYearCacheButton: HTMLButtonElement;
  llmGenerateButton: HTMLButtonElement;
  llmEstimate: HTMLElement;
  llmCacheStatus: HTMLElement;
  llmCacheBrowser: HTMLElement;
  llmCostReport: HTMLElement;
  llmStatus: HTMLElement;
  llmResult: HTMLElement;
  llmApiKeyInput: HTMLInputElement;
  llmModelInput: HTMLInputElement;
  llmResponseLanguageInput: HTMLInputElement;
  llmEntryAdviceSystemPrompt: HTMLTextAreaElement;
  llmEntryAdviceUserPrompt: HTMLTextAreaElement;
  llmEntryCacheSystemPrompt: HTMLTextAreaElement;
  llmEntryCacheUserPrompt: HTMLTextAreaElement;
  llmYearSummarySystemPrompt: HTMLTextAreaElement;
  llmYearSummaryUserPrompt: HTMLTextAreaElement;
  llmFinalInsightSystemPrompt: HTMLTextAreaElement;
  llmFinalInsightUserPrompt: HTMLTextAreaElement;
  llmResetPromptsButton: HTMLButtonElement;
  llmPricingStatus: HTMLElement;
  llmSaveSettingsButton: HTMLButtonElement;
  llmForgetKeyButton: HTMLButtonElement;
  llmSettingsStatus: HTMLElement;
  themeSelect: HTMLSelectElement;
  fontSelect: HTMLSelectElement;
  uiWidthInput: HTMLInputElement;
}

type ElementConstructor<T extends Element> = { new (): T };

const elementTypes = {
  lockedView: HTMLElement,
  unlockedView: HTMLElement,
  vaultState: HTMLElement,
  lockTitle: HTMLElement,
  authForm: HTMLFormElement,
  passwordInput: HTMLInputElement,
  confirmPasswordWrap: HTMLElement,
  confirmPasswordInput: HTMLInputElement,
  authButton: HTMLButtonElement,
  authStatus: HTMLElement,
  lockedImportButton: HTMLButtonElement,
  unlockedImportButton: HTMLButtonElement,
  backupFileInput: HTMLInputElement,
  remoteActivity: HTMLElement,
  unlockSummary: HTMLElement,
  autoLockSelect: HTMLSelectElement,
  lockButton: HTMLButtonElement,
  entryCount: HTMLElement,
  browseEntriesByYearChart: HTMLElement,
  browseLengthByYearChart: HTMLElement,
  recentEntries: HTMLElement,
  searchInput: HTMLInputElement,
  browseEntryDetail: HTMLElement,
  browseStatus: HTMLElement,
  newEntryButton: HTMLButtonElement,
  exportButton: HTMLButtonElement,
  backupStatus: HTMLElement,
  entryForm: HTMLFormElement,
  entryDate: HTMLInputElement,
  moodSelect: HTMLSelectElement,
  moodPills: HTMLElement,
  energyInput: HTMLInputElement,
  energyValue: HTMLElement,
  energyScale: HTMLElement,
  stressInput: HTMLInputElement,
  stressValue: HTMLElement,
  stressScale: HTMLElement,
  journalText: HTMLTextAreaElement,
  themesInput: HTMLInputElement,
  topicTitleInput: HTMLInputElement,
  addTopicButton: HTMLButtonElement,
  topicCount: HTMLElement,
  topicList: HTMLElement,
  rotatePromptsButton: HTMLButtonElement,
  promptList: HTMLElement,
  weekRange: HTMLElement,
  weekSummary: HTMLElement,
  weeklyQuestions: HTMLElement,
  entryStatus: HTMLElement,
  entrySavedState: HTMLElement,
  entryAdviceButton: HTMLButtonElement,
  entryAdviceEstimate: HTMLElement,
  entryAdviceStatus: HTMLElement,
  entryAdviceResult: HTMLElement,
  topicTrendScope: HTMLElement,
  topicTrendList: HTMLElement,
  llmRuntimeLabel: HTMLElement,
  llmScopeSelect: HTMLSelectElement,
  llmEntryCacheButton: HTMLButtonElement,
  llmYearCacheButton: HTMLButtonElement,
  llmGenerateButton: HTMLButtonElement,
  llmEstimate: HTMLElement,
  llmCacheStatus: HTMLElement,
  llmCacheBrowser: HTMLElement,
  llmCostReport: HTMLElement,
  llmStatus: HTMLElement,
  llmResult: HTMLElement,
  llmApiKeyInput: HTMLInputElement,
  llmModelInput: HTMLInputElement,
  llmResponseLanguageInput: HTMLInputElement,
  llmEntryAdviceSystemPrompt: HTMLTextAreaElement,
  llmEntryAdviceUserPrompt: HTMLTextAreaElement,
  llmEntryCacheSystemPrompt: HTMLTextAreaElement,
  llmEntryCacheUserPrompt: HTMLTextAreaElement,
  llmYearSummarySystemPrompt: HTMLTextAreaElement,
  llmYearSummaryUserPrompt: HTMLTextAreaElement,
  llmFinalInsightSystemPrompt: HTMLTextAreaElement,
  llmFinalInsightUserPrompt: HTMLTextAreaElement,
  llmResetPromptsButton: HTMLButtonElement,
  llmPricingStatus: HTMLElement,
  llmSaveSettingsButton: HTMLButtonElement,
  llmForgetKeyButton: HTMLButtonElement,
  llmSettingsStatus: HTMLElement,
  themeSelect: HTMLSelectElement,
  fontSelect: HTMLSelectElement,
  uiWidthInput: HTMLInputElement
} satisfies { [K in keyof AppElements]: ElementConstructor<AppElements[K]> };
