/** Explicit per-computer installation; never distributed as a Vault plugin. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const vault = resolve(process.argv[2] || "../Obsidian-Vault");
const hook = execFileSync(
	"git",
	["rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-commit"],
	{ cwd: vault, encoding: "utf8" },
).trim();
const marker = "# shirone-local-image-import";
if (existsSync(hook) && !readFileSync(hook, "utf8").includes(marker))
	throw new Error(
		"An existing pre-commit hook must be integrated manually; it was preserved.",
	);
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const script = join(
	dirname(fileURLToPath(import.meta.url)),
	"import-local-images.mjs",
);
mkdirSync(dirname(hook), { recursive: true });
writeFileSync(
	hook,
	`#!/bin/sh\n${marker}\nexec ${quote(process.execPath.replaceAll("\\", "/"))} ${quote(script.replaceAll("\\", "/"))} ${quote(vault.replaceAll("\\", "/"))}\n`,
	{ mode: 0o755 },
);
console.log(
	"Installed device-local image import hook; existing notes and Git configuration unchanged.",
);
