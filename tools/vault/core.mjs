import { expandReferences } from "../../src/plugins/markdown/core/obsidian-references.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative } from "node:path";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parse, stringify } from "yaml";
import { files } from "./files.mjs";
import { domains } from "./model.mjs";
import { materializeVault } from "./outputs.mjs";
import { createResources } from "./resources.mjs";
import { clone, createNoteIndex, disableFileImports, normalizeProperties, prepareNote, stripObsidianComments, walk } from "../../src/plugins/markdown/core/obsidian.mjs";
import { normalizeNoteProperties } from "./properties.mjs";

export { files } from "./files.mjs";

import { displayTime, instant, normalizeTime, shanghaiDate } from "./time.mjs";

const markdownParser = unified().use(remarkParse);

export { instant } from "./time.mjs";

import adapters from "./adapters.json" with { type: "json" };

export const types = Object.freeze({
	article: "posts",
	moment: "moments",
	movie: "media",
	book: "media",
	media: "media",
	device: "devices",
	project: "projects",
	friend: "friends",
	link: "links",
	category: "categories",
	tag: "tags",
	series: "series",
	announcement: "announcements",
	album: "albums",
	skill: "skills",
	timeline: "timeline",
	anime: "anime",
	page: "pages",
	aboutTechGroup: "aboutTechGroups",
	aboutMilestone: "aboutMilestones",
	aboutSocialLink: "aboutSocialLinks",
});
const metadata = new Set([
	"cmsId",
	"type",
	"publish",
	"passwordSecret",
	"slug",
	"draft",
	"visible",
	"order",
	"publishAt",
	"unpublishAt",
	"hidden",
	"enable",
	"home",
]);
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
	let yaml = stringify(data, { lineWidth: 0 }).trimEnd();
	if (data.displayDate !== undefined)
		yaml = yaml.replace(
			/^displayDate:.*$/m,
			`displayDate: ${JSON.stringify(data.displayDate)}`,
		);
	return `---\n${yaml}\n---\n\n${body.replace(/^\n+/, "")}`;
}
export function visible(data, time) {
	if (data.publish !== true || data.draft === true || data.visible === false)
		return false;
	const start = instant(data.publishAt);
	const end = instant(data.unpublishAt);
	return (!start || start <= time) && (!end || end > time);
}
/** Only explicit types opt into the build schema; ordinary notes remain ordinary notes. */
export function readRecords(root, inventory = files(root)) {
	const records = [];
	for (const file of inventory.filter((p) => /\.md$/i.test(p))) {
		let note;
		const authored = readFileSync(file, "utf8");
		try {
			note = readNote(authored);
		} catch {
			const header =
				authored
					.replace(/^\uFEFF/, "")
					.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || "";
			if (/\bpublish\s*:\s*true\b/.test(header))
				throw new Error(
					"A public note contains invalid YAML. Fix its Properties before publishing.",
				);
			continue;
		}
		const domain = Object.hasOwn(types, note.data.type)
			? types[note.data.type]
			: undefined;
		if (!domain) continue;
		if (note.data.publish === true) note.body = stripObsidianComments(note.body);
		const path = relative(root, file).replaceAll("\\", "/");
		const data = normalizeNoteProperties(normalizeProperties(note.data), domain);
		if (data.publish === true && ["posts", "moments"].includes(domain)) {
			const tags = new Set(data.tags || []);
			walk(prepareNote(note.body).tree, (node) => { if (node.data?.obsidianTag) tags.add(node.data.obsidianTag); });
			data.tags = [...tags];
		}
		const authoredDate = data.date ?? data.publishedAt ?? data.published;
		const name = posix.basename(path, ".md");
		data.title ??= name;
		data.key ??= data.slug || data.id || name;
		const slug = (value) =>
			String(value)
				.normalize("NFC")
				.trim()
				.replace(/[^\p{L}\p{N}_./-]+/gu, "-")
				.replace(/^-+|-+$/g, "") ||
			createHash("sha256").update(path).digest("hex").slice(0, 16);
		if (["media", "albums"].includes(domain))
			data.key = slug(data.key).replaceAll("/", "-").replaceAll(".", "-");
		let createdDate;
		const creationDate = () => {
			if (createdDate) return createdDate;
			if (data.created) {
				createdDate = normalizeTime(data.created, `${path}：创建日期`).slice(
					0,
					10,
				);
				return createdDate;
			}
			let created;
			try {
				created = execFileSync(
					"git",
					["log", "--follow", "--diff-filter=A", "--format=%aI", "--", path],
					{ cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
				)
					.trim()
					.split("\n")
					.at(-1);
			} catch {
				/* Uncommitted offline notes use their local creation time. */
			}
			createdDate = shanghaiDate(created || statSync(file).birthtime);
			return createdDate;
		};
		if (["posts", "moments"].includes(domain)) {
			if (data.date !== undefined) data.published = data.date || undefined;
			if (!data.published) {
				data.published =
					data.publish === true
						? data.publishAt
							? normalizeTime(
									data.publishAt,
									`${path}：发布时间`,
									creationDate,
								).slice(0, 10)
							: creationDate()
						: String(
								data.created || statSync(file).birthtime.toISOString(),
							).slice(0, 10);
			}
			data.alias ??= slug(data.slug || data.id || name);
			if (domain === "posts") data.image ??= data.cover ?? "";
		}
		if (data.publish === true) {
			if (data.published) {
				const published = normalizeTime(
					data.published,
					`${path}：发布日期`,
					creationDate,
				);
				if (domain === "posts") {
					data.published = published.includes("T")
						? shanghaiDate(published)
						: published;
					if (published.includes("T")) data.publishedAt ||= published;
				} else data.published = published;
			}
			const referenceDate = () =>
				data.published?.slice(0, 10) || creationDate();
			const dateFields = [
				"publishAt",
				"unpublishAt",
				"publishedAt",
				"updatedAt",
				"updated",
			];
			if (domains[domain]?.fields?.date?.[1] === "date")
				dateFields.push("date");
			for (const field of dateFields) {
				if (data[field] === undefined) continue;
				if (data[field] === "" || data[field] === null) {
					delete data[field];
					continue;
				}
				data[field] = normalizeTime(
					data[field],
					`${path}：${field}`,
					field === "updatedAt" && data.updated
						? () => normalizeTime(data.updated).slice(0, 10)
						: referenceDate,
				);
			}
			if (["posts", "moments"].includes(domain)) {
				data.displayDate = authoredDate
					? displayTime(
							normalizeTime(authoredDate, `${path}：date`, creationDate),
						)
					: "";
				delete data.updated;
				delete data.updatedAt;
			}
		}
		if (["movie", "book"].includes(data.type)) data.kind ??= data.type;
		if (domain === "devices") {
			data.id ??= data.key;
			data.name ??= data.title;
			data.brand ??= "";
			data.category ??= "other";
			data.status ??= "active";
			data.specs ??= data.model || "";
			data.description = note.body.trim() || data.description || "";
			data.image ??= data.photo || data.cover;
		}
		if (domain === "projects") {
			data.summary = note.body.trim() || data.summary || "";
			data.category ??= "other";
			data.phase ??= "building";
			data.technologies ??= [];
		}
		if (domain === "friends") {
			data.id ??= Number.parseInt(
				createHash("sha256").update(String(data.key)).digest("hex").slice(0, 8),
				16,
			);
			data.siteurl ??= data.url;
			data.imgurl ??= data.cover || "";
			data.desc = note.body.trim() || data.desc || "";
			data.tags ??= [];
		}
		if (domain === "announcements") {
			data.content = note.body.trim() || data.content || "";
			if (typeof data.link === "string")
				data.link = data.link
					? { url: data.link, text: data.title }
					: undefined;
			if (data.link)
				data.link = {
					...data.link,
					url: data.link.url || data.link.href || "",
					text: data.link.text || data.link.label || data.title,
				};
		}
		if (["skills", "timeline", "anime"].includes(domain))
			data.description = note.body.trim() || data.description || "";
		if (domain === "media") data.description ??= note.body.trim();
		if (domain === "media") {
			data.creator ??= data.director || data.author;
			if (data.year !== undefined) data.year = String(data.year);
		}
		if (domain === "albums") {
			const images = [];
			const ranges = [];
			const visit = (node) => {
				if (["code", "inlineCode"].includes(node.type))
					ranges.push([node.position.start.offset, node.position.end.offset]);
				if (node.type === "image")
					images.push({
						src: node.url,
						alt: node.alt || "",
						offset: node.position.start.offset,
					});
				for (const child of node.children || []) visit(child);
			};
			visit(markdownParser.parse(note.body));
			for (const m of note.body.matchAll(/!\[\[([^\]]+)\]\]/g)) {
				if (ranges.some(([a, b]) => m.index >= a && m.index < b)) continue;
				const [src, alt] = m[1].split("|");
				images.push({
					src,
					alt: alt && !/^\d+(?:x\d+)?$/.test(alt) ? alt : "",
					offset: m.index,
				});
			}
			if (images.length)
				data.photos = images
					.sort((a, b) => a.offset - b.offset)
					.map(({ offset, ...image }) => ({
						...data.photos?.find?.((old) => old.src === image.src),
						...image,
					}));
			data.description =
				note.body
					.replace(/!\[\[[^\]]+\]\]/g, "")
					.replace(/!\[[^\]]*\]\([^)]+\)/g, "")
					.trim() ||
				data.description ||
				"";
		}
		if (data.passwordSecret && data.publish === true) {
			if (!/^[A-Z][A-Z0-9_]+$/.test(data.passwordSecret))
				throw new Error("Invalid password secret reference");
			let passwords;
			try {
				passwords = JSON.parse(process.env.VAULT_PASSWORDS || "{}");
			} catch {
				throw new Error("The encryption secret map is not valid JSON");
			}
			data.password =
				process.env[data.passwordSecret] || passwords[data.passwordSecret];
			if (!data.password)
				throw new Error(
					"A public note references an unavailable encryption secret",
				);
		}
		records.push({ ...note, data, domain, path, file });
	}
	return records;
}
export function validate(input) {
	const records = input.filter((r) => r.data.publish === true);
	const seen = new Set();
	for (const r of records) {
		const key =
			r.data.cmsId || `${r.domain}:${r.data.key ?? r.data.id ?? r.path}`;
		if (seen.has(key)) throw new Error(`标识重复：${r.path}`);
		seen.add(key);
		for (const [field, [label, type, required, values]] of Object.entries({
			...(domains[r.domain]?.fields || {}),
			order: ["排序", "number"],
			draft: ["草稿", "boolean"],
			visible: ["显示", "boolean"],
		})) {
			const value = r.data[field];
			if (required && (value === undefined || value === null))
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
		const start = instant(r.data.publishAt);
		const end = instant(r.data.unpublishAt);
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
			r.domain === "posts" &&
			!/^\d{4}-\d\d-\d\d$/.test(String(r.data.published))
		)
			throw new Error(`${r.path}：发布日期须为 YYYY-MM-DD`);
		if (r.domain === "moments") {
			instant(r.data.published, `${r.path}：动态时间`);
		}
	}
	for (const domain of ["categories", "tags", "series"]) {
		const list = records.filter((r) => r.domain === domain);
		const byKey = new Map();
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
	return records;
}
export function schedule(records) {
	return [
		...new Set(
			records
				.filter((r) => r.data.publish === true)
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
function cleanData(r) {
	const result = Object.fromEntries(
		Object.entries(r.data).filter(
			([k]) =>
				!metadata.has(k) &&
				k in (domains[r.domain]?.fields || {}) &&
				(k !== "password" || r.domain === "albums"),
		),
	);
	if (result.date && domains[r.domain]?.fields?.date?.[1] === "date")
		result.date = displayTime(result.date);
	return result;
}
export function compileVault({ sourceRoot, root, dryRun = false, previewAt }) {
	const inventory = files(sourceRoot);
	const records = readRecords(sourceRoot, inventory);
	validate(records);
	const time = instant(
		previewAt || process.env.VAULT_BUILD_AT || new Date().toISOString(),
	);
	const active = (r) => visible(r.data, time);
	for (const record of records.filter(active)) record.body = disableFileImports(record.body);
	let sorted = records
		.filter(active)
		.sort(
			(a, b) =>
				(a.data.order ?? 0) - (b.data.order ?? 0) ||
				a.path.localeCompare(b.path),
		);
	const shelves = new Map();
	for (const r of sorted.filter((r) => r.domain === "links")) {
		const group = r.data.group || "常用";
		const shelf = shelves.get(group) || {
			domain: "compass",
			path: r.path,
			data: {
				key: createHash("sha256").update(group).digest("hex").slice(0, 12),
				name: group,
				entries: [],
			},
		};
		if (!/^https?:\/\//.test(r.data.url || ""))
			throw new Error("A public navigation link needs an HTTPS/HTTP URL");
		shelf.data.entries.push({
			label: r.data.title,
			href: r.data.url,
			note: r.data.description || r.body.trim(),
			icon: r.data.icon,
			image: r.data.cover,
		});
		shelves.set(group, shelf);
	}
	sorted = [...sorted, ...shelves.values()];
	const byDomain = new Map();
	for (const record of sorted) {
		if (!byDomain.has(record.domain)) byDomain.set(record.domain, []);
		byDomain.get(record.domain).push(record);
	}
	const list = (domain) => byDomain.get(domain) || [];
	const taxonomyKeys = new Map(
		["categories", "series", "tags"].map((domain) => [
			domain,
			new Set(list(domain).map((r) => r.data.key)),
		]),
	);
	for (const post of list("posts")) {
		for (const [domain, values] of [
			["categories", [post.data.category]],
			["series", [post.data.series]],
			["tags", post.data.tags || []],
		]) {
			for (const key of values.filter(Boolean)) {
				if (!taxonomyKeys.get(domain).has(key)) {
					const record = {
						domain,
						path: post.path,
						data: { key, name: key, title: key },
					};
					if (!byDomain.has(domain)) byDomain.set(domain, []);
					byDomain.get(domain).push(record);
					taxonomyKeys.get(domain).add(key);
				}
			}
		}
	}
	const outputs = new Map();
	const output = (path, text) => {
		if (outputs.has(path) && path.startsWith("src/content/"))
			throw new Error("Duplicate public note slug");
		outputs.set(path, text);
	};
	const resources = createResources({ root, sourceRoot, paths: inventory.map((p) => relative(sourceRoot, p).replaceAll("\\", "/")) });
	const {
		asset,
		mapAssets,
		copies: assetOutputs,
	} = resources;
	const notesByPath = new Map(records.map((record) => [record.path, record]));
	const notes = inventory.filter((path) => /\.md$/i.test(path)).map((file) => {
		const path = relative(sourceRoot, file).replaceAll("\\", "/");
		const r = notesByPath.get(path);
		if (!r || !active(r)) return { path, public: false };
		const url = r.domain === "posts" ? r.data.permalink ? `/${r.data.permalink.replace(/^\/+|\/+$/g, "")}/` : `/posts/${r.data.alias}/` : r.domain === "media" ? `/media/${r.data.key}/` : r.domain === "pages" ? `/${r.data.key}/` : r.domain === "moments" ? `/moments/#moment-${r.data.alias}` : `/${r.domain}/`;
		const outputPath = r.domain === "posts" || r.domain === "moments" ? `src/content/${r.domain}/${r.data.alias}.md` : r.domain === "pages" ? `src/content/spec/${r.data.key}.md` : r.domain === "media" ? `src/content/spec/media/${r.data.key}.md` : undefined;
		return { path, public: true, encrypted: Boolean(r.data.encrypted || r.data.password), title: r.data.title, fragmentPrefix: r.domain === "moments" ? `moment-${r.data.alias}-` : undefined, url, output: outputPath, properties: { aliases: r.data.aliases, tags: r.data.tags, cssclasses: r.data.cssclasses }, body: r.data.encrypted || r.data.password ? "" : r.body };
	});
	const resolvedAssets = {};
	const diagnostics = [];
	const index = createNoteIndex(notes, { resolveAsset(value, origin) {
		const key = `${origin}\0${value}`;
		if (!(key in resolvedAssets)) resolvedAssets[key] = resources.reference(value, origin);
		return resolvedAssets[key];
	} });
	const backlinks = {};
	for (const entry of index.entries.filter((entry) => entry.public !== false && !entry.encrypted)) {
		const result = expandReferences(clone(entry.tree), { index, current: entry.path });
		diagnostics.push(...result.diagnostics);
		for (const target of result.directLinks) {
			if (target === entry.path) continue;
			(backlinks[target] ??= []).push({ title: entry.title, url: entry.url });
		}
	}
	output(".vault-cache/markdown-index.json", `${JSON.stringify({ schema: 1, notes, assets: resolvedAssets, backlinks })}\n`);
	for (const r of ["posts", "moments", "pages"].flatMap(list)) {
		const collection = r.domain === "pages" ? "spec" : r.domain;
		const id = r.domain === "pages" ? r.data.key : r.data.alias;
		if (
			!/^[\p{L}\p{N}_./-]+$/u.test(String(id)) ||
			String(id).split("/").includes("..")
		)
			throw new Error("Invalid public note slug");
		if (r.domain === "pages" && !["about", "friends"].includes(id))
			throw new Error("Unsupported special page");
		const fields = new Set([
			...Object.keys(domains[r.domain]?.fields || {}),
			"title",
			"order",
			"updated",
			"updatedAt",
			"displayDate",
			"aliases",
			"cssclasses",
		]);
		const data = mapAssets(
			Object.fromEntries(
				Object.entries(r.data).filter(([key]) => fields.has(key)),
			),
			r.path,
		);
		output(
			`src/content/${collection}/${id}.md`,
			noteText(data, r.body),
		);
	}
	for (const r of list("media")) {
		if (!/^[\p{L}\p{N}_-]+$/u.test(String(r.data.key)))
			throw new Error("Invalid media slug");
		output(
			`src/content/spec/media/${r.data.key}.md`,
			noteText({}, r.body),
		);
	}
	const data = { categories: [], tags: [], series: [], media: [] };
	for (const domain of Object.keys(data))
		data[domain] = list(domain).map((r) => mapAssets(cleanData(r), r.path));
	output("src/user/vault-data.json", `${JSON.stringify(data, null, 2)}\n`);
	for (const [file, adapter] of Object.entries(adapters)) {
		const fileDomains = Object.keys(domains).filter(
			(d) => (domains[d].file || d) === file && domains[d].exports,
		);
		let text = adapter;
		for (const d of fileDomains)
			for (const exp of domains[d].exports) {
				text = text.replace(
					`__VAULT_${exp}__`,
					JSON.stringify(
						list(d).map((r) => mapAssets(cleanData(r), r.path)),
						null,
						2,
					),
				);
			}
		output(`src/data/${file}.ts`, text);
	}
	const configRoot = join(root, ".vault-cache");
	for (const path of files(join(root, "site/config"))) {
		const rel = relative(join(root, "site/config"), path).replaceAll("\\", "/");
		const text = readFileSync(path, "utf8");
		output(
			`.vault-cache/config/${rel}`,
			/\.ya?ml$/.test(rel) ? stringify(mapAssets(parse(text))) : text,
		);
	}
	{
		const path = join(root, "site/config/announcement.yaml");
		const original = existsSync(path)
			? parse(readFileSync(path, "utf8")) || {}
			: {};
		const announcements = list("announcements");
		const items = announcements.map((r) => mapAssets(cleanData(r), r.path));
		output(
			".vault-cache/config/announcement.yaml",
			stringify({
				...original,
				homeItems: items.filter(
					(_, index) => announcements[index].data.home === true,
				),
				board: {
					...original.board,
					enable: original.board?.enable ?? items.length > 0,
					items,
				},
			}),
		);
	}
	for (const r of list("albums")) {
		if (!/^[\p{L}\p{N}_-]+$/u.test(r.data.key))
			throw new Error("相册标识只允许字母、数字、短横线和下划线");
		const target = `public/images/albums/${r.data.key}/info.json`;
		output(
			target,
			`${JSON.stringify(
				{
					...mapAssets(cleanData(r), r.path),
					order: r.data.order ?? 0,
					mode: "external",
					cover: asset(r.data.cover || r.data.photos?.[0]?.src || "", r.path),
					columns: r.data.columns || 3,
					layout: r.data.layout || "masonry",
					photos: mapAssets(r.data.photos || [], r.path),
				},
				null,
				2,
			)}\n`,
		);
	}
	const result = {
		configRoot,
		records: records.length,
		time,
		outputs,
		assetOutputs,
		diagnostics,
	};
	if (!dryRun) materializeVault({ root, sourceRoot, ...result });
	return result;
}
