function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const entries = db.createObjectStore(STORE_ENTRIES, { keyPath: "id" });
        entries.createIndex("byDate", "date", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_LLM)) {
        db.createObjectStore(STORE_LLM, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
  });
}

async function getVaultMeta(): Promise<VaultMeta | null> {
  const tx = requireDb().transaction(STORE_META, "readonly");
  const store = tx.objectStore(STORE_META);
  const result = await requestResult<{ value: VaultMeta } | undefined>(store.get(VAULT_KEY) as IDBRequest<{ value: VaultMeta } | undefined>);
  return result ? result.value : null;
}

async function setVaultMeta(vault: VaultMeta): Promise<void> {
  const tx = requireDb().transaction(STORE_META, "readwrite");
  tx.objectStore(STORE_META).put({ key: VAULT_KEY, value: vault });
  await transactionDone(tx);
}

async function getAllEntryRecords(): Promise<EntryRecord[]> {
  const tx = requireDb().transaction(STORE_ENTRIES, "readonly");
  const store = tx.objectStore(STORE_ENTRIES);
  return await requestResult<EntryRecord[]>(store.getAll() as IDBRequest<EntryRecord[]>);
}

async function putEntryRecord(record: EntryRecord): Promise<void> {
  const tx = requireDb().transaction(STORE_ENTRIES, "readwrite");
  tx.objectStore(STORE_ENTRIES).put(record);
  await transactionDone(tx);
}

async function deleteEntryAndLlmRecords(entryId: string, llmRecordIds: string[]): Promise<void> {
  const tx = requireDb().transaction([STORE_ENTRIES, STORE_LLM], "readwrite");
  tx.objectStore(STORE_ENTRIES).delete(entryId);
  const llmStore = tx.objectStore(STORE_LLM);
  for (const id of llmRecordIds) {
    llmStore.delete(id);
  }
  await transactionDone(tx);
}

async function getAllLlmRecords(): Promise<LlmEncryptedRecord[]> {
  const tx = requireDb().transaction(STORE_LLM, "readonly");
  const store = tx.objectStore(STORE_LLM);
  return await requestResult<LlmEncryptedRecord[]>(store.getAll() as IDBRequest<LlmEncryptedRecord[]>);
}

async function getLlmRecord(id: string): Promise<LlmEncryptedRecord | null> {
  const tx = requireDb().transaction(STORE_LLM, "readonly");
  const store = tx.objectStore(STORE_LLM);
  const result = await requestResult<LlmEncryptedRecord | undefined>(store.get(id) as IDBRequest<LlmEncryptedRecord | undefined>);
  return result || null;
}

async function putEncryptedLlmRecord<T>(id: string, kind: LlmEncryptedRecord["kind"], value: T): Promise<void> {
  const key = requireKey();
  const existing = await getLlmRecord(id);
  const now = new Date().toISOString();
  const encrypted = await encryptJson(key, value);
  const record: LlmEncryptedRecord = {
    id,
    kind,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    encryptedData: encrypted.encryptedData,
    iv: encrypted.iv
  };

  const tx = requireDb().transaction(STORE_LLM, "readwrite");
  tx.objectStore(STORE_LLM).put(record);
  await transactionDone(tx);
}

async function readEncryptedLlmRecord<T>(record: LlmEncryptedRecord): Promise<T | null> {
  try {
    return await decryptJson<T>(requireKey(), record.encryptedData, record.iv);
  } catch (error) {
    return null;
  }
}

async function deleteLlmRecord(id: string): Promise<void> {
  const tx = requireDb().transaction(STORE_LLM, "readwrite");
  tx.objectStore(STORE_LLM).delete(id);
  await transactionDone(tx);
}

async function replaceVault(backup: Pick<PrivateDiaryBackup, "vault" | "entries">): Promise<void> {
  const tx = requireDb().transaction([STORE_META, STORE_ENTRIES, STORE_LLM], "readwrite");
  const metaStore = tx.objectStore(STORE_META);
  const entryStore = tx.objectStore(STORE_ENTRIES);
  const llmStore = tx.objectStore(STORE_LLM);
  metaStore.clear();
  entryStore.clear();
  llmStore.clear();
  metaStore.put({ key: VAULT_KEY, value: backup.vault });
  for (const entry of backup.entries) {
    entryStore.put(entry);
  }
  await transactionDone(tx);
}
