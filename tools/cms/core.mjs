import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	readFileSync,
	readdirSync,
	mkdirSync,
	writeFileSync,
	rmSync,
	copyFileSync,
	statSync,
} from "node:fs";
import { join, resolve, relative, dirname, posix } from "node:path";
import { parse, stringify } from "yaml";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { domains, folderFor } from "./model.mjs";
import adapters from "./adapters.json" with { type: "json" };

export const STATE = "cms/publication-state.json";
const metadata = new Set([
	"cmsId",
	"draft",
	"visible",
	"order",
	"publishAt",
	"unpublishAt",
]);
export function files(root) {
	if (!existsSync(root)) return [];
	return readdirSync(root, { withFileTypes: true })
		.filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
		.flatMap((e) =>
			e.isDirectory() ? files(join(root, e.name)) : [join(root, e.name)],
		);
}
export function readNote(text) {
	const m = text
		.replace(/^\uFEFF/, "")
		.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	return {
		data: m ? parse(m[1]) || {} : {},
		body: m ? text.slice(m[0].length) : text,
	};
}
export function noteText(data, body = "") {
	return `---\n${stringify(data, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.replace(/^\n+/, "")}`;
}
export function instant(value, label = "时间") {
	if (value === undefined || value === null || value === "") return null;
	let text = String(value);
	const date = text.match(/^(\d{4})-(\d\d)-(\d\d)/);
	if (
		date &&
		new Date(Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3])))
			.toISOString()
			.slice(0, 10) !== date[0]
	)
		throw new Error(`${label}日期无效`);
	if (/^\d{4}-\d\d-\d\d$/.test(text)) text += "T00:00:00+08:00";
	else if (/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(text)) text += "+08:00";
	if (!/^\d{4}-\d\d-\d\dT/.test(text) || !Number.isFinite(Date.parse(text)))
		throw new Error(`${label}格式无效`);
	return new Date(text).toISOString();
}
export function visible(data, time) {
	const start = instant(data.publishAt),
		end = instant(data.unpublishAt);
	return (
		data.draft !== true &&
		data.visible !== false &&
		(!start || start <= time) &&
		(!end || end > time)
	);
}
export function readRecords(root) {
	const records = [];
	for (const domain of Object.keys(domains))
		for (const file of files(join(root, folderFor(domain))).filter((p) =>
			/\.md$/.test(p),
		)) {
			const note = readNote(readFileSync(file, "utf8"));
			records.push({
				...note,
				domain,
				path: relative(root, file).replaceAll("\\", "/"),
				file,
			});
		}
	return records;
}
export function validate(records) {
	const seen = new Set();
	for (const r of records) {
		const key =
			r.data.cmsId || `${r.domain}:${r.data.key ?? r.data.id ?? r.path}`;
		if (seen.has(key)) throw new Error(`标识重复：${r.path}`);
		seen.add(key);
		for (const [field, [label, type, required, values]] of Object.entries({
			...domains[r.domain].fields,
			order: ["排序", "number"],
			draft: ["草稿", "boolean"],
			visible: ["显示", "boolean"],
		})) {
			const value = r.data[field];
			if (required && (value === undefined || value === null || value === ""))
				throw new Error(`${r.path}：请填写${label}`);
			if (value === undefined || value === null || value === "") continue;
			if (
				type === "number" &&
				(typeof value !== "number" || !Number.isFinite(value))
			)
				throw new Error(`${r.path}：${label}必须为数字`);
			if (type === "boolean" && typeof value !== "boolean")
				throw new Error(`${r.path}：${label}必须为开关`);
			if (
				["text", "textarea", "url", "image", "date", "datetime"].includes(
					type,
				) &&
				typeof value !== "string"
			)
				throw new Error(`${r.path}：${label}必须为文字`);
			if (
				type === "tags" &&
				(!Array.isArray(value) || value.some((v) => typeof v !== "string"))
			)
				throw new Error(`${r.path}：${label}必须为文字列表`);
			if (values && !values.includes(value))
				throw new Error(`${r.path}：${label}选项无效`);
		}
		const start = instant(r.data.publishAt),
			end = instant(r.data.unpublishAt);
		if (start && end && end <= start)
			throw new Error(`${r.path}：下线时间必须晚于发布时间`);
		if (r.data.encrypted && !String(r.data.password || "").trim())
			throw new Error(`${r.path}：请设置访问密码`);
		if (
			r.domain === "media" &&
			r.data.rating !== undefined &&
			(r.data.rating < 0 || r.data.rating > 10)
		)
			throw new Error(`${r.path}：评分须为 0–10`);
		if (
			r.domain === "albums" &&
			r.data.columns !== undefined &&
			![2, 3, 4].includes(r.data.columns)
		)
			throw new Error(`${r.path}：相册列数须为 2、3 或 4`);
		if (
			["posts", "moments"].includes(r.domain) &&
			!/^\d{4}-\d\d-\d\d$/.test(String(r.data.published))
		)
			throw new Error(`${r.path}：发布日期须为 YYYY-MM-DD`);
	}
	for (const domain of ["categories", "tags", "series"]) {
		const list = records.filter((r) => r.domain === domain),
			byKey = new Map();
		for (const r of list) {
			if (byKey.has(r.data.key)) throw new Error(`${domain} 标识重复`);
			byKey.set(r.data.key, r);
		}
		if (domain === "categories")
			for (const r of list) {
				const chain = new Set([r.data.key]);
				let parent = r.data.parent;
				while (parent) {
					if (chain.has(parent)) throw new Error("分类层级存在循环");
					chain.add(parent);
					const p = byKey.get(parent);
					if (!p) throw new Error(`父分类不存在：${r.path}`);
					parent = p.data.parent;
				}
			}
	}
	const cats = new Set(
		records.filter((r) => r.domain === "categories").map((r) => r.data.key),
	);
	const series = new Set(
		records.filter((r) => r.domain === "series").map((r) => r.data.key),
	);
	for (const r of records.filter((r) => r.domain === "posts")) {
		if (cats.size && r.data.category && !cats.has(r.data.category))
			throw new Error(`${r.path}：分类不存在`);
		if (r.data.series && !series.has(r.data.series))
			throw new Error(`${r.path}：系列不存在`);
	}
	return records;
}
export function schedule(records) {
	return [
		...new Set(
			records
				.flatMap((r) => [
					instant(r.data.publishAt),
					instant(r.data.unpublishAt),
				])
				.filter(Boolean),
		),
	].sort();
}
export function publicationState(
	records,
	evaluatedAt = new Date().toISOString(),
) {
	const transitions = schedule(records);
	return {
		schemaVersion: 1,
		evaluatedAt: instant(evaluatedAt),
		transitions,
		scheduleHash: createHash("sha256")
			.update(JSON.stringify(transitions))
			.digest("hex"),
	};
}
export function refreshState(root, now = new Date().toISOString()) {
	const records = validate(readRecords(root));
	const state = publicationState(records, now);
	write(join(root, STATE), JSON.stringify(state, null, 2) + "\n");
	return state;
}
function write(path, text) {
	mkdirSync(dirname(path), { recursive: true });
	if (!existsSync(path) || readFileSync(path, "utf8") !== text)
		writeFileSync(path, text);
}
function safe(root, path) {
	const resolved = resolve(root, path);
	if (
		!resolved.startsWith(resolve(root) + posix.sep) &&
		!resolved.startsWith(resolve(root) + "\\")
	)
		throw new Error("路径超出博客库");
	return resolved;
}
function cleanData(r) {
	return Object.fromEntries(
		Object.entries(r.data).filter(([k]) => !metadata.has(k)),
	);
}
export function compileCms({
	sourceRoot,
	root,
	production = false,
	dryRun = false,
	previewAt,
}) {
	const manifestPath = join(sourceRoot, "cms/manifest.json");
	if (!existsSync(manifestPath)) return null;
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	const records = validate(readRecords(sourceRoot));
	const state = JSON.parse(readFileSync(join(sourceRoot, STATE), "utf8"));
	const expected = publicationState(records, state.evaluatedAt);
	if (
		state.schemaVersion !== 1 ||
		state.scheduleHash !== expected.scheduleHash ||
		JSON.stringify(state.transitions) !== JSON.stringify(expected.transitions)
	)
		throw new Error("发布计划已改变，请在 Obsidian 中同步，或运行 cms:state");
	const time = instant(
		previewAt ||
			process.env.CMS_PREVIEW_AT ||
			(production ? state.evaluatedAt : new Date().toISOString()),
	);
	const at = previewAt || process.env.CMS_PREVIEW_AT;
	const active = (r) =>
		production
			? visible(r.data, time)
			: !at || visible({ ...r.data, draft: false }, time);
	const sorted = records
		.filter(active)
		.sort(
			(a, b) =>
				(a.data.order ?? 0) - (b.data.order ?? 0) ||
				a.path.localeCompare(b.path),
		);
	const outputs = new Map();
	const output = (path, text) => outputs.set(path, text);
	const assetPaths = new Set();
	function asset(value) {
		if (typeof value !== "string") return value;
		const marker = "cms/media/";
		const p = value.replace(/^\/?/, "");
		if (!p.startsWith(marker)) return value;
		const original = safe(sourceRoot, p);
		if (!existsSync(original) || !statSync(original).isFile())
			throw new Error(`图片不存在：${p}`);
		if (!/\.(png|jpe?g|webp|avif|gif|svg)$/i.test(p))
			throw new Error("不支持的图片类型");
		assetPaths.add(p);
		return `/images/cms/${p.slice(marker.length)}`;
	}
	function mapAssets(v) {
		if (typeof v === "string") return asset(v);
		if (Array.isArray(v)) return v.map(mapAssets);
		if (v && typeof v === "object")
			return Object.fromEntries(
				Object.entries(v).map(([k, x]) => [k, mapAssets(x)]),
			);
		return v;
	}
	const noteTargets = new Map();
	for (const r of records.filter(
		(r) => ["posts", "moments"].includes(r.domain) && active(r),
	)) {
		const url =
			r.domain === "posts"
				? r.data.permalink
					? "/" + r.data.permalink.replace(/^\/+|\/+$/g, "") + "/"
					: `/posts/${
							r.data.alias ||
							r.path
								.replace(/^content\/posts\//, "")
								.replace(/\.md$/, "")
								.replace(/\/index$/, "")
						}/`
				: "/moments/";
		for (const key of [
			r.path.replace(/\.md$/, ""),
			r.path.split("/").at(-1).replace(/\.md$/, ""),
			r.data.title,
		].filter(Boolean)) {
			const existing = noteTargets.get(key);
			noteTargets.set(
				key,
				noteTargets.has(key) && existing !== url ? null : url,
			);
		}
	}
	function wiki(body, path) {
		function outsideCode(text, pattern, replace) {
			const ranges = [];
			const visit = (node) => {
				if (node.type === "code" || node.type === "inlineCode") {
					ranges.push([node.position.start.offset, node.position.end.offset]);
					return;
				}
				for (const child of node.children || []) visit(child);
			};
			visit(unified().use(remarkParse).parse(text));
			return text.replace(pattern, (...args) =>
				ranges.some(([start, end]) => args.at(-2) >= start && args.at(-2) < end)
					? args[0]
					: replace(...args),
			);
		}
		const linked = outsideCode(
			body,
			/(!?)\[\[([^\]]+)\]\]/g,
			(_m, embed, inside) => {
				const [target, alias] = inside.split("|");
				const [name, anchor] = target.split("#");
				if (embed) {
					const options = [
						name,
						`cms/media/${name}`,
						posix.normalize(posix.join(posix.dirname(path), name)),
					];
					const found = options.find((p) => existsSync(safe(sourceRoot, p)));
					if (!found || !found.startsWith("cms/media/"))
						throw new Error(`${path}：图片嵌入无法解析，请从 CMS 图片库选择`);
					return `![${alias || posix.basename(name)}](${asset(found)})`;
				}
				const url = noteTargets.get(name.replace(/\.md$/, ""));
				if (!url) throw new Error(`${path}：内部链接不存在或重名`);
				return `[${alias || name}](${url}${anchor ? "#" + encodeURIComponent(anchor) : ""})`;
			},
		);
		return outsideCode(
			linked,
			/(!\[[^\]]*\]\()\/?(cms\/media\/[^)]+)(\))/g,
			(_m, a, p, z) => a + asset(p) + z,
		);
	}
	for (const r of records.filter((r) =>
		["posts", "moments"].includes(r.domain),
	)) {
		if (!active(r)) {
			output(`src/${r.path}`, null);
			continue;
		}
		output(`src/${r.path}`, noteText(mapAssets(r.data), wiki(r.body, r.path)));
	}
	const data = { categories: [], tags: [], series: [], media: [] };
	for (const domain of Object.keys(data))
		data[domain] = sorted
			.filter((r) => r.domain === domain)
			.map((r) => mapAssets(cleanData(r)));
	output("src/user/cms-data.json", JSON.stringify(data, null, 2) + "\n");
	for (const [file, adapter] of Object.entries(adapters)) {
		const fileDomains = Object.keys(domains).filter(
			(d) => (domains[d].file || d) === file && domains[d].exports,
		);
		if (!fileDomains.some((d) => manifest.managed.includes(d))) continue;
		let text = adapter;
		for (const d of fileDomains)
			for (const exp of domains[d].exports) {
				text = text.replace(
					`__CMS_${exp}__`,
					JSON.stringify(
						sorted
							.filter((r) => r.domain === d)
							.map((r) => mapAssets(cleanData(r))),
						null,
						2,
					),
				);
			}
		output(`src/data/${file}.ts`, text);
	}
	const configRoot = join(root, ".cms-cache");
	for (const path of files(join(sourceRoot, "config"))) {
		const rel = relative(join(sourceRoot, "config"), path).replaceAll(
			"\\",
			"/",
		);
		output(`.cms-cache/config/${rel}`, readFileSync(path, "utf8"));
	}
	if (manifest.managed.includes("announcements")) {
		const path = join(sourceRoot, "config/announcement.yaml");
		const original = existsSync(path)
			? parse(readFileSync(path, "utf8")) || {}
			: {};
		const items = sorted
			.filter((r) => r.domain === "announcements")
			.map((r) => mapAssets(cleanData(r)));
		output(
			".cms-cache/config/announcement.yaml",
			stringify({
				...original,
				board: {
					...original.board,
					enable: original.board?.enable ?? items.length > 0,
					items,
				},
			}),
		);
	}
	if (manifest.managed.includes("albums"))
		for (const r of records.filter((r) => r.domain === "albums")) {
			if (!/^[a-zA-Z0-9_-]+$/.test(r.data.key))
				throw new Error("相册标识只允许字母、数字、短横线和下划线");
			const target = `public/images/albums/${r.data.key}/info.json`;
			output(
				target,
				active(r)
					? JSON.stringify(
							{
								...mapAssets(cleanData(r)),
								mode: "external",
								columns: r.data.columns || 3,
								layout: r.data.layout || "masonry",
								photos: mapAssets(r.data.photos || []),
							},
							null,
							2,
						) + "\n"
					: null,
			);
		}
	if (!dryRun) {
		// Only this cache is owned by the CMS compiler. Originals remain untouched.
		rmSync(configRoot, { recursive: true, force: true });
		const previousPath = join(root, ".cms-cache-files.json");
		const previous = existsSync(previousPath)
			? JSON.parse(readFileSync(previousPath, "utf8"))
			: [];
		const next = [
			...outputs.keys(),
			...[...assetPaths].map(
				(p) => "public/images/cms/" + p.slice("cms/media/".length),
			),
		];
		for (const p of previous)
			if (!next.includes(p)) rmSync(safe(root, p), { force: true });
		for (const [p, text] of outputs) {
			const dest = safe(root, p);
			if (text === null) rmSync(dest, { force: true });
			else write(dest, text);
		}
		for (const p of assetPaths) {
			const dest = safe(
				root,
				"public/images/cms/" + p.slice("cms/media/".length),
			);
			mkdirSync(dirname(dest), { recursive: true });
			copyFileSync(safe(sourceRoot, p), dest);
		}
		write(previousPath, JSON.stringify(next) + "\n");
		const generated = [...outputs.keys()]
			.filter(
				(p) => p.startsWith("src/data/") || p === "src/user/cms-data.json",
			)
			.map((p) => safe(root, p));
		const biome = join(root, "node_modules/@biomejs/biome/bin/biome");
		if (generated.length && existsSync(biome))
			execFileSync(
				process.execPath,
				[biome, "check", "--write", ...generated],
				{ cwd: root, stdio: "pipe", windowsHide: true },
			);
	}
	return { configRoot, records: records.length, time, outputs };
}
