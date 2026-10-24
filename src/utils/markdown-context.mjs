import {
	existsSync,
	lstatSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parse } from "yaml";
import { createNoteIndex, walk } from "../plugins/markdown/core/obsidian.mjs";

const indexes = new WeakMap();

export function readMarkdown(source) {
	const match = source
		.replace(/^\uFEFF/, "")
		.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	return {
		properties: match ? parse(match[1]) || {} : {},
		body: match ? source.replace(/^\uFEFF/, "").slice(match[0].length) : source,
	};
}

/** User-owned roots are explicit; no theme-owned files are located via cwd. */
export function loadMarkdownContext(
	file,
	parseSource,
	root = process.cwd(),
	contentRoot = join(root, "src/content"),
) {
	const injected = file.data.astro?.frontmatter?.__markdownContext;
	if (injected?.index) return { ...injected, parse: parseSource };
	const manifest = join(root, ".vault-cache/markdown-index.json");
	const sourcePath =
		typeof file.path === "string" ? file.path.replaceAll("\\", "/") : "";
	if (existsSync(manifest)) {
		const stat = statSync(manifest);
		const stamp = `${manifest}:${stat.mtimeMs}:${stat.size}`;
		let cached = indexes.get(parseSource);
		if (cached?.stamp !== stamp) {
			const data = JSON.parse(readFileSync(manifest, "utf8"));
			cached = {
				stamp,
				data,
				index: createNoteIndex(data.notes, {
					parse: parseSource,
					resolveAsset: (value, origin) =>
						data.assets[`${origin}\0${value}`] || { status: "missing" },
				}),
			};
			indexes.set(parseSource, cached);
		}
		const { data, index } = cached;
		const note = index.entries.find(
			(entry) => entry.output && sourcePath.endsWith(`/${entry.output}`),
		);
		return {
			...injected,
			index,
			current: injected?.current || note?.path || "",
			backlinks: data.backlinks,
			parse: parseSource,
			vault: true,
		};
	}
	const notes = [];
	const visit = (folder) => {
		if (!existsSync(folder)) return;
		for (const entry of readdirSync(folder, { withFileTypes: true })) {
			if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
			const path = join(folder, entry.name);
			if (entry.isDirectory()) visit(path);
			else if (/\.md$/i.test(entry.name)) {
				const { properties, body } = readMarkdown(readFileSync(path, "utf8"));
				const local = relative(contentRoot, path).replaceAll("\\", "/");
				const id = local.replace(/^[^/]+\//, "").replace(/\.md$/, "");
				const url = properties.permalink
					? `/${String(properties.permalink).replace(/^\/+|\/+$/g, "")}/`
					: local.startsWith("posts/")
						? `/posts/${properties.alias || id}/`
						: local.startsWith("moments/")
							? `/moments/#moment-${id}`
							: `/${id.replace(/^media\//, "media/")}/`;
				notes.push({
					path: local,
					output: relative(root, path).replaceAll("\\", "/"),
					title: properties.title || entry.name.slice(0, -3),
					fragmentPrefix: local.startsWith("moments/")
						? `moment-${id}-`
						: undefined,
					properties,
					body: properties.draft ? "" : body,
					public: properties.draft !== true,
					encrypted: Boolean(properties.encrypted || properties.password),
					url,
				});
			}
		}
	};
	visit(contentRoot);
	const index = createNoteIndex(notes, {
		parse: parseSource,
		resolveAsset: (value, origin) => {
			if (/^https?:\/\//i.test(value) || value.startsWith("/"))
				return { status: "valid", url: value };
			const absolute = resolve(contentRoot, origin, "..", value.split("#")[0]);
			const local = relative(contentRoot, absolute);
			if (local.startsWith("..") || /^[A-Z]:/i.test(local))
				return { status: "outside" };
			if (!existsSync(absolute)) return { status: "missing" };
			for (
				let cursor = absolute;
				cursor !== resolve(contentRoot);
				cursor = dirname(cursor)
			)
				if (lstatSync(cursor).isSymbolicLink()) return { status: "outside" };
			const hostRelative = relative(
				sourcePath ? dirname(sourcePath) : contentRoot,
				absolute,
			).replaceAll("\\", "/");
			const suffix =
				value.search(/[?#]/) < 0 ? "" : value.slice(value.search(/[?#]/));
			return {
				status: "valid",
				url:
					(hostRelative.startsWith(".") ? hostRelative : `./${hostRelative}`) +
					suffix,
			};
		},
	});
	const current =
		injected?.current ||
		notes.find((entry) => sourcePath.endsWith(`/${entry.output}`))?.path ||
		"";
	const backlinks = {};
	for (const entry of index.entries.filter(
		(entry) => entry.public !== false && !entry.encrypted,
	)) {
		const targets = new Set();
		walk(entry.tree, (node) => {
			const value = ["obsidianWiki", "obsidianEmbed"].includes(node.type)
				? node.value
				: node.type === "link"
					? node.url
					: undefined;
			if (!value || /^[a-z][a-z\d+.-]*:/i.test(value)) return;
			const resolved = index.resolve(value, entry.path, node.type !== "link");
			if (resolved.status === "valid" && resolved.note.path !== entry.path)
				targets.add(resolved.note.path);
		});
		for (const target of targets) {
			backlinks[target] ??= [];
			backlinks[target].push({ title: entry.title, url: entry.url });
		}
	}
	return { ...injected, index, current, backlinks, parse: parseSource };
}
