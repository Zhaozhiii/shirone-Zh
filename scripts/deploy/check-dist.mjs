import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Fail the build if agent instructions have become public files or routes. */
export async function checkDist(root) {
	async function visit(directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (/^_?AGENTS(?:\.|$)/i.test(entry.name)) {
				throw new Error(
					`Development instructions must not be published: ${path}`,
				);
			}
			if (entry.isDirectory()) await visit(path);
			else if (entry.isFile() && /^sitemap.*\.xml$/.test(entry.name)) {
				if (
					/<loc>[^<]*\/_?AGENTS(?:\/|[.<])/i.test(await readFile(path, "utf8"))
				) {
					throw new Error(`Development instructions found in sitemap: ${path}`);
				}
			}
		}
	}
	await visit(root);
}

if (
	process.argv[1] &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
	await checkDist(resolve("dist"));
	console.log(
		"Verified dist: no public agent instructions or instruction routes.",
	);
}
