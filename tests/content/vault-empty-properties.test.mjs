import assert from "node:assert/strict";
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import {
	compileVault,
	files,
	noteText,
	readRecords,
	types,
} from "../../tools/vault/core.mjs";
import { domains } from "../../tools/vault/model.mjs";
import { normalizeNoteProperties } from "../../tools/vault/properties.mjs";

function fixture(t) {
	const directory = mkdtempSync(join(tmpdir(), "vault-empty-properties-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const sourceRoot = join(directory, "vault");
	const root = join(directory, "theme");
	mkdirSync(sourceRoot);
	mkdirSync(root);
	const originals = new Map();
	function note(name, data, body = "Public body") {
		const text = noteText(data, body);
		originals.set(name, text);
		writeFileSync(join(sourceRoot, name), text);
	}
	return {
		root,
		sourceRoot,
		note,
		originals,
		build: () => compileVault({ root, sourceRoot, production: true }),
	};
}

function assertNoNull(value) {
	assert.notEqual(value, null);
	if (value && typeof value === "object")
		for (const item of Object.values(value)) assertNoNull(item);
}

function requiredValue(field, [, type, , options], name) {
	if (options) return options[0];
	if (type === "number") return 0;
	if (["tags", "objects", "images", "photos", "specs", "links"].includes(type))
		return [];
	if (type === "boolean") return false;
	if (["date", "datetime"].includes(type) || field === "date")
		return "2026-10-24";
	if (["image", "url"].includes(type))
		return "https://example.com/resource.png";
	return `${name}-${field}`;
}

test("every supported note type accepts null optional Properties without exporting null values", (t) => {
	const { sourceRoot, root, note, build, originals } = fixture(t);
	for (const [type, domain] of Object.entries(types)) {
		const data = {
			type,
			publish: true,
			cover: null,
			date: null,
			order: null,
			draft: null,
			visible: null,
		};
		for (const [field, spec] of Object.entries(domains[domain]?.fields || {}))
			data[field] = spec[2] ? requiredValue(field, spec, type) : null;
		if (type === "link")
			Object.assign(data, {
				url: "https://example.com/",
				group: null,
				icon: null,
				description: null,
			});
		if (type === "page") data.key = "about";
		note(`${type}.md`, data);
	}
	build();
	for (const record of readRecords(sourceRoot)) {
		// Derived defaults may use undefined; no authored null may leak through.
		assertNoNull(record.data);
	}
	for (const path of files(root)) {
		const text = readFileSync(path, "utf8");
		if (path.endsWith(".json")) assertNoNull(JSON.parse(text));
		if (path.endsWith(".md"))
			assertNoNull(parse(text.match(/^---\n([\s\S]*?)\n---/)[1]));
		if (/\.ya?ml$/.test(path)) assertNoNull(parse(text));
	}
	for (const [name, text] of originals)
		assert.equal(readFileSync(join(sourceRoot, name), "utf8"), text);
});

test("quoted empty typed Properties behave like omitted Properties and false/zero remain explicit", () => {
	assert.deepEqual(
		normalizeNoteProperties(
			{
				publish: true,
				tags: "",
				seriesOrder: "",
				pinned: "",
				comment: false,
				order: 0,
				image: "",
				description: "",
			},
			"posts",
		),
		{ publish: true, comment: false, order: 0, image: "", description: "" },
	);
	assert.deepEqual(
		normalizeNoteProperties(
			{ publish: true, columns: "", layout: "", photos: "" },
			"albums",
		),
		{ publish: true },
	);
	assert.deepEqual(
		normalizeNoteProperties(
			{
				publish: true,
				home: false,
				link: { url: "https://example.com/", enable: false, text: null },
			},
			"announcements",
		),
		{
			publish: true,
			home: false,
			link: { url: "https://example.com/", enable: false },
		},
	);
});

test("nested optional values and blank list rows normalize before Markdown and data adapters", (t) => {
	const { note, build, root } = fixture(t);
	note("post.md", {
		type: "article",
		publish: true,
		slug: "post",
		tags: [null, "", "kept"],
		comment: false,
		pinned: false,
		seriesOrder: 0,
	});
	note("moment.md", {
		type: "moment",
		publish: true,
		images: [null, {}, "", { src: "https://example.com/image.png", alt: null }],
		mood: null,
	});
	note("announcement.md", {
		type: "announcement",
		publish: true,
		home: true,
		link: { url: "https://example.com/", text: null, enable: false },
		tag: null,
	});
	note("anime.md", {
		type: "anime",
		publish: true,
		status: "watching",
		rating: 0,
		year: "2026",
		genres: [],
		progress: { watched: 0, total: null },
		period: { start: null, end: null },
	});
	note("timeline.md", {
		type: "timeline",
		publish: true,
		date: "2026",
		links: [
			null,
			{},
			{ label: "Example", url: "https://example.com/", icon: null },
		],
	});
	note("album.md", {
		type: "album",
		publish: true,
		photos: [
			null,
			{},
			{ src: "https://example.com/image.png", alt: null, title: null },
		],
	});
	build();
	const post = readFileSync(join(root, "src/content/posts/post.md"), "utf8");
	assert.match(post, /comment: false/);
	assert.match(post, /seriesOrder: 0/);
	assert.match(post, /- kept/);
	const moment = readFileSync(
		join(root, "src/content/moments/moment.md"),
		"utf8",
	);
	assert.match(moment, /src: https:\/\/example.com\/image.png/);
	assert.doesNotMatch(moment, /null/);
	const announcement = parse(
		readFileSync(join(root, ".vault-cache/config/announcement.yaml"), "utf8"),
	);
	assert.equal(announcement.homeItems[0].link.enable, false);
	assert.match(
		readFileSync(join(root, "src/data/anime.ts"), "utf8"),
		/"watched": 0/,
	);
	assert.match(
		readFileSync(join(root, "src/data/anime.ts"), "utf8"),
		/"total": 0/,
	);
	assert.doesNotMatch(
		readFileSync(join(root, "src/data/anime.ts"), "utf8"),
		/"period"/,
	);
});

test("missing required fields and real type errors still fail, and private malformed metadata stays private", (t) => {
	const { note, build } = fixture(t);
	note("private.md", {
		type: "article",
		publish: "true",
		pinned: "wrong",
		tags: { broken: true },
	});
	assert.doesNotThrow(build);
	note("public.md", { type: "article", publish: true, pinned: "false" });
	assert.throws(build, /必须为开关/);
	note("public.md", { type: "article", publish: true, tags: { broken: true } });
	assert.throws(build, /必须为文字列表/);
	note("public.md", {
		type: "skill",
		publish: true,
		name: "Skill",
		category: "Tools",
		level: null,
	});
	assert.throws(build, /请填写/);
});

test("structured aliases support shared objects and reject actual cycles without changing private values", () => {
	const link = { url: "https://example.com/", icon: null };
	assert.deepEqual(
		normalizeNoteProperties({ publish: true, links: [link, link] }, "timeline")
			.links,
		[{ url: "https://example.com/" }, { url: "https://example.com/" }],
	);
	const cycle = {};
	cycle.self = cycle;
	assert.throws(
		() =>
			normalizeNoteProperties({ publish: true, link: cycle }, "announcements"),
		/circular YAML alias/,
	);
	assert.equal(
		normalizeNoteProperties({ publish: false, link: cycle }, "announcements")
			.link,
		cycle,
	);
});
