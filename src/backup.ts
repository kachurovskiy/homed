async function exportBackup(): Promise<void> {
  try {
    setStatus(els.backupStatus, "Preparing encrypted backup...", "warn");
    const vault = await getVaultMeta();
    const entries = await getAllEntryRecords();
    if (!vault) throw new Error("No vault exists.");

    const backup: PrivateDiaryBackup = {
      app: APP_ID,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      vault,
      entries: entries.sort((a, b) => a.date.localeCompare(b.date))
    };

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `private-diary-encrypted-backup-${todayLocal()}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(els.backupStatus, "Encrypted backup exported.", "ok");
  } catch (error) {
    setStatus(els.backupStatus, "Export failed: " + readableError(error), "error");
  }
}

async function onBackupFileSelected(event: Event): Promise<void> {
  if (!(event.target instanceof HTMLInputElement)) return;
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;

  try {
    const text = await file.text();
    const parsed: unknown = JSON.parse(text);
    if (isPrivateDiaryBackup(parsed)) {
      const backup = validateBackup(parsed);
      const entryWord = backup.entries.length === 1 ? "entry" : "entries";
      const ok = window.confirm(`Importing this backup will replace the current local vault with ${backup.entries.length} encrypted ${entryWord}. This cannot be undone unless you have another backup. Continue?`);
      if (!ok) return;

      await flushBeforeImport();
      lockVault("Importing encrypted backup...");
      await replaceVault(backup);
      state.vault = backup.vault;
      renderAuthMode();
      setStatus(els.authStatus, "Imported encrypted backup. Unlock with the password used for that backup.", "ok");
      return;
    }

    if (isStandardNotesBackup(parsed)) {
      if (!state.key) {
        throw new Error("Unlock or create a vault before importing Standard Notes notes.");
      }

      const importPlan = validateStandardNotesBackup(parsed);
      const existingDates = importPlan.entries.filter((entry) => state.entries.has(entry.date)).length;
      const dateWord = importPlan.entries.length === 1 ? "entry" : "entries";
      const noteWord = importPlan.noteCount === 1 ? "note" : "notes";
      const skipped = importPlan.skipped ? ` ${importPlan.skipped} empty, deleted, or unreadable note${importPlan.skipped === 1 ? "" : "s"} will be skipped.` : "";
      const conflicts = existingDates ? ` ${existingDates} existing date${existingDates === 1 ? "" : "s"} will be merged, not replaced.` : "";
      const ok = window.confirm(`Import ${importPlan.noteCount} Standard Notes ${noteWord} as ${importPlan.entries.length} encrypted diary ${dateWord}.${conflicts}${skipped} Continue?`);
      if (!ok) return;

      await flushBeforeImport();
      const result = await importStandardNotesEntries(importPlan.entries);
      state.currentDate = todayLocal();
      setStatus(els.backupStatus, `Imported ${result.noteCount} Standard Notes ${noteWord} into ${result.entryCount} encrypted diary ${dateWord}.`, "ok");
      renderAll();
      activateTab("write");
      setStatus(els.entryStatus, state.entries.has(state.currentDate) ? "Opened today's entry." : "New entry for today. Auto-save is on.", "ok");
      resetAutoLockTimer();
      return;
    }

    throw new Error("Unsupported JSON file. Choose an encrypted diary backup or a decrypted Standard Notes backup.");
  } catch (error) {
    const target = state.key ? els.backupStatus : els.authStatus;
    setStatus(target, "Import failed: " + readableError(error), "error");
  }
}

async function flushBeforeImport(): Promise<void> {
  const saved = await flushAutoSave();
  if (!saved) {
    throw new Error("The current entry could not be saved, so import was cancelled.");
  }
}

function isPrivateDiaryBackup(value: unknown): value is JsonRecord {
  return isRecord(value) && value.app === APP_ID && value.formatVersion === BACKUP_FORMAT_VERSION;
}

function isStandardNotesBackup(value: unknown): value is { items: StandardNotesItem[] } {
  return isRecord(value) && Array.isArray(value.items) && value.items.some((item) => isRecord(item) && item.content_type === "Note");
}

function validateStandardNotesBackup(value: unknown): StandardNotesImportPlan {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("Standard Notes backup is not a valid JSON export.");
  }

  const items = value.items as StandardNotesItem[];
  const tagsByNoteUuid = standardNotesTagsByNoteUuid(items);
  const grouped = new Map<string, StandardNotesGroup>();
  let skipped = 0;
  let noteCount = 0;

  for (const item of items) {
    if (!item || item.content_type !== "Note") continue;
    if (item.deleted) {
      skipped += 1;
      continue;
    }
    if (!isRecord(item.content)) {
      skipped += 1;
      continue;
    }

    const title = cleanImportedText(item.content.title);
    const text = cleanImportedText(item.content.text || item.content.preview_plain);
    if (!title && !text) {
      skipped += 1;
      continue;
    }

    const timestamp = standardNotesTimestamp(item);
    if (!timestamp) {
      skipped += 1;
      continue;
    }

    const date = toIsoDate(new Date(timestamp));
    if (!isIsoDate(date)) {
      skipped += 1;
      continue;
    }

    const noteText = standardNotesNoteText(title, text);
    const group: StandardNotesGroup = grouped.get(date) || {
      date,
      noteTexts: [],
      themes: new Set(["standard-notes"]),
      sourceCreatedAt: timestamp,
      sourceUpdatedAt: timestamp,
      sourceNoteCount: 0
    };

    group.noteTexts.push(noteText);
    group.sourceNoteCount += 1;
    group.sourceCreatedAt = earlierIso(group.sourceCreatedAt, item.created_at || timestamp);
    group.sourceUpdatedAt = laterIso(group.sourceUpdatedAt, item.updated_at || timestamp);

    if (item.uuid) {
      for (const tag of tagsByNoteUuid.get(item.uuid) || []) {
        group.themes.add(tag);
      }
    }

    grouped.set(date, group);
    noteCount += 1;
  }

  const entries = Array.from(grouped.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((group): StandardNotesImportedEntry => ({
      date: group.date,
      mood: "",
      energy: 5,
      stress: 5,
      journalText: group.noteTexts.join("\n\n---\n\n"),
      promptAnswers: {},
      themes: Array.from(group.themes).sort(),
      sourceCreatedAt: group.sourceCreatedAt,
      sourceUpdatedAt: group.sourceUpdatedAt,
      sourceNoteCount: group.sourceNoteCount,
      standingTopics: []
    }));

  if (!entries.length) {
    throw new Error("No readable Standard Notes notes were found. Encrypted Standard Notes exports must be decrypted in Standard Notes before importing here.");
  }

  return {
    entries,
    noteCount,
    skipped
  };
}

function standardNotesTagsByNoteUuid(items: StandardNotesItem[]): Map<string, Set<string>> {
  const tagByUuid = new Map<string, string>();
  const tagsByNote = new Map<string, Set<string>>();

  for (const item of items) {
    if (!item || item.content_type !== "Tag" || item.deleted || !isRecord(item.content)) continue;
    const title = cleanImportedText(item.content.title);
    if (title && item.uuid) tagByUuid.set(item.uuid, title);
  }

  for (const item of items) {
    if (!item || item.deleted || !isRecord(item.content)) continue;
    const references = Array.isArray(item.content.references)
      ? item.content.references.filter(isStandardNotesReference)
      : [];

    if (item.content_type === "Tag") {
      if (!item.uuid) continue;
      const tag = tagByUuid.get(item.uuid);
      if (!tag) continue;
      for (const reference of references) {
        if (reference && reference.uuid) addStandardNotesTag(tagsByNote, reference.uuid, tag);
      }
    }

    if (item.content_type === "Note") {
      for (const reference of references) {
        const tag = tagByUuid.get(reference.uuid);
        if (tag && item.uuid) addStandardNotesTag(tagsByNote, item.uuid, tag);
      }
    }
  }

  return tagsByNote;
}

function addStandardNotesTag(tagsByNote: Map<string, Set<string>>, noteUuid: string, tag: string): void {
  if (!tagsByNote.has(noteUuid)) tagsByNote.set(noteUuid, new Set());
  tagsByNote.get(noteUuid)?.add(tag);
}

function standardNotesTimestamp(item: StandardNotesItem): string {
  const appDataTime = item.content?.appData?.["org.standardnotes.sn"]?.client_updated_at;
  for (const value of [item.created_at, item.updated_at, appDataTime]) {
    if (isValidDateTime(value)) return value;
  }
  return "";
}

function standardNotesNoteText(title: string, text: string): string {
  if (title && text) return `${title}\n\n${text}`;
  return title || text;
}

async function importStandardNotesEntries(importedEntries: StandardNotesImportedEntry[]): Promise<{ entryCount: number; noteCount: number; merged: number; latestDate: string }> {
  const key = requireKey();
  let merged = 0;
  let noteCount = 0;
  let latestDate = "";

  for (const imported of importedEntries) {
    const existing = state.entries.get(imported.date);
    const existingRecord = state.records.get(imported.date);
    const payload = mergeStandardNotesEntry(existing, imported);
    const encrypted = await encryptJson(key, payload);
    const now = new Date().toISOString();
    const record: EntryRecord = {
      id: imported.date,
      date: imported.date,
      createdAt: existingRecord?.createdAt || imported.sourceCreatedAt || now,
      updatedAt: now,
      encryptedData: encrypted.encryptedData,
      iv: encrypted.iv
    };

    await putEntryRecord(record);
    state.records.set(record.id, record);
    state.entries.set(record.id, payload);

    if (existing) merged += 1;
    noteCount += imported.sourceNoteCount || 1;
    if (!latestDate || imported.date > latestDate) latestDate = imported.date;
  }

  return {
    entryCount: importedEntries.length,
    noteCount,
    merged,
    latestDate
  };
}

function mergeStandardNotesEntry(existing: DiaryEntry | undefined, imported: StandardNotesImportedEntry): DiaryEntry {
  if (!existing) {
    return normalizeEntry(imported);
  }

  return normalizeEntry({
    ...existing,
    journalText: mergeImportedJournalText(existing.journalText, imported.journalText),
    promptAnswers: existing.promptAnswers || {},
    themes: mergeThemes(existing.themes, imported.themes)
  });
}

function mergeImportedJournalText(existingText: unknown, importedText: unknown): string {
  const current = cleanImportedText(existingText);
  const incoming = cleanImportedText(importedText);
  if (!current) return incoming;
  if (!incoming || current.includes(incoming)) return current;
  return `${current}\n\nImported from Standard Notes:\n\n${incoming}`;
}

function mergeThemes(first: unknown, second: unknown): string[] {
  const left = Array.isArray(first) ? first : [];
  const right = Array.isArray(second) ? second : [];
  return Array.from(new Set([...left, ...right].map((item) => cleanImportedText(item)).filter(Boolean))).sort();
}

function cleanImportedText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
}

function isValidDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function earlierIso(first: unknown, second: unknown): string {
  const left = isValidDateTime(first) ? first : "";
  const right = isValidDateTime(second) ? second : "";
  if (!left) return right;
  if (!right) return left;
  return new Date(left).getTime() <= new Date(right).getTime() ? left : right;
}

function laterIso(first: unknown, second: unknown): string {
  const left = isValidDateTime(first) ? first : "";
  const right = isValidDateTime(second) ? second : "";
  if (!left) return right;
  if (!right) return left;
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function validateBackup(value: unknown): PrivateDiaryBackup {
  if (!isRecord(value)) throw new Error("Backup is not a JSON object.");
  if (value.app !== APP_ID) throw new Error("This is not a Private Diary backup.");
  if (value.formatVersion !== BACKUP_FORMAT_VERSION) throw new Error("Unsupported backup version.");
  if (!isRecord(value.vault)) throw new Error("Backup is missing vault metadata.");
  if (!Array.isArray(value.entries)) throw new Error("Backup entries must be an array.");

  const vault = value.vault;
  if (!isRecord(vault.kdf)) throw new Error("Backup is missing key derivation settings.");
  if (!isRecord(vault.cipher)) throw new Error("Backup is missing cipher settings.");
  if (vault.version !== 1) throw new Error("Unsupported vault version.");
  if (!vault.kdf || vault.kdf.name !== "PBKDF2" || vault.kdf.hash !== "SHA-256") throw new Error("Unsupported key derivation settings.");
  const iterations = vault.kdf.iterations;
  if (typeof iterations !== "number" || !Number.isInteger(iterations) || iterations < 100000) throw new Error("PBKDF2 iteration count is too low or missing.");
  if (!vault.cipher || vault.cipher.name !== "AES-GCM" || vault.cipher.length !== 256) throw new Error("Unsupported cipher settings.");
  const saltValue = requireStringProperty(vault, "salt", "vault salt");
  const salt = base64ToBytes(saltValue, "vault salt");
  if (salt.length < 16) throw new Error("Vault salt is too short.");
  const verifier = validateEncryptedPart(vault.verifier, "vault verifier");

  const ids = new Set<string>();
  const entries = value.entries.map((entry, index): EntryRecord => {
    if (!isRecord(entry)) throw new Error(`Entry ${index + 1} is invalid.`);
    for (const key of ["id", "date", "createdAt", "updatedAt", "encryptedData", "iv"]) {
      requireStringProperty(entry, key, `entry ${index + 1} ${key}`);
    }
    const id = requireStringProperty(entry, "id", `entry ${index + 1} id`);
    const date = requireStringProperty(entry, "date", `entry ${index + 1} date`);
    const createdAt = requireStringProperty(entry, "createdAt", `entry ${index + 1} createdAt`);
    const updatedAt = requireStringProperty(entry, "updatedAt", `entry ${index + 1} updatedAt`);
    const encryptedData = requireStringProperty(entry, "encryptedData", `entry ${index + 1} encrypted data`);
    const ivValue = requireStringProperty(entry, "iv", `entry ${index + 1} IV`);
    if (!isIsoDate(date)) throw new Error(`Entry ${index + 1} has an invalid date.`);
    if (id !== date) throw new Error(`Entry ${index + 1} has mismatched id and date.`);
    if (ids.has(id)) throw new Error(`Backup contains a duplicate entry for ${date}.`);
    ids.add(id);
    const iv = base64ToBytes(ivValue, `entry ${index + 1} IV`);
    if (iv.length !== AES_IV_BYTES) throw new Error(`Entry ${index + 1} IV must be 96 bits.`);
    const data = base64ToBytes(encryptedData, `entry ${index + 1} encrypted data`);
    if (!data.length) throw new Error(`Entry ${index + 1} encrypted data is empty.`);
    return {
      id,
      date,
      createdAt,
      updatedAt,
      encryptedData,
      iv: ivValue
    };
  });

  return {
    app: APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : new Date().toISOString(),
    vault: {
      version: vault.version,
      createdAt: String(vault.createdAt || new Date().toISOString()),
      updatedAt: String(vault.updatedAt || new Date().toISOString()),
      salt: saltValue,
      kdf: {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations
      },
      cipher: {
        name: "AES-GCM",
        length: 256
      },
      verifier,
      autoLockMinutes: clampNumber(vault.autoLockMinutes, 1, 120, 10)
    },
    entries
  };
}

function validateEncryptedPart(part: unknown, label: string): EncryptedPart {
  if (!isRecord(part)) throw new Error(`${label} is missing.`);
  const encryptedData = requireStringProperty(part, "encryptedData", `${label} encrypted data`);
  const ivValue = requireStringProperty(part, "iv", `${label} IV`);
  const iv = base64ToBytes(ivValue, `${label} IV`);
  if (iv.length !== AES_IV_BYTES) throw new Error(`${label} IV must be 96 bits.`);
  const data = base64ToBytes(encryptedData, `${label} encrypted data`);
  if (!data.length) throw new Error(`${label} encrypted data is empty.`);
  return { encryptedData, iv: ivValue };
}
