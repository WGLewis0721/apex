import { decryptCredential, generateCredentials } from "./credentials.ts";
function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
Deno.test("Sandbox credentials are random, encrypted, owner-bound, and hash-verifiable", async () => {
  const key = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  );
  const a = await generateCredentials(key, "owner-a");
  const b = await generateCredentials(key, "owner-a");
  assert(
    a.publishable !== b.publishable && a.hash !== b.hash,
    "duplicate credentials",
  );
  assert(
    /^apex_pk_test_[0-9a-f]{48}$/.test(a.publishable),
    "invalid publishable key",
  );
  const secret = await decryptCredential(a.ciphertext, key, "owner-a");
  assert(/^apex_sk_test_[0-9a-f]{64}$/.test(secret), "invalid secret key");
  assert(!a.ciphertext.includes(secret), "plaintext persisted");
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  assert(hash === a.hash, "wrong hash");
  let rejected = false;
  try {
    await decryptCredential(a.ciphertext, key, "owner-b");
  } catch {
    rejected = true;
  }
  assert(rejected, "ciphertext usable by another owner");
});
