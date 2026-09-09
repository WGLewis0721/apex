const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
async function key(value: string) {
  const bytes = unb64(value);
  if (bytes.length !== 32) {
    throw new Error("Credential encryption key must contain 32 random bytes");
  }
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function generateCredentials(
  encryptionKey: string,
  owner: string,
) {
  const publishable = "apex_pk_test_" +
    hex(crypto.getRandomValues(new Uint8Array(24)));
  const secret = "apex_sk_test_" +
    hex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = hex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(secret)),
    ),
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(owner) },
    await key(encryptionKey),
    encoder.encode(secret),
  );
  return {
    publishable,
    hash,
    ciphertext: `v1.${b64(iv)}.${b64(new Uint8Array(encrypted))}`,
  };
}
export async function decryptCredential(
  ciphertext: string,
  encryptionKey: string,
  owner: string,
) {
  const [version, iv, encrypted] = ciphertext.split(".");
  if (version !== "v1") throw new Error("Unsupported credential version");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(iv), additionalData: encoder.encode(owner) },
      await key(encryptionKey),
      unb64(encrypted),
    ),
  );
}
