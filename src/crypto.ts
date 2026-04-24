/*
  Crypto flow:
  1. A random vault salt is created once and stored with non-secret metadata.
  2. The master password is imported into PBKDF2 and stretched with SHA-256.
  3. PBKDF2 derives a non-extractable AES-GCM 256-bit key. The password and key are never stored.
  4. Each save creates a fresh random 96-bit IV before encrypting that entry JSON with AES-GCM.
  5. The app stores only salt, IVs, encrypted payloads, timestamps, and metadata in IndexedDB.

  Limits:
  - A weak password can still be guessed offline by someone with a backup or device access.
  - While unlocked, decrypted entries and the CryptoKey exist in browser memory.
  - Browser, operating system, extensions, and physical device security are part of the trust boundary.
*/
async function deriveVaultKey(password: string, saltBytes: Uint8Array, iterations: number): Promise<CryptoKey> {
  const passwordBytes = new TextEncoder().encode(password);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(saltBytes),
      iterations,
      hash: "SHA-256"
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptJson<T>(key: CryptoKey, value: T): Promise<EncryptedPart> {
  const iv = randomBytes(AES_IV_BYTES);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext)
  );
  return {
    encryptedData: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv)
  };
}

async function decryptJson<T = unknown>(key: CryptoKey, encryptedData: string, iv: string): Promise<T> {
  const encryptedBytes = base64ToBytes(encryptedData, "encrypted data");
  const ivBytes = base64ToBytes(iv, "IV");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(ivBytes) },
    key,
    toArrayBuffer(encryptedBytes)
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function base64ToBytes(base64: string, label: string): Uint8Array {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    throw new Error(`${label || "Value"} is not valid base64.`);
  }
}
