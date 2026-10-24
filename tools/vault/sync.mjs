import { readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { syncUserConfig } from "../../scripts/content/config-overlay.mjs";
import { compileVault } from "./core.mjs";
import { files, safePath, writeIfChanged } from "./files.mjs";
import { materializeVault } from "./outputs.mjs";

export function syncVault({ root, sourceRoot, commit, dryRun = false }) {
	// Plan public notes and resources before changing any build inputs.
	const result = compileVault({ root, sourceRoot, dryRun: true });
	if (result.diagnostics.length) {
		const counts = {};
		for (const diagnostic of result.diagnostics) counts[diagnostic.code] = (counts[diagnostic.code] || 0) + 1;
		console.warn(`[markdown] Reference notices (publication continues): ${JSON.stringify(counts)}`);
	}
	const configFiles = new Map(
		[...result.outputs]
			.filter(([path]) => path.startsWith(".vault-cache/config/"))
			.map(([path, text]) => [path.slice(".vault-cache/config/".length), text]),
	);
	const config = syncUserConfig({
		root,
		sourceRoot: result.configRoot,
		configFiles,
		dryRun,
		warn: () => {},
	});
	const lock = {
		schemaVersion: 1,
		format: "obsidian-vault",
		source: { type: "path", path: sourceRoot, commit },
		config: config.files,
		evaluatedAt: result.time,
	};
	if (!dryRun) {
		// Only code-owned engineering assets may be mounted wholesale.
		for (const [from, to] of [
			["site/assets", "src/assets"],
			["site/public", "public"],
			["site/data", "src/data"],
		]) {
			const source = join(root, from);
			for (const file of files(source))
				writeIfChanged(
					safePath(root, join(to, relative(source, file))),
					readFileSync(file),
				);
		}
		const content = materializeVault({ root, sourceRoot, ...result });
		writeIfChanged(
			join(root, "content.lock.json"),
			`${JSON.stringify(lock, null, 2)}\n`,
		);
		// Astro may otherwise retain the last record when a collection becomes empty.
		if (content.changed || config.changed)
			for (const p of [
				".astro/data-store.json",
				"node_modules/.astro/data-store.json",
			])
				rmSync(safePath(root, p), { force: true });
	}
	return lock;
}
