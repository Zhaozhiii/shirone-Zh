import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** The same inventory is used for notes and attachment resolution. */
export function files(root) {
	if (!existsSync(root)) return [];
	return readdirSync(root, { withFileTypes: true })
		.filter(
			(entry) =>
				!entry.name.startsWith(".") &&
				entry.name !== "node_modules" &&
				entry.name !== "模板" &&
				!entry.isSymbolicLink(),
		)
		.flatMap((entry) => {
			const path = join(root, entry.name);
			return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
		});
}

/** Require a descendant of root and reject links/junctions along its path. */
export function safePath(root, path) {
	const base = resolve(root);
	const target = resolve(base, path);
	const local = relative(base, target);
	if (
		!local ||
		local === ".." ||
		local.startsWith(`..${sep}`) ||
		isAbsolute(local)
	)
		throw new Error("路径超出博客库");
	for (let cursor = target; cursor !== base; cursor = dirname(cursor)) {
		if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink())
			throw new Error("Symbolic links are not allowed");
	}
	return target;
}

/** Compare bytes, so equal-sized edits are detected and unchanged mtimes survive. */
export function writeIfChanged(path, contents) {
	const bytes = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
	if (existsSync(path) && readFileSync(path).equals(bytes)) return false;
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, bytes);
	return true;
}
