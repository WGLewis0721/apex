import { admin } from "./core.ts";

const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

async function sha256Hex(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export type ApexApiIdentity = {
  workspaceId: string;
  environmentId: string;
};

export async function authenticateApexApi(req: Request): Promise<ApexApiIdentity> {
  const token = req.headers.get("Authorization")?.match(/^Bearer (apex_sk_[A-Za-z0-9_]+)$/)?.[1];
  if (!token) throw new Error("UNAUTHORIZED");

  const hash = await sha256Hex(token);
  const db = admin();
  const { data: key, error: keyError } = await db
    .from("api_keys")
    .select("workspace_id,environment_id,status")
    .eq("secret_key_hash", hash)
    .eq("status", "active")
    .maybeSingle();
  if (keyError || !key) throw new Error("UNAUTHORIZED");

  const [{ data: workspace, error: workspaceError }, { data: environment, error: envError }] = await Promise.all([
    db.from("workspaces").select("status").eq("id", key.workspace_id).maybeSingle(),
    db.from("environments").select("status").eq("id", key.environment_id).eq("workspace_id", key.workspace_id).maybeSingle(),
  ]);

  if (workspaceError || envError || workspace?.status !== "active" || environment?.status !== "active") {
    throw new Error("UNAUTHORIZED");
  }

  return { workspaceId: key.workspace_id, environmentId: key.environment_id };
}
