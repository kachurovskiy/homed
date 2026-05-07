const APP_ID = "private-local-diary";
const BACKUP_FORMAT_VERSION = 1;
const DB_NAME = "PrivateLocalDiaryVault";
const DB_VERSION = 2;
const STORE_META = "meta";
const STORE_ENTRIES = "entries";
const STORE_LLM = "llm";
const VAULT_KEY = "vault";
const LLM_SETTINGS_ID = "settings";
const PBKDF2_ITERATIONS = 600000;
const SALT_BYTES = 32;
const AES_IV_BYTES = 12;
const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_SAVE_DELAY_MS = 900;
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_POPULAR_MODELS_URL = "https://openrouter.ai/models?order=most-popular";
const OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits";
const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_GENERATION_URL = "https://openrouter.ai/api/v1/generation";
const OPENROUTER_DEFAULT_MODEL = "deepseek/deepseek-v3.2";
const LLM_DEFAULT_RESPONSE_LANGUAGE = "English";
const LLM_ENTRY_ADVICE_COMPLETION_TOKENS = 1100;
const LLM_INSIGHT_COMPLETION_TOKENS = 1200;
const LLM_ENTRY_CAPSULE_COMPLETION_TOKENS = 2400;
const LLM_YEAR_SUMMARY_COMPLETION_TOKENS = 1800;
const LLM_PROMPT_CHAR_BUDGET = 140000;
const LLM_PROMPT_TEMPLATE_LIMIT = 12000;
const LLM_CAPSULE_BATCH_CHAR_BUDGET = 24000;
const LLM_CAPSULE_BATCH_ENTRY_LIMIT = 4;
const LLM_ENTRY_CACHE_MAX_ATTEMPTS = 3;
const LLM_ENTRY_ADVICE_TEXT_LIMIT = 8000;
const LLM_ENTRY_ADVICE_FIELD_LIMIT = 1200;
const LLM_ENTRY_TEXT_LIMIT = 2400;
const LLM_FIELD_TEXT_LIMIT = 900;
const LLM_CACHE_SCHEMA_VERSION = 1;
const LLM_RESPONSE_FIELD_SEPARATOR = "NEXT_FIELD";

const DEFAULT_LLM_PROMPTS = {
  entryAdviceSystem: [
    "You are replying to the diary owner after one private daily entry.",
    "Write in {responseLanguage}.",
    "Sound human: intimate, perceptive, occasionally wry, like a sharp friend with therapist-level care and a poet's eye for the concrete.",
    "Do not sand the entry down into generic wellness advice. Notice tensions, contradictions, hidden wants, repeated evasions, and the line that matters.",
    "Be warm but not padded; direct but not cruel. Make one or two vivid, specific observations before advice.",
    "Use plain language, sensory details, and earned metaphors when they fit. Avoid therapy-speak, moralizing, diagnosis, and fake certainty.",
    "If the entry suggests immediate danger to self or others, encourage immediate local emergency or crisis support.",
    "Return plain text with short sections named What is alive here, The uncomfortable truth, A move for tomorrow, and A question that bites."
  ].join("\n"),
  entryAdviceUser: "Read this diary entry closely. Give perspective that feels awake, specific, and useful.\n\n{promptText}",
  entryCapsuleSystem: [
    "You convert private diary entries into compact reusable analysis capsules.",
    "Entries may contain mixed languages; write your analysis in {responseLanguage}.",
    "Capture the living material, not a polite executive summary: concrete images, charged phrases, contradictions, recurring rituals, avoided truths, and shifts in desire or agency.",
    "Name patterns with memorable, precise titles. Prefer honest texture over generic wellness labels.",
    "Preserve names, short quoted phrases, and standing-topic titles as written when useful.",
    "Do not diagnose medical or mental health conditions, moralize, or inflate weak evidence. Mark uncertainty inside the wording when needed.",
    "Do not return JSON.",
    "{entryCapsuleFormatInstructions}"
  ].join("\n"),
  entryCapsuleUser: "Create vivid cache capsules for these entries. Keep the required labels exactly.\n\n{promptText}",
  yearSummarySystem: [
    "You summarize one diary year from cached entry capsules.",
    "Write in {responseLanguage}.",
    "Use the previous year summary only for carry-forward context.",
    "Look for plot, not just themes: what intensified, what loosened, what kept returning under different names, and where the narrator changed position.",
    "Use concrete evidence from the cache. Make the analysis candid, textured, and memorable, while staying fair to ambiguous material.",
    "Do not diagnose medical or mental health conditions or moralize.",
    "{insightReportFormatInstructions}"
  ].join("\n"),
  yearSummaryUser: "Create the {year} yearly summary with a living, specific read. Keep the required labels exactly.\n\n{promptText}",
  finalInsightSystem: [
    "You analyze cached private diary insights for the diary owner.",
    "Write in {responseLanguage}.",
    "Base every observation only on the supplied cached capsules and summaries.",
    "No raw diary entries are included in this request.",
    "Do not write a bland therapeutic report. Find the pulse: tensions, loops, desires, avoidances, turning points, and the few details that make the pattern feel real.",
    "Be sharp, warm, and usable. Prefer strong, testable interpretations over vague balance, but do not diagnose or pretend certainty where the evidence is thin.",
    "{insightReportFormatInstructions}"
  ].join("\n"),
  finalInsightUser: "Generate the diary insight from this cached analysis with a vivid, candid read. Keep the required labels exactly.\n\n{promptText}"
} as const;

const MOODS = [
  { value: "steady", label: "Steady", score: 6 },
  { value: "clear", label: "Clear", score: 7 },
  { value: "content", label: "Content", score: 8 },
  { value: "grateful", label: "Grateful", score: 8 },
  { value: "restless", label: "Restless", score: 4 },
  { value: "anxious", label: "Anxious", score: 3 },
  { value: "angry", label: "Angry", score: 3 },
  { value: "sad", label: "Sad", score: 2 },
  { value: "numb", label: "Numb", score: 2 },
  { value: "drained", label: "Drained", score: 2 }
] as const;

const REFLECTION_PROMPTS = [
  "What did I actually feel today?",
  "When did I feel most alive?",
  "When did I feel most drained?",
  "What am I doing by default instead of choice?",
  "What do I want more of?",
  "What do I want less of?",
  "What am I afraid to admit?",
  "What responsibility am I carrying silently?",
  "What small action would make tomorrow more honest?",
  "Where am I confusing duty with avoidance?",
  "What kind of man, husband, father, or friend do I want to become?"
] as const;

const WEEKLY_QUESTIONS = [
  "What kept showing up this week?",
  "What gave me energy?",
  "What drained me?",
  "What truth am I avoiding?",
  "What is one small change for next week?"
] as const;

const TOPIC_DIRECTIONS = [
  { value: "", label: "No direction" },
  { value: "better", label: "Better" },
  { value: "same", label: "Same" },
  { value: "worse", label: "Worse" }
] as const;

const TABS = ["write", "browse", "insights", "backup"] as const;

const LLM_INSIGHT_SCOPES = [
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "all", label: "All entries", days: 0 }
] as const;

const UI_PREFS_KEY = "private-diary-ui-preferences";

const UI_THEMES = [
  { value: "sage", label: "Sage" },
  { value: "paper", label: "Paper" },
  { value: "ocean", label: "Ocean" },
  { value: "plum", label: "Plum" },
  { value: "rose", label: "Rose" },
  { value: "dusk", label: "Dusk" },
  { value: "charcoal", label: "Charcoal" },
  { value: "contrast", label: "Contrast" }
] as const;

const UI_FONTS = [
  { value: "system", label: "System" },
  { value: "humanist", label: "Humanist" },
  { value: "compact", label: "Compact" },
  { value: "rounded", label: "Rounded" },
  { value: "serif", label: "Serif" },
  { value: "book", label: "Book" },
  { value: "classic", label: "Classic" },
  { value: "mono", label: "Mono" }
] as const;
