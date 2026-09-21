import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export const SDK_PACKAGE_NAME = "@wlgewis-gmtc/apex-sdk";
export const ENV_KEY = "APEX_SECRET_KEY";

// Mirrors the format packages/sdk/src/index.ts enforces in the ApexClient
// constructor, so the CLI can reject an obviously-wrong key before ever
// writing it to disk or spending a network round trip on it.
export const APEX_KEY_PATTERN = /^apex_sk_(test|live)_[A-Za-z0-9_]+$/;

export function isValidKeyFormat(value: string): boolean {
  return APEX_KEY_PATTERN.test(value);
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) return "bun";
  return "npm";
}

export function installCommandFor(manager: PackageManager, packageName: string): { command: string; args: string[] } {
  switch (manager) {
    case "pnpm":
      return { command: "pnpm", args: ["add", packageName] };
    case "yarn":
      return { command: "yarn", args: ["add", packageName] };
    case "bun":
      return { command: "bun", args: ["add", packageName] };
    default:
      return { command: "npm", args: ["install", packageName] };
  }
}

/**
 * npm/pnpm/yarn resolve to .cmd shims on Windows, which Node can only launch
 * through a shell (spawning them directly fails with EINVAL). `shell: true`
 * together with a separate args array makes Node warn that it won't escape
 * those args (DEP0190); since command/args here are always the fixed
 * strings from installCommandFor, never user input, we sidestep the warning
 * by joining them into one command string instead of taking on real risk.
 */
function runPackageManagerInstall(
  command: string,
  args: string[],
  options: Parameters<typeof spawnSync>[2],
): ReturnType<typeof spawnSync> {
  if (process.platform === "win32") {
    return spawnSync([command, ...args].join(" "), { ...options, shell: true });
  }
  return spawnSync(command, args, options);
}

const FRAMEWORK_HINTS = ["next", "express", "fastify", "koa", "hono", "@nestjs/core"];

export function detectFrameworkHint(packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }): string | null {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  return FRAMEWORK_HINTS.find((name) => name in deps) ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractEnvValue(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^[ \\t]*${escapeRegExp(key)}[ \\t]*=[ \\t]*(.*)$`, "m"));
  return match ? match[1].trim() : null;
}

export type EnvMergeAction = "created" | "appended" | "updated" | "unchanged";
export type EnvMergeResult = { content: string; action: EnvMergeAction };

/** Updates `key` in an existing env file's text in place, or appends it, without disturbing any other line. */
export function mergeEnvFile(existingContent: string | null, key: string, value: string): EnvMergeResult {
  if (existingContent === null || existingContent.trim() === "") {
    return { content: `${key}=${value}\n`, action: "created" };
  }
  const endedWithNewline = existingContent.endsWith("\n");
  const lines = existingContent.split(/\r?\n/);
  if (endedWithNewline && lines[lines.length - 1] === "") lines.pop();

  const pattern = new RegExp(`^[ \\t]*${escapeRegExp(key)}[ \\t]*=`);
  const index = lines.findIndex((line) => pattern.test(line));
  if (index === -1) {
    lines.push(`${key}=${value}`);
    return { content: lines.join("\n") + "\n", action: "appended" };
  }

  const currentValue = lines[index].slice(lines[index].indexOf("=") + 1).trim();
  if (currentValue === value) {
    return { content: existingContent, action: "unchanged" };
  }
  lines[index] = `${key}=${value}`;
  return { content: lines.join("\n") + "\n", action: "updated" };
}

export type GitignoreAction = "created" | "appended" | "unchanged";
export type GitignoreResult = { content: string; action: GitignoreAction };

export function ensureGitignoreEntry(existingContent: string | null, entry: string): GitignoreResult {
  if (existingContent === null) {
    return { content: `${entry}\n`, action: "created" };
  }
  const alreadyPresent = existingContent.split(/\r?\n/).some((line) => line.trim() === entry);
  if (alreadyPresent) {
    return { content: existingContent, action: "unchanged" };
  }
  const base = existingContent.endsWith("\n") ? existingContent : `${existingContent}\n`;
  return { content: `${base}${entry}\n`, action: "appended" };
}

export type VerificationResult = "valid" | "invalid" | "unknown";

export function classifyVerificationStatus(status: number): VerificationResult {
  // The hosted apex-api function authenticates the bearer token before it
  // routes the request (supabase/functions/_shared/apex_api_auth.ts): an
  // invalid/revoked key always throws UNAUTHORIZED -> 401, and a route that
  // doesn't match any known handler only ever produces 404 *after* auth
  // succeeds. Hitting a path that deliberately matches no handler is
  // therefore a legitimate, side-effect-free way to check a credential
  // without needing a real customer id.
  if (status === 401) return "invalid";
  if (status === 404) return "valid";
  return "unknown";
}

export const DEFAULT_APEX_BASE_URL = "https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-api";

export async function verifyCredential(
  apiKey: string,
  options?: { baseUrl?: string; fetch?: typeof fetch },
): Promise<VerificationResult> {
  const baseUrl = (options?.baseUrl ?? DEFAULT_APEX_BASE_URL).replace(/\/$/, "");
  const fetcher = options?.fetch ?? globalThis.fetch;
  try {
    const response = await fetcher(`${baseUrl}/v1/__apex_cli_verify__`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    return classifyVerificationStatus(response.status);
  } catch {
    return "unknown";
  }
}

export type ResolveResult = { resolvable: boolean; detail?: string };

/** Confirms the SDK actually resolves from the target project's own node_modules, not this CLI's. */
export function checkSdkResolvable(cwd: string, packageName: string): ResolveResult {
  const script = `import(${JSON.stringify(packageName)}).then((m) => process.exit(typeof m.ApexClient === "function" ? 0 : 2)).catch(() => process.exit(1));`;
  const result = spawnSync(process.execPath, ["-e", script], { cwd, encoding: "utf8" });
  if (result.error) return { resolvable: false, detail: "Could not start Node to check the import." };
  if (result.status === 0) return { resolvable: true };
  if (result.status === 2) return { resolvable: false, detail: `${packageName} resolved but does not export ApexClient.` };
  return { resolvable: false, detail: `${packageName} could not be imported from this project.` };
}

export function promptForSecret(
  question: string,
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!input.isTTY) {
      reject(new Error("NOT_INTERACTIVE"));
      return;
    }
    output.write(question);
    let value = "";
    const onData = (chunk: Buffer) => {
      const char = chunk.toString("utf8");
      if (char === "\n" || char === "\r" || char === "") {
        cleanup();
        output.write("\n");
        resolve(value);
        return;
      }
      if (char === "") {
        cleanup();
        output.write("\n");
        reject(new Error("CANCELLED"));
        return;
      }
      if (char === "" || char === "\b") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          output.write("\b \b");
        }
        return;
      }
      value += char;
      output.write("*");
    };
    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
    };
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    input.on("data", onData);
  });
}

export type StepStatus = "ok" | "warn" | "error";
export type StepResult = { name: string; status: StepStatus; detail: string };

export type InitOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  promptForSecret?: typeof promptForSecret;
  runInstall?: typeof runPackageManagerInstall;
  verify?: typeof verifyCredential;
  checkResolvable?: typeof checkSdkResolvable;
  log?: (line: string) => void;
};

export type InitReport = { success: boolean; steps: StepResult[] };

const ICONS: Record<StepStatus, string> = { ok: "✔", warn: "⚠", error: "✖" };

export async function runInit(options: InitOptions = {}): Promise<InitReport> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const log = options.log ?? ((line: string) => console.log(line));
  const doPrompt = options.promptForSecret ?? promptForSecret;
  const doInstall = options.runInstall ?? runPackageManagerInstall;
  const doVerify = options.verify ?? verifyCredential;
  const doResolveCheck = options.checkResolvable ?? checkSdkResolvable;

  const steps: StepResult[] = [];
  const record = (name: string, status: StepStatus, detail: string) => {
    steps.push({ name, status, detail });
    log(`${ICONS[status]} ${detail}`);
  };
  const finish = (): InitReport => {
    const success = steps.every((step) => step.status !== "error");
    const warned = steps.some((step) => step.status === "warn");
    if (!success) log("\napex init failed. Fix the item above and re-run.");
    else if (warned) log("\napex init finished, but could not verify everything above.");
    else log("\napex init complete. Your project is wired up to APEX.");
    return { success, steps };
  };

  const packageJsonPath = join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) {
    record("project", "error", "No package.json here. Run `npm init` (or your package manager's equivalent) first, then re-run `apex init`.");
    return finish();
  }
  let packageJson: { name?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch {
    record("project", "error", "package.json exists but is not valid JSON.");
    return finish();
  }
  record("project", "ok", `Node project detected${packageJson.name ? ` (${packageJson.name})` : ""}.`);

  const manager = detectPackageManager(cwd);
  const framework = detectFrameworkHint(packageJson);
  record("detect", "ok", `Package manager: ${manager}.${framework ? ` Framework: ${framework}.` : ""}`);

  const alreadyDeclared = Boolean(packageJson.dependencies?.[SDK_PACKAGE_NAME] || packageJson.devDependencies?.[SDK_PACKAGE_NAME]);
  if (alreadyDeclared) {
    record("install", "ok", `${SDK_PACKAGE_NAME} is already a dependency; skipping install.`);
  } else {
    const { command, args } = installCommandFor(manager, SDK_PACKAGE_NAME);
    const result = doInstall(command, args, { cwd, stdio: "inherit" });
    if (result.status !== 0) {
      record("install", "error", `${command} ${args.join(" ")} failed. Fix the package manager error above and re-run.`);
      return finish();
    }
    record("install", "ok", `Installed ${SDK_PACKAGE_NAME} with ${manager}.`);
  }

  const envFilePath = join(cwd, ".env");
  const existingEnvContent = existsSync(envFilePath) ? readFileSync(envFilePath, "utf8") : null;
  const existingFileValue = existingEnvContent ? extractEnvValue(existingEnvContent, ENV_KEY) : null;

  let secret: string | null = env[ENV_KEY]?.trim() || null;
  let secretSource: "environment" | "existing .env" | "prompt" = "environment";
  if (!secret && existingFileValue && isValidKeyFormat(existingFileValue)) {
    secret = existingFileValue;
    secretSource = "existing .env";
  }
  if (!secret) {
    try {
      secret = await doPrompt("Enter your APEX secret key (apex_sk_...): ");
      secretSource = "prompt";
    } catch {
      record(
        "credential",
        "error",
        `${ENV_KEY} is not set and no interactive terminal is available to ask for it. Set ${ENV_KEY} and re-run.`,
      );
      return finish();
    }
  }
  if (!secret || !isValidKeyFormat(secret)) {
    record("credential", "error", `That is not a valid APEX key. Expected the format apex_sk_test_... or apex_sk_live_...`);
    return finish();
  }
  record("credential", "ok", `Credential obtained from ${secretSource}.`);

  const envMerge = mergeEnvFile(existingEnvContent, ENV_KEY, secret);
  if (envMerge.action !== "unchanged") writeFileSync(envFilePath, envMerge.content, "utf8");
  const envDetail =
    envMerge.action === "created"
      ? `Created .env with ${ENV_KEY}.`
      : envMerge.action === "unchanged"
        ? `.env already has the right ${ENV_KEY}.`
        : `Updated ${ENV_KEY} in .env.`;
  record("env-file", "ok", envDetail);

  const gitignorePath = join(cwd, ".gitignore");
  const existingGitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : null;
  const gitignoreResult = ensureGitignoreEntry(existingGitignore, ".env");
  if (gitignoreResult.action !== "unchanged") writeFileSync(gitignorePath, gitignoreResult.content, "utf8");
  const gitignoreDetail =
    gitignoreResult.action === "unchanged"
      ? ".gitignore already ignores .env."
      : gitignoreResult.action === "created"
        ? "Created .gitignore ignoring .env."
        : "Added .env to .gitignore.";
  record("gitignore", "ok", gitignoreDetail);

  const resolveResult = doResolveCheck(cwd, SDK_PACKAGE_NAME);
  if (resolveResult.resolvable) {
    record("import", "ok", `${SDK_PACKAGE_NAME} resolves and exports ApexClient.`);
  } else {
    record("import", "warn", resolveResult.detail ?? "Could not confirm the SDK can be imported from this project.");
  }

  const verification = await doVerify(secret);
  if (verification === "valid") {
    record("verify", "ok", "APEX confirmed this credential is active.");
  } else if (verification === "invalid") {
    record("verify", "error", "APEX rejected this credential (invalid or inactive key). Double-check the value and re-run.");
  } else {
    record("verify", "warn", "Could not reach APEX to verify the credential right now. Everything else is set up.");
  }

  return finish();
}
