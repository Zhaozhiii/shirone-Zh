/** Device-local pre-commit step. Copy referenced images before Git pushes the Vault. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import {
	dirname,
	extname,
	isAbsolute,
	join,
	relative,
	resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { parse } from "yaml";

const imageType = /\.(png|jpe?g|webp|avif|gif|svg)$/i;
function inside(root, path) {
	const part = relative(root, path);
	return (
		part !== ".." &&
		!part.startsWith("../") &&
		!part.startsWith("..\\") &&
		!isAbsolute(part)
	);
}

export function importImages({ vault, notePath, text }) {
	const changes = [],
		attachments = new Set(),
		missing = new Set();
	function image(value, start, end, format = "markdown") {
		if (/^(https?:|data:|#)/i.test(value)) return;
		let decoded;
		try {
			decoded = /^file:/i.test(value)
				? fileURLToPath(value)
				: decodeURIComponent(value).replaceAll("\\", "/");
		} catch {
			missing.add(value);
			return;
		}
		if (!imageType.test(decoded)) return;
		const target = resolve(dirname(join(vault, notePath)), decoded);
		// Already-contained attachments stay as authored. Unique wiki names are handled by Obsidian.
		const contained = inside(vault, target);
		if (contained && !isAbsolute(decoded)) return;
		if (!existsSync(target) || !lstatSync(target).isFile()) {
			missing.add(value);
			return;
		}
		let attachment = relative(vault, target).replaceAll("\\", "/");
		if (!contained) {
			const bytes = readFileSync(target);
			const name =
				createHash("sha256").update(bytes).digest("hex") +
				extname(target).toLowerCase();
			attachment = `附件/导入/${name}`;
			mkdirSync(join(vault, "附件/导入"), { recursive: true });
			if (!existsSync(join(vault, attachment)))
				writeFileSync(join(vault, attachment), bytes);
		}
		attachments.add(attachment);
		const url = relative(
			dirname(join(vault, notePath)),
			join(vault, attachment),
		).replaceAll("\\", "/");
		changes.push([
			start,
			end,
			format === "property"
				? JSON.stringify(attachment)
				: format === "wiki"
					? attachment
					: url,
		]);
	}
	const tree = unified().use(remarkParse).parse(text);
	const protectedRanges = [];
	const imageDefinitions = new Set();
	function references(node) {
		if (node.type === "imageReference") imageDefinitions.add(node.identifier);
		for (const child of node.children || []) references(child);
	}
	references(tree);
	function visit(node) {
		if (["code", "inlineCode"].includes(node.type))
			protectedRanges.push([
				node.position.start.offset,
				node.position.end.offset,
			]);
		if (
			node.type === "image" ||
			(node.type === "definition" && imageDefinitions.has(node.identifier))
		) {
			const start = node.position.start.offset,
				segment = text.slice(start, node.position.end.offset);
			// The parser may normalize Windows backslashes; read the author's destination verbatim.
			const match =
				node.type === "image"
					? segment.match(/\]\(<?(.+?)>?(?:\s+["'][^\n]*["'])?\)$/)
					: segment.match(/\]:\s*<?([^\n]+?)>?\s*$/);
			if (match) {
				const offset = segment.indexOf(
					match[1],
					node.type === "image"
						? segment.indexOf("](") + 2
						: segment.indexOf("]:") + 2,
				);
				image(match[1], start + offset, start + offset + match[1].length);
			}
		}
		if (node.type === "html") {
			for (const match of node.value.matchAll(
				/<img\b[^>]*?\bsrc=["']([^"']+)["']/gi,
			)) {
				const start =
					node.position.start.offset + match.index + match[0].indexOf(match[1]);
				image(match[1], start, start + match[1].length);
			}
		}
		for (const child of node.children || []) visit(child);
	}
	visit(tree);
	for (const match of text.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
		if (protectedRanges.some(([a, b]) => match.index >= a && match.index < b))
			continue;
		image(match[1], match.index + 3, match.index + 3 + match[1].length, "wiki");
	}
	const header = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (header) {
		for (const match of header[0].matchAll(
			/^(?:cover|image|photo|avatar|poster|thumbnail):[ \t]*(.+)$/gm,
		)) {
			let value;
			try {
				value = parse(match[1]);
			} catch {
				continue;
			}
			if (typeof value !== "string") continue;
			const start = match.index + match[0].indexOf(match[1]);
			image(value, start, start + match[1].length, "property");
		}
	}
	for (const [start, end, value] of changes.sort((a, b) => b[0] - a[0]))
		text = text.slice(0, start) + value + text.slice(end);
	return {
		text,
		attachments: [...attachments],
		imported: changes.length,
		missing: missing.size,
	};
}

export function importStagedImages(vault) {
	const git = (args) =>
		execFileSync("git", args, {
			cwd: vault,
			encoding: "utf8",
			windowsHide: true,
		});
	const paths = git([
		"diff",
		"--cached",
		"--name-only",
		"--diff-filter=ACM",
		"-z",
	])
		.split("\0")
		.filter((p) => /\.md$/i.test(p));
	let imported = 0,
		missing = 0;
	for (const path of paths) {
		const staged = git(["show", `:${path}`]);
		const full = join(vault, path);
		// Never overwrite unstaged changes or merge conflicts.
		if (
			!existsSync(full) ||
			readFileSync(full, "utf8").replaceAll("\r\n", "\n") !==
				staged.replaceAll("\r\n", "\n")
		)
			continue;
		const result = importImages({ vault, notePath: path, text: staged });
		if (result.imported) {
			writeFileSync(full, result.text);
			git(["add", "--", path, ...result.attachments]);
		}
		imported += result.imported;
		missing += result.missing;
	}
	return { imported, missing };
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const result = importStagedImages(resolve(process.argv[2] || "."));
	if (result.imported)
		console.log(
			`[vault] Imported ${result.imported} local image references into attachments.`,
		);
	if (result.missing)
		console.warn(
			`[vault] ${result.missing} referenced local images are unavailable; restore the original files.`,
		);
}
