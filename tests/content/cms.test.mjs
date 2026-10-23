import { test } from "node:test";
import assert from "node:assert/strict";
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	readFileSync,
	existsSync,
	rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
	noteText,
	readNote,
	instant,
	visible,
	validate,
	publicationState,
	compileCms,
	refreshState,
} from "../../tools/cms/core.mjs";
import { verifyPrivateOutput } from "../../tools/cms/verify-dist.mjs";
const note = (domain, data, path = `cms/${domain}/test.md`, body = "") => ({
	domain,
	data,
	path,
	body,
});
function fixture(t) {
	const dir = mkdtempSync(join(tmpdir(), "cms-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const source = join(dir, "content"),
		root = join(dir, "theme");
	mkdirSync(source);
	mkdirSync(root);
	const write = (p, v) => {
		const file = join(source, p);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, v);
	};
	write(
		"cms/manifest.json",
		JSON.stringify({
			managed: [
				"media",
				"categories",
				"series",
				"tags",
				"devices",
				"announcements",
			],
		}),
	);
	return { source, root, write };
}
test("frontmatter round trips punctuation, Unicode, passwords and Markdown body", () => {
	const data = {
		title: '测试: "内容"',
		password: "x:y#123",
		tags: ["标签"],
		draft: true,
	};
	assert.deepEqual(readNote(noteText(data, "# 正文")).data, data);
	assert.equal(readNote(noteText(data, "# 正文")).body.trim(), "# 正文");
});
test("Shanghai times normalize and publication endpoints are exclusive", () => {
	assert.equal(instant("2026-10-24T08:00"), "2026-10-24T00:00:00.000Z");
	const d = { publishAt: "2026-10-24T08:00", unpublishAt: "2026-10-24T09:00" };
	assert.equal(visible(d, "2026-10-24T00:00:00.000Z"), true);
	assert.equal(visible(d, "2026-10-24T01:00:00.000Z"), false);
	assert.equal(
		visible({ ...d, draft: true }, "2026-10-24T00:00:00.000Z"),
		false,
	);
	assert.equal(
		visible({ ...d, visible: false }, "2026-10-24T00:00:00.000Z"),
		false,
	);
	assert.throws(() => instant("tomorrow"));
});
test("rejects category cycles, missing parents, invalid references and duplicate IDs", () => {
	assert.throws(
		() =>
			validate([
				note("categories", { key: "a", name: "A", parent: "b" }),
				note("categories", { key: "b", name: "B", parent: "a" }),
			]),
		/循环/,
	);
	assert.throws(
		() =>
			validate([
				note("categories", { key: "a", name: "A", parent: "missing" }),
			]),
		/父分类/,
	);
	assert.throws(
		() =>
			validate([
				note("posts", {
					title: "P",
					published: "2026-10-24",
					series: "missing",
				}),
			]),
		/系列/,
	);
	assert.throws(
		() =>
			validate([
				note("media", { cmsId: "same", key: "a", title: "A", kind: "book" }),
				note("media", { cmsId: "same", key: "b", title: "B", kind: "book" }),
			]),
		/重复/,
	);
});
test("rejects invalid windows, missing encryption passwords and invalid ratings", () => {
	assert.throws(
		() =>
			validate([
				note("posts", {
					title: "P",
					published: "2026-10-24",
					publishAt: "2026-10-25",
					unpublishAt: "2026-10-24",
				}),
			]),
		/下线/,
	);
	assert.throws(
		() =>
			validate([
				note("posts", { title: "P", published: "2026-10-24", encrypted: true }),
			]),
		/密码/,
	);
	assert.throws(
		() =>
			validate([
				note("media", { key: "a", title: "B", kind: "book", rating: 11 }),
			]),
		/评分/,
	);
});
test("schedule index is sorted, deduplicated and independent of note order", () => {
	const r = [
		note("media", { publishAt: "2026-10-24T08:00" }),
		note("media", {
			publishAt: "2026-10-24T08:00",
			unpublishAt: "2026-10-25T08:00",
		}),
	];
	assert.deepEqual(publicationState(r).transitions, [
		"2026-10-24T00:00:00.000Z",
		"2026-10-25T00:00:00.000Z",
	]);
	assert.equal(
		publicationState(r).scheduleHash,
		publicationState([...r].reverse()).scheduleHash,
	);
});
test("production removes inactive files, filters every data domain and stages only active media", (t) => {
	const f = fixture(t);
	f.write(
		"content/posts/draft.md",
		noteText(
			{
				title: "Private",
				published: "2026-10-24",
				draft: true,
				image: "cms/media/draft.png",
			},
			"private text",
		),
	);
	f.write("cms/media/draft.png", "draft image");
	f.write("cms/media/public.png", "public image");
	f.write("cms/media-note.md", "");
	f.write(
		"cms/media/record.md",
		noteText({
			key: "m",
			title: "Book",
			kind: "book",
			cover: "cms/media/public.png",
		}),
	);
	refreshState(f.source, "2026-10-24T00:00:00Z");
	compileCms({ ...{ sourceRoot: f.source, root: f.root }, production: true });
	assert.equal(existsSync(join(f.root, "src/content/posts/draft.md")), false);
	assert.equal(existsSync(join(f.root, "public/images/cms/draft.png")), false);
	assert.equal(existsSync(join(f.root, "public/images/cms/public.png")), true);
	const data = JSON.parse(readFileSync(join(f.root, "src/user/cms-data.json")));
	assert.equal(data.media[0].cover, "/images/cms/public.png");
});
test("preview contains drafts; a historical snapshot is reproducible; stale indexes fail closed", (t) => {
	const f = fixture(t);
	f.write(
		"content/posts/future.md",
		noteText({
			title: "Future",
			published: "2026-10-24",
			publishAt: "2026-10-25",
		}),
	);
	refreshState(f.source, "2026-10-24T00:00:00Z");
	compileCms({ sourceRoot: f.source, root: f.root });
	assert.ok(existsSync(join(f.root, "src/content/posts/future.md")));
	compileCms({ sourceRoot: f.source, root: f.root, production: true });
	assert.equal(existsSync(join(f.root, "src/content/posts/future.md")), false);
	f.write(
		"content/posts/future.md",
		noteText({
			title: "Future",
			published: "2026-10-24",
			publishAt: "2026-10-26",
		}),
	);
	assert.throws(
		() => compileCms({ sourceRoot: f.source, root: f.root, production: true }),
		/发布计划/,
	);
});
test("dry run leaves both workspaces untouched and compilation is repeatable", (t) => {
	const f = fixture(t);
	f.write(
		"cms/devices/item.md",
		noteText({
			id: "d",
			name: "Device",
			brand: "Brand",
			category: "desk",
			status: "active",
			specs: "spec",
			description: "desc",
			order: 12,
		}),
	);
	refreshState(f.source);
	compileCms({ sourceRoot: f.source, root: f.root, dryRun: true });
	assert.equal(existsSync(join(f.root, "src")), false);
	compileCms({ sourceRoot: f.source, root: f.root });
	const text = readFileSync(join(f.root, "src/data/devices.ts"), "utf8");
	compileCms({ sourceRoot: f.source, root: f.root });
	assert.equal(readFileSync(join(f.root, "src/data/devices.ts"), "utf8"), text);
	assert.equal(text.includes('"cmsId"'), false);
});
test("wiki links resolve to stable post URLs and missing or ambiguous links are rejected", (t) => {
	const f = fixture(t);
	f.write(
		"content/posts/one.md",
		noteText(
			{ title: "One", published: "2026-10-24", permalink: "stable" },
			"[[two|阅读]]",
		),
	);
	f.write(
		"content/posts/two.md",
		noteText({ title: "Two", published: "2026-10-24" }),
	);
	refreshState(f.source);
	compileCms({ sourceRoot: f.source, root: f.root });
	assert.match(
		readFileSync(join(f.root, "src/content/posts/one.md"), "utf8"),
		/\[阅读\]\(\/posts\/two\/\)/,
	);
	f.write(
		"content/posts/one.md",
		noteText({ title: "One", published: "2026-10-24" }, "[[missing]]"),
	);
	refreshState(f.source);
	assert.throws(
		() => compileCms({ sourceRoot: f.source, root: f.root }),
		/内部链接/,
	);
});

test("real calendar dates and timed previews are validated", (t) => {
	assert.throws(() => instant("2026-02-30"), /日期/);
	const f = fixture(t);
	f.write(
		"content/posts/timed.md",
		noteText({
			title: "Timed",
			published: "2026-10-24",
			draft: true,
			publishAt: "2026-10-25T08:00",
		}),
	);
	refreshState(f.source, "2026-10-24T00:00:00Z");
	compileCms({
		sourceRoot: f.source,
		root: f.root,
		previewAt: "2026-10-24T08:00",
	});
	assert.equal(existsSync(join(f.root, "src/content/posts/timed.md")), false);
	compileCms({
		sourceRoot: f.source,
		root: f.root,
		previewAt: "2026-10-25T08:00",
	});
	assert.equal(existsSync(join(f.root, "src/content/posts/timed.md")), true);
});

test("Obsidian conversion preserves code examples and encodes attachment filenames", (t) => {
	const f = fixture(t);
	f.write("cms/media/中文 图片.svg", "<svg/>");
	f.write(
		"content/posts/code.md",
		noteText(
			{ title: "Code", published: "2026-10-24" },
			"```\n[[missing]]\n```\n\n`![[missing.png]]`\n\n![[中文 图片.svg]]",
		),
	);
	refreshState(f.source);
	compileCms({ sourceRoot: f.source, root: f.root });
	const output = readFileSync(
		join(f.root, "src/content/posts/code.md"),
		"utf8",
	);
	assert.match(output, /\[\[missing\]\]/);
	assert.match(output, /`!\[\[missing.png\]\]`/);
	assert.ok(
		output.includes("/images/cms/" + encodeURIComponent("中文 图片.svg")),
	);
});

test("privacy scan detects real fields without mistaking regex APIs for short demo passwords", (t) => {
	const f = fixture(t);
	f.write(
		"content/posts/locked.md",
		noteText(
			{
				title: "Locked",
				published: "2026-10-24",
				password: "test",
				encrypted: true,
			},
			"Protected body sentinel with sufficient length",
		),
	);
	refreshState(f.source, "2026-10-24T00:00:00Z");
	const dist = join(f.root, "dist");
	mkdirSync(dist);
	writeFileSync(join(dist, "library.js"), "const check = /abc/.test(value);");
	assert.doesNotThrow(() => verifyPrivateOutput(f.source, dist));
	writeFileSync(join(dist, "leak.json"), JSON.stringify({ password: "test" }));
	assert.throws(
		() => verifyPrivateOutput(f.source, dist),
		/Serialized password/,
	);
	rmSync(join(dist, "leak.json"));
	writeFileSync(
		join(dist, "leak.html"),
		"Protected body sentinel with sufficient length",
	);
	assert.throws(() => verifyPrivateOutput(f.source, dist), /Private body/);
});
