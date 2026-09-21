#!/usr/bin/env node
import { runInit } from "./index.js";

async function main() {
  const command = process.argv[2];

  if (command === "init") {
    const report = await runInit();
    process.exitCode = report.success ? 0 : 1;
    return;
  }

  if (!command || command === "--help" || command === "-h") {
    console.log("Usage: apex init");
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
