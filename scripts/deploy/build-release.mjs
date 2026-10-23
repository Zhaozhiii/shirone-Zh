import { execFileSync } from "node:child_process";

// Reuse the exact package manager that started this script. On Windows a bare
// nested `pnpm` can resolve to another globally installed version on PATH.
const packageManager = process.env.npm_execpath;
if (!packageManager)
	throw new Error("Run this command with pnpm build:release");
execFileSync(process.execPath, [packageManager, "run", "build"], {
	stdio: "inherit",
});
await import("./package.mjs");
