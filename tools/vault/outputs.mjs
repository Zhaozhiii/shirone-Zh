import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmdirSync,
	rmSync,
} from "node:fs";
import { join } from "node:path";
import { safePath, writeIfChanged } from "./files.mjs";

const OWNED_DIRECTORIES = [
	"src/content",
	"public/images/vault",
	"public/images/albums",
	".vault-cache/config",
];
const REQUIRED_DIRECTORIES = [
	"src/content/posts",
	"src/content/moments",
	"src/content/spec",
	"public/images/vault",
	"public/images/albums",
];

/** Reconcile generated inputs without deleting and recreating unchanged files. */
export function materializeVault({ root, sourceRoot, outputs, assetOutputs }) {
	const manifestPath = safePath(root, ".vault-cache-files.json");
	const previous = existsSync(manifestPath)
		? JSON.parse(readFileSync(manifestPath, "utf8"))
		: [];
	const biome = join(root, "node_modules/@biomejs/biome/bin/biome");
	// Format in memory, then compare final bytes. No extra hash/cache manifest.
	const prepared = new Map(
		[...outputs].map(([path, text]) => [
			path,
			(path.startsWith("src/data/") || path === "src/user/vault-data.json") &&
			existsSync(biome)
				? execFileSync(
						process.execPath,
						[biome, "format", "--stdin-file-path", path],
						{
							cwd: root,
							input: text,
							encoding: "utf8",
							stdio: ["pipe", "pipe", "pipe"],
							windowsHide: true,
						},
					)
				: text,
		]),
	);
	const next = new Set([...outputs.keys(), ...assetOutputs.keys()]);
	const stale = new Set(previous.filter((path) => !next.has(path)));
	const directories = [];

	function inspect(folder) {
		const absolute = safePath(root, folder);
		if (!existsSync(absolute)) return;
		for (const entry of readdirSync(absolute, { withFileTypes: true })) {
			const path = `${folder}/${entry.name}`;
			safePath(root, path);
			if (entry.isDirectory()) inspect(path);
			else if (!next.has(path)) stale.add(path);
		}
		directories.push(absolute);
	}
	for (const folder of OWNED_DIRECTORIES) inspect(folder);

	let changed = stale.size > 0;
	for (const path of stale) rmSync(safePath(root, path), { force: true });
	for (const directory of directories) {
		if (readdirSync(directory).length === 0) rmdirSync(directory);
	}
	for (const folder of REQUIRED_DIRECTORIES)
		mkdirSync(safePath(root, folder), { recursive: true });
	for (const [path, text] of prepared) {
		const target = safePath(root, path);
		if (writeIfChanged(target, text)) changed = true;
	}
	for (const [target, original] of assetOutputs) {
		if (
			writeIfChanged(
				safePath(root, target),
				readFileSync(safePath(sourceRoot, original)),
			)
		)
			changed = true;
	}
	writeIfChanged(manifestPath, `${JSON.stringify([...next])}\n`);
	return { changed };
}
