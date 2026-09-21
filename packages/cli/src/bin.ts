#!/usr/bin/env node
import { runInit, parseInitArgs } from "./index.js";

async function main() {
  const command = process.argv[2];

  if (command === "init") {
    const { baseUrl } = parseInitArgs(process.argv.slice(3));
    const report = await runInit({ baseUrl });
    process.exitCode = report.success ? 0 : 1;
    return;
  }

  if (!command || command === "--help" || command === "-h") {
    console.log("Usage: apex init [--base-url <url>]");
    process.exitCode = command ? 0 : 1;
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.log("Usage: apex init");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
