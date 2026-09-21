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

export type ProjectKind = "next" | "vite" | "node";

/**
 * Drives which env file gets the secret and whether to warn about browser
 * exposure. Next and Vite both ship a dev server that inlines specially
 * prefixed env vars into client bundles, so both get `.env.local` (their
 * own convention) and the same "server-side only" warning; anything else
 * is treated as a plain Node process using `.env`.
 */
export function detectProjectKind(cwd: string, packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }): ProjectKind {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  if ("next" in deps) return "next";
  if ("vite" in deps || existsSync(join(cwd, "vite.config.ts")) || existsSync(join(cwd, "vite.config.js"))) return "vite";
  return "node";
}

export function envFileNameFor(kind: ProjectKind): string {
  return kind === "node" ? ".env" : ".env.local";
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

/**
 * Updates `key` in an existing env file's text in place, or appends it,
 * without disturbing any other line. If `key` somehow appears more than
 * once (hand-edited file, merge artifact, etc.), keeps exactly one
 * authoritative entry at the first occurrence and drops the rest, rather
 * than leaving conflicting duplicates behind.
 */
export function mergeEnvFile(existingContent: string | null, key: string, value: string): EnvMergeResult {
  if (existingContent === null || existingContent.trim() === "") {
    return { content: `${key}=${value}\n`, action: "created" };
  }
  const endedWithNewline = existingContent.endsWith("\n");
  const lines = existingContent.split(/\r?\n/);
  if (endedWithNewline && lines[lines.length - 1] === "") lines.pop();

  const pattern = new RegExp(`^[ \\t]*${escapeRegExp(key)}[ \\t]*=`);
  const matchIndexes: number[] = [];
  lines.forEach((line, i) => {
    if (pattern.test(line)) matchIndexes.push(i);
  });

  if (matchIndexes.length === 0) {
    lines.push(`${key}=${value}`);
    return { content: lines.join("\n") + "\n", action: "appended" };
  }

  const [firstIndex, ...duplicateIndexes] = matchIndexes;
  const currentValue = lines[firstIndex].slice(lines[firstIndex].indexOf("=") + 1).trim();
  if (currentValue === value && duplicateIndexes.length === 0) {
    return { content: existingContent, action: "unchanged" };
  }
  lines[firstIndex] = `${key}=${value}`;
  const deduped = lines.filter((_, i) => !duplicateIndexes.includes(i));
  return { content: deduped.join("\n") + "\n", action: "updated" };
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
  // GET /v1/whoami authenticates through the same path as every other
  // apex-api route and returns only safe identity info (workspace_id,
  // environment_id, mode) -- never the credential. Verification succeeds
  // only on an authenticated 200; 401 means invalid/inactive; anything else
  // is a network/server failure, distinct from an invalid credential.
  if (status === 200) return "valid";
  if (status === 401) return "invalid";
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
    const response = await fetcher(`${baseUrl}/v1/whoami`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    return classifyVerificationStatus(response.status);
  } catch {
    return "unknown";
  }
}

export const EXAMPLE_FILE_NAME = "apex-example.mjs";

/**
 * A small, non-destructive example of the real SDK surface -- entitlements()
 * and consume() -- for the customer to read, run, or delete. `.mjs` runs as
 * ESM under Node regardless of the target project's own "type", so it needs
 * no build step. This file is only ever written, never executed by the CLI.
 */
export function buildExampleContent(envFileName: string): string {
  return `// Example usage for @wlgewis-gmtc/apex-sdk, generated once by \`apex init\`.
// Edit or delete this file freely -- it is yours, not part of the SDK.
//
// APEX_SECRET_KEY comes from the environment, not a bundler, so load your
// env file when running this directly:
//   node --env-file=${envFileName} ${EXAMPLE_FILE_NAME}
import { ApexClient } from "@wlgewis-gmtc/apex-sdk";

const apex = new ApexClient({ apiKey: process.env.APEX_SECRET_KEY });

// Replace with a real customer id from your own system.
const customerId = "replace-with-a-real-customer-id";

const entitlements = await apex.entitlements(customerId);
console.log(entitlements);

// consume() spends credits -- uncomment only when you actually mean to.
// const result = await apex.consume(customerId, 1, \`example:\${Date.now()}\`);
// console.log(result);
`;
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

/**
 * Parses `apex init [--base-url <url>]`. Normal users never need this --
 * it overrides the built-in hosted endpoint for development/testing only.
 */
export function parseInitArgs(argv: string[]): { baseUrl?: string } {
  const options: { baseUrl?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base-url") {
      options.baseUrl = argv[i + 1];
      i++;
    } else if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
    }
  }
  return options;
}

export type InitOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  baseUrl?: string;
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
  const projectKind = detectProjectKind(cwd, packageJson);
  const envFileName = envFileNameFor(projectKind);
  const projectKindLabel = projectKind === "next" ? "Next.js" : projectKind === "vite" ? "Vite" : "Node";
  record("detect", "ok", `Package manager: ${manager}. Project type: ${projectKindLabel}.${framework ? ` Framework: ${framework}.` : ""}`);

  if (projectKind === "next" || projectKind === "vite") {
    const forbiddenPrefix = projectKind === "next" ? "NEXT_PUBLIC_" : "VITE_";
    record(
      "framework-note",
      "ok",
      `${projectKindLabel} detected: ApexClient is server-side only. Never import it from client components or anything bundled for the browser, and never prefix ${ENV_KEY} with ${forbiddenPrefix}.`,
    );
  }

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

  const envFilePath = join(cwd, envFileName);
  const existingEnvContent = existsSync(envFilePath) ? readFileSync(envFilePath, "utf8") : null;
  const existingFileValue = existingEnvContent ? extractEnvValue(existingEnvContent, ENV_KEY) : null;

  let secret: string | null = env[ENV_KEY]?.trim() || null;
  let secretSource: string = "environment";
  if (!secret && existingFileValue && isValidKeyFormat(existingFileValue)) {
    secret = existingFileValue;
    secretSource = `existing ${envFileName}`;
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
      ? `Created ${envFileName} with ${ENV_KEY}.`
      : envMerge.action === "unchanged"
        ? `${envFileName} already has the right ${ENV_KEY}.`
        : `Updated ${ENV_KEY} in ${envFileName}.`;
  record("env-file", "ok", envDetail);

  const gitignorePath = join(cwd, ".gitignore");
  const existingGitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : null;
  const gitignoreResult = ensureGitignoreEntry(existingGitignore, envFileName);
  if (gitignoreResult.action !== "unchanged") writeFileSync(gitignorePath, gitignoreResult.content, "utf8");
  const gitignoreDetail =
    gitignoreResult.action === "unchanged"
      ? `.gitignore already ignores ${envFileName}.`
      : gitignoreResult.action === "created"
        ? `Created .gitignore ignoring ${envFileName}.`
        : `Added ${envFileName} to .gitignore.`;
  record("gitignore", "ok", gitignoreDetail);

  const examplePath = join(cwd, EXAMPLE_FILE_NAME);
  if (existsSync(examplePath)) {
    record("example", "ok", `${EXAMPLE_FILE_NAME} already exists; leaving it alone.`);
  } else {
    writeFileSync(examplePath, buildExampleContent(envFileName), "utf8");
    record("example", "ok", `Created ${EXAMPLE_FILE_NAME} showing entitlements()/consume() usage.`);
  }

  const resolveResult = doResolveCheck(cwd, SDK_PACKAGE_NAME);
  if (resolveResult.resolvable) {
    record("import", "ok", `${SDK_PACKAGE_NAME} resolves and exports ApexClient.`);
  } else {
    record("import", "warn", resolveResult.detail ?? "Could not confirm the SDK can be imported from this project.");
  }

  const verification = await doVerify(secret, { baseUrl: options.baseUrl });
  if (verification === "valid") {
    record("verify", "ok", "APEX confirmed this credential is active.");
  } else if (verification === "invalid") {
    record("verify", "error", "APEX rejected this credential (invalid or inactive key). Double-check the value and re-run.");
  } else {
    record("verify", "warn", "Could not reach APEX to verify the credential right now. Everything else is set up.");
  }

  return finish();
}
