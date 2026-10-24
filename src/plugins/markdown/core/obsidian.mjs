import { posix } from "node:path";
import { gemoji } from "gemoji";
import GithubSlugger from "github-slugger";
import { toString as mdastText } from "mdast-util-to-string";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { remarkObsidianSyntax } from "./obsidian-syntax.mjs";

const emojis = new Map(
	gemoji.flatMap(({ names, emoji }) => names.map((name) => [name, emoji])),
);
export const obsidianParser = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkMath)
	.use(remarkDirective)
	.use(remarkObsidianSyntax);
export const text = (value) => ({ type: "text", value });
export const element = (tag, children = [], properties = {}) => ({
	type: "obsidianElement",
	data: { hName: tag, hProperties: properties },
	children,
});
export const clone = (value) => structuredClone(value);
export function walk(node, callback, parent) {
	callback(node, parent);
	for (const child of node.children || []) walk(child, callback, node);
}
export function normalizeProperties(data = {}) {
	const list = (value) =>
		(Array.isArray(value)
			? value
			: typeof value === "string"
				? value.split(/[,\n]/)
				: value == null
					? []
					: [value]
		)
			.map((value) => (typeof value === "string" ? value.trim() : value))
			.filter((value) => value !== "");
	return {
		...data,
		tags: list(data.tags).map((tag) =>
			typeof tag === "string" ? tag.replace(/^#/, "") : tag,
		),
		aliases: list(data.aliases).filter((value) => typeof value === "string"),
		cssclasses: list(data.cssclasses).filter(
			(name) =>
				typeof name === "string" && /^[\p{L}_][\p{L}\p{N}_-]*$/u.test(name),
		),
	};
}

/** Normalize syntax only; never resolve paths or read files here. */
export function normalizeObsidian(
	tree,
	parse = (source) => obsidianParser.parse(source),
) {
	let counter = 0;
	const definitions = [];
	function inline(source) {
		return parse(source).children[0]?.children || [text(source)];
	}
	function children(parent, rawHtml = false) {
		if (
			!parent.children ||
			["code", "inlineCode", "math", "inlineMath", "html"].includes(parent.type)
		)
			return;
		const output = [];
		let html = rawHtml;
		for (const [nodeIndex, originalNode] of parent.children.entries()) {
			let node = originalNode;
			if (node.type === "html") {
				if (/^<\/[a-z]/i.test(node.value)) html = false;
				else if (
					/^<[a-z][^>]*[^/]>$/i.test(node.value) &&
					!/^<(?:br|hr|img|input|source|wbr)\b/i.test(node.value)
				)
					html = true;
				output.push(node);
				continue;
			}
			if (html) {
				if (node.type.startsWith("obsidian")) node = text(rawSyntax(node));
				output.push(node);
				continue;
			}
			if (node.type === "obsidianComment") continue;
			if (node.type === "obsidianInlineFootnote") {
				const identifier = `obsidian-inline-${++counter}`;
				definitions.push({
					type: "footnoteDefinition",
					identifier,
					children: [{ type: "paragraph", children: inline(node.value) }],
				});
				node = { type: "footnoteReference", identifier, label: identifier };
			} else if (["obsidianSub", "obsidianSup"].includes(node.type)) {
				node = element(
					node.type === "obsidianSub" ? "sub" : "sup",
					inline(node.value),
				);
			} else if (node.type === "obsidianMark") {
				const following = parent.children[nodeIndex + 1];
				const suffix =
					following?.type === "text"
						? following.value.match(/^\{\.([a-z]+)\}/i)
						: null;
				if (
					suffix &&
					!["primary", "secondary", "tertiary", "error", "tip"].includes(
						suffix[1],
					)
				)
					node = text(rawSyntax(node));
				else {
					if (suffix) following.value = following.value.slice(suffix[0].length);
					node = {
						type: "textDirective",
						name: "m3-mark",
						attributes: { variant: suffix?.[1] || "primary" },
						children: inline(node.value),
					};
				}
			} else if (
				["obsidianInlineMath", "obsidianDisplayMath"].includes(node.type)
			) {
				const display = node.type === "obsidianDisplayMath";
				node = {
					type: display ? "math" : "inlineMath",
					value: node.value.trim(),
					data: {
						hName: display ? "pre" : "code",
						hProperties: {
							className: [
								"language-math",
								display ? "math-display" : "math-inline",
							],
						},
						hChildren: display
							? [
									{
										type: "element",
										tagName: "code",
										properties: {
											className: ["language-math", "math-display"],
										},
										children: [{ type: "text", value: node.value.trim() }],
									},
								]
							: [{ type: "text", value: node.value.trim() }],
					},
				};
			}
			if (
				node.type === "text" &&
				![
					"link",
					"linkReference",
					"image",
					"imageReference",
					"definition",
				].includes(parent.type)
			) {
				const pattern =
					/:([a-z0-9_+-]+):|(^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_][\p{L}\p{N}_/-]*)/gu;
				let cursor = 0;
				for (const match of node.value.matchAll(pattern)) {
					if (match[1] && !emojis.has(match[1])) continue;
					if (
						!match[1] &&
						match.index === 0 &&
						!match[2] &&
						output.length &&
						!/[\s(]$/.test(mdastText(output.at(-1)))
					)
						continue;
					output.push(text(node.value.slice(cursor, match.index)));
					if (match[1]) output.push(text(emojis.get(match[1])));
					else {
						output.push(text(match[2]));
						output.push({
							type: "link",
							url: `/archive/?tag=${encodeURIComponent(match[3])}`,
							children: [text(`#${match[3]}`)],
							data: {
								hProperties: { className: ["obsidian-tag"] },
								obsidianTag: match[3],
							},
						});
					}
					cursor = match.index + match[0].length;
				}
				if (cursor) {
					output.push(text(node.value.slice(cursor)));
					continue;
				}
			}
			children(node);
			output.push(node);
		}
		parent.children = output.filter(
			(node) =>
				node.type !== "paragraph" ||
				node.children.some(
					(child) => child.type !== "text" || child.value.trim(),
				),
		);
	}
	children(tree);
	tree.children.push(...definitions);
	return tree;
}

function rawSyntax(node) {
	const delimiters = {
		obsidianWiki: ["[[", "]]"],
		obsidianEmbed: ["![[", "]]"],
		obsidianComment: ["%%", "%%"],
		obsidianSub: ["~", "~"],
		obsidianSup: ["^", "^"],
		obsidianMark: ["==", "=="],
		obsidianInlineFootnote: ["^[", "]"],
		obsidianInlineMath: ["\\(", "\\)"],
		obsidianDisplayMath: ["\\[", "\\]"],
	};
	const [a, b] = delimiters[node.type] || ["", ""];
	return a + node.value + b;
}

export function prepareNote(
	source,
	parse = (value) => obsidianParser.parse(value),
) {
	const tree = normalizeObsidian(
		typeof source === "string" ? parse(source) : source,
		parse,
	);
	const definitions = new Map();
	walk(tree, (node) => {
		if (node.type === "definition") definitions.set(node.identifier, node);
	});
	walk(tree, (node) => {
		if (
			["linkReference", "imageReference"].includes(node.type) &&
			definitions.has(node.identifier)
		) {
			const definition = definitions.get(node.identifier);
			node.type = node.type === "imageReference" ? "image" : "link";
			node.url = definition.url;
			node.title = definition.title;
		}
	});
	function removeDefinitions(parent) {
		if (parent.children) {
			parent.children = parent.children.filter(
				(node) => node.type !== "definition",
			);
			parent.children.forEach(removeDefinitions);
		}
	}
	removeDefinitions(tree);
	const slugger = new GithubSlugger();
	const headings = [];
	const blocks = new Map();

	function identify(parent) {
		for (let index = 0; index < (parent.children || []).length; index++) {
			const node = parent.children[index];
			const last = node.children?.at(-1);
			if (
				["paragraph", "heading"].includes(node.type) &&
				last?.type === "text"
			) {
				const match = last.value.match(/(?:^|\s)\^([A-Za-z0-9-]+)\s*$/);
				if (match) {
					last.value = last.value.slice(0, match.index).trimEnd();
					let target = node;
					if (
						node.children.every(
							(child) => child.type === "text" && !child.value.trim(),
						) &&
						index
					) {
						target = parent.children[index - 1];
						parent.children.splice(index--, 1);
					} else if (parent.type === "listItem" || parent.type === "blockquote")
						target = parent;
					const id = `block-${match[1]}`;
					if (!blocks.has(match[1])) {
						target.data = {
							...target.data,
							hProperties: { ...target.data?.hProperties, id },
						};
						blocks.set(match[1], target);
					}
				}
			}
			identify(node);
		}
	}
	identify(tree);
	walk(tree, (node, parent) => {
		if (node.type === "heading") {
			const headingText = (child) =>
				child.type === "obsidianWiki"
					? splitTarget(child.value).label || splitTarget(child.value).name
					: child.children
						? child.children.map(headingText).join("")
						: child.value || "";
			const title = headingText(node);
			const id = slugger.slug(title);
			if (node.data?.hProperties?.id?.startsWith("block-"))
				node.children.push(
					element("span", [], { id: node.data.hProperties.id }),
				);
			node.data = {
				...node.data,
				hProperties: { ...node.data?.hProperties, id },
			};
			headings.push({ title, id, depth: node.depth, node, parent });
		}
	});
	const anchors = new Map();
	walk(tree, (node) => {
		if (node.data?.hProperties?.id) anchors.set(node.data.hProperties.id, node);
		if (node.attributes?.id) anchors.set(node.attributes.id, node);
		if (node.type === "html")
			for (const match of node.value.matchAll(/\bid=["']([^"']+)["']/gi))
				anchors.set(match[1], node);
	});
	return { tree, headings, blocks, anchors };
}

export function splitTarget(value) {
	const separator = value.indexOf("|");
	const target = (separator < 0 ? value : value.slice(0, separator)).trim();
	const label = separator < 0 ? "" : value.slice(separator + 1).trim();
	const hash = target.indexOf("#");
	return {
		name: hash < 0 ? target : target.slice(0, hash),
		fragment: hash < 0 ? "" : target.slice(hash + 1),
		label,
	};
}

/** Vault publication cannot import arbitrary workspace source files. */
export function disableFileImports(source) {
	const tree = obsidianParser.parse(source);
	const ranges = [];
	walk(tree, (node) => {
		if (
			(node.type === "html" && /@include\s*:/i.test(node.value)) ||
			(node.name === "code-tree" && node.attributes?.dir) ||
			(node.type === "paragraph" &&
				/^@\s*\[\s*code-tree\b/i.test(
					source.slice(node.position.start.offset, node.position.end.offset),
				))
		)
			ranges.push([node.position.start.offset, node.position.end.offset]);
	});
	let output = source;
	for (const [start, end] of ranges.sort((a, b) => b[0] - a[0]))
		output = `${output.slice(0, start)}![[file:///unavailable]]${output.slice(end)}`;
	return output;
}

export function stripObsidianComments(source) {
	const ranges = [];
	walk(obsidianParser.parse(source), (node) => {
		if (node.type === "obsidianComment")
			ranges.push([node.position.start.offset, node.position.end.offset]);
	});
	let output = source;
	for (const [start, end] of ranges.sort((a, b) => b[0] - a[0]))
		output = output.slice(0, start) + output.slice(end);
	return output;
}
export function safeReference(value) {
	let decoded;
	try {
		decoded = decodeURIComponent(value.replace(/%(?![a-f\d]{2})/gi, "%25"))
			.normalize("NFC")
			.replaceAll("\\", "/");
	} catch {
		return { status: "missing" };
	}
	if (
		/^[a-z][a-z\d+.-]*:/i.test(decoded) ||
		decoded.startsWith("//") ||
		decoded.includes("\0")
	)
		return { status: "outside" };
	return { status: "valid", value: decoded };
}

export function createNoteIndex(notes = [], { parse, resolveAsset } = {}) {
	const entries = notes.map((note) => ({
		...note,
		path: note.path.normalize("NFC").replaceAll("\\", "/"),
		properties: normalizeProperties(note.properties),
		...(note.public !== false && !note.encrypted
			? prepareNote(note.body || "", parse)
			: {}),
	}));
	const paths = new Map(
		entries.map((entry) => [entry.path.replace(/\.mdx?$/i, ""), entry]),
	);
	function resolve(value, origin = "", wiki = true) {
		const parts = splitTarget(value);
		const safe = safeReference(parts.name);
		if (safe.status !== "valid") return { ...parts, status: safe.status };
		const name = safe.value.replace(/\.mdx?$/i, "");
		const current = paths.get(origin.replace(/\.mdx?$/i, ""));
		if (!name)
			return current ? select(current, parts) : { ...parts, status: "missing" };
		const local = posix.normalize(posix.join(posix.dirname(origin), name));
		if (
			(name.startsWith(".") || !wiki) &&
			(local === ".." || local.startsWith("../"))
		)
			return { ...parts, status: "outside" };
		if (name.startsWith("/")) {
			const found = paths.get(name.slice(1));
			return found ? select(found, parts) : { ...parts, status: "missing" };
		}
		if (name.startsWith(".")) {
			const found = paths.get(local);
			return found ? select(found, parts) : { ...parts, status: "missing" };
		}
		const found =
			(wiki && name.includes("/") ? paths.get(name) : paths.get(local)) ||
			paths.get(name);
		if (found) return select(found, parts);
		const matches = entries.filter(
			(entry) =>
				entry.path.replace(/\.mdx?$/i, "").endsWith(`/${name}`) ||
				posix.basename(entry.path).replace(/\.mdx?$/i, "") === name ||
				entry.title === name ||
				entry.properties.aliases.includes(name),
		);
		return matches.length === 1
			? select(matches[0], parts)
			: { ...parts, status: matches.length ? "ambiguous" : "missing" };
	}
	function select(note, parts) {
		if (note.public === false) return { ...parts, status: "unpublished" };
		if (note.encrypted)
			return { ...parts, status: "valid", note, nodes: [], url: note.url };
		let fragment;
		try {
			fragment = decodeURIComponent(parts.fragment);
		} catch {
			return { ...parts, status: "missing" };
		}
		let nodes = note.tree?.children || [];
		let id = "";
		if (fragment.startsWith("^")) {
			const block = note.blocks?.get(fragment.slice(1));
			if (!block)
				return {
					...parts,
					status: note.encrypted ? "protected" : "missing",
					note,
					url: note.url,
				};
			nodes = [block];
			id = `block-${fragment.slice(1)}`;
		} else if (
			fragment &&
			note.anchors?.has(fragment) &&
			!note.headings.some((heading) => heading.id === fragment)
		) {
			nodes = [note.anchors.get(fragment)];
			id = fragment;
		} else if (fragment) {
			const hierarchy = fragment.split("#");
			let start = -1;
			let end = note.headings?.length || 0;
			let selected;
			for (const part of hierarchy) {
				const offset = note.headings?.findIndex(
					(heading, index) =>
						index > start &&
						index < end &&
						(heading.title === part || heading.id === part),
				);
				if (offset === undefined || offset < 0)
					return {
						...parts,
						status: note.encrypted ? "protected" : "missing",
						note,
						url: note.url,
					};
				selected = note.headings[offset];
				start = offset;
				end = note.headings.findIndex(
					(heading, index) => index > start && heading.depth <= selected.depth,
				);
				if (end < 0) end = note.headings.length;
			}
			id = selected.id;
			const siblings = selected.parent?.children || note.tree.children;
			const begin = siblings.indexOf(selected.node);
			const stop = siblings.findIndex(
				(node, index) =>
					index > begin &&
					node.type === "heading" &&
					node.depth <= selected.depth,
			);
			nodes = siblings.slice(begin, stop < 0 ? undefined : stop);
		}
		return {
			...parts,
			status: "valid",
			note,
			nodes,
			id,
			url: id
				? `${note.url.split("#")[0]}#${encodeURIComponent((note.fragmentPrefix || "") + id)}`
				: note.url,
		};
	}
	return { entries, paths, resolve, resolveAsset };
}
