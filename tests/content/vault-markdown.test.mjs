import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { siteMarkdownProcessor } from "../../src/utils/markdown-processor.mjs";
import { compileVault, noteText, readNote } from "../../tools/vault/core.mjs";

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), "markdown-vault-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const sourceRoot = join(root, "vault");
	mkdirSync(sourceRoot);
	const write = (path, value) => {
		const target = join(sourceRoot, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, value);
	};
	const note = (path, properties, body) =>
		write(path, noteText(properties, body));
	const build = () =>
		compileVault({
			sourceRoot,
			root,
			dryRun: true,
			previewAt: "2026-10-25T00:00:00+08:00",
		});
	return { root, sourceRoot, write, note, build };
}
test("native attachments resolve Chinese paths, encoded spaces, references and links without rewriting prose", async (t) => {
	const { write, note, build, sourceRoot } = fixture(t);
	write("附件/Pasted image 20261026185132.png", "PUBLIC_IMAGE");
	write("附件/manual.pdf", "PUBLIC_PDF");
	write("附件/private.png", "PRIVATE_IMAGE");
	note(
		"博客/适配演示.md",
		{ type: "article", publish: true, slug: "target" },
		"Target",
	);
	const body =
		'[查看](博客/适配演示.md)\n![](附件/Pasted%20image%2020261026185132.png)\n\n![图 w-50%](<附件/Pasted image 20261026185132.png> "图注")\n\n![引用][photo]\n\n[photo]: 附件/Pasted%20image%2020261026185132.png "引用图注"\n\n[下载](附件/manual.pdf#page=2)\n\n`![](附件/private.png)`\n\n```md\n![](附件/private.png)\n```\n\n> [!NOTE]\n> Upstream alert\n\n[[literal]] %%literal%% ^[literal] #literal';
	note("post.md", { type: "article", publish: true, slug: "post" }, body);
	const before = readFileSync(join(sourceRoot, "post.md"), "utf8");
	const result = build();
	assert.deepEqual(result.diagnostics, []);
	assert.equal(result.assetOutputs.size, 2);
	const { body: output } = readNote(
		result.outputs.get("src/content/posts/post.md"),
	);
	const image = [...result.assetOutputs.keys()]
		.find((p) => p.endsWith(".png"))
		.slice("public".length);
	const pdf = [...result.assetOutputs.keys()]
		.find((p) => p.endsWith(".pdf"))
		.slice("public".length);
	assert.equal(
		output.trim(),
		body
			.replaceAll("博客/适配演示.md", "/posts/target/")
			.replaceAll("附件/Pasted%20image%2020261026185132.png", image)
			.replaceAll("附件/Pasted image 20261026185132.png", image)
			.replace("附件/manual.pdf", pdf),
	);
	assert.equal(readFileSync(join(sourceRoot, "post.md"), "utf8"), before);
	const { code } = await (
		await siteMarkdownProcessor.createRenderer({})
	).render(output);
	assert.match(code, /markdown-image-caption/);
	assert.match(code, /width: 50%/);
	assert.match(code, /data-admonition="note"/);
	assert.doesNotMatch(code, /obsidian-|PRIVATE_IMAGE/);
});
test("extensionless note links resolve in every public body and preserve URL suffixes", (t) => {
	const { note, build } = fixture(t);
	note(
		"博客/博客设计.md",
		{ type: "article", publish: true, slug: "design" },
		"Design",
	);
	note(
		"动态/目标.md",
		{ type: "moment", publish: true, slug: "target" },
		"Target",
	);
	const body =
		"[设计文档](博客/博客设计)\n\n[相对](../博客/博客设计?view=full#标题)\n\n[引用][design]\n\n[design]: 博客/博客设计\n\n[动态](动态/目标?q=test)";
	note("动态/来源.md", { type: "moment", publish: true, slug: "source" }, body);
	const result = build();
	assert.deepEqual(result.diagnostics, []);
	const output = readNote(
		result.outputs.get("src/content/moments/source.md"),
	).body;
	assert.match(output, /\[设计文档\]\(\/posts\/design\/\)/);
	assert.match(output, /\/posts\/design\/\?view=full#标题/);
	assert.match(output, /\[design\]: \/posts\/design\//);
	assert.match(output, /\/moments\/\?q=test#moment-target/);
});

test("extensionless private or ambiguous notes never become public destinations", (t) => {
	const { note, build } = fixture(t);
	note("private.md", {}, "PRIVATE_SENTINEL");
	note("a/shared.md", { type: "article", publish: true, slug: "a" }, "A");
	note("b/shared.md", { type: "article", publish: true, slug: "b" }, "B");
	note(
		"source.md",
		{ type: "moment", publish: true, slug: "source" },
		"[private](private) [ambiguous](shared) [web](/archive/)",
	);
	const result = build();
	assert.equal(result.diagnostics.length, 2);
	const output = readNote(
		result.outputs.get("src/content/moments/source.md"),
	).body;
	assert.match(
		output,
		/\[private\]\(private\) \[ambiguous\]\(shared\) \[web\]\(\/archive\/\)/,
	);
	assert.doesNotMatch(
		[...result.outputs.values()].join(""),
		/PRIVATE_SENTINEL/,
	);
});

test("YAML controls title, date, image, tags, category, drafts and visibility", (t) => {
	const { write, note, build } = fixture(t);
	write("附件/cover.png", "COVER");
	note(
		"post.md",
		{
			type: "article",
			publish: true,
			slug: "post",
			title: "标题",
			published: "2026-10-24T03:04:05+08:00",
			image: "附件/cover.png",
			tags: ["A", "B"],
			category: "分类",
		},
		"#body-tag\n\nBody",
	);
	for (const [slug, state] of Object.entries({
		draft: { draft: true },
		hidden: { hidden: true },
		invisible: { visible: false },
		unpublished: { publish: false },
	}))
		note(
			`${slug}.md`,
			{ type: "article", publish: true, slug, ...state },
			"PRIVATE_BODY",
		);
	const result = build();
	const { data } = readNote(result.outputs.get("src/content/posts/post.md"));
	assert.equal(data.title, "标题");
	assert.equal(data.published, "2026-10-24");
	assert.equal(data.publishedAt, "2026-10-24T03:04:05+08:00");
	assert.match(data.image, /^\/images\/vault\/[a-f0-9]{64}\.png$/);
	assert.deepEqual(data.tags, ["A", "B"]);
	assert.equal(data.category, "分类");
	assert.equal(
		[...result.outputs.keys()].filter((p) => p.startsWith("src/content/posts/"))
			.length,
		1,
	);
	assert.doesNotMatch([...result.outputs.values()].join(""), /PRIVATE_BODY/);
});
test("body syntax and unused attachments are left alone, including retired Obsidian forms", (t) => {
	const { write, note, build } = fixture(t);
	write("附件/wiki.png", "UNUSED_IMAGE");
	const body =
		"[[Other]] ![[附件/wiki.png|300]] %%text%%\n\n> [!custom]- Title\n> Body\n\n$math$\n\n:::note\nNative\n:::";
	note("post.md", { type: "article", publish: true, slug: "post" }, body);
	const result = build();
	assert.equal(result.assetOutputs.size, 0);
	assert.equal(
		readNote(result.outputs.get("src/content/posts/post.md")).body.trim(),
		body,
	);
	assert.equal(result.outputs.has(".vault-cache/markdown-index.json"), false);
});
test("resource failures are local and never publish a private note as an attachment", (t) => {
	const { note, build } = fixture(t);
	note("private.md", {}, "PRIVATE_SENTINEL");
	note(
		"post.md",
		{ type: "article", publish: true, slug: "post" },
		"BEFORE ![](../outside.png) ![](missing.png) [private](private.md) AFTER",
	);
	const result = build();
	assert.equal(result.assetOutputs.size, 0);
	assert.equal(result.diagnostics.length, 3);
	assert.doesNotMatch(
		[...result.outputs.values()].join(""),
		/PRIVATE_SENTINEL/,
	);
});

test("malformed percent-encoded references remain local diagnostics", (t) => {
	const { note, build } = fixture(t);
	note(
		"post.md",
		{ type: "article", publish: true, slug: "post" },
		"BEFORE [broken](%E0%A4) AFTER",
	);
	const result = build();
	assert.equal(result.diagnostics.length, 1);
	assert.match(
		readNote(result.outputs.get("src/content/posts/post.md")).body,
		/BEFORE \[broken\]\(%E0%A4\) AFTER/,
	);
});

test("escaped Markdown destinations are rewritten without changing labels or titles", (t) => {
	const { write, note, build } = fixture(t);
	write("附件/photo(1).png", "PHOTO");
	note(
		"target(1).md",
		{ type: "article", publish: true, slug: "target" },
		"Target",
	);
	note(
		"post.md",
		{ type: "article", publish: true, slug: "post" },
		String.raw`![photo](附件/photo\(1\).png "title ]( untouched")

[target](target\(1\).md "title ]( untouched")

[![nested](https://example.com/icon.png)](target\(1\).md)

[reference]: target\(1\).md "title ]( untouched"

[ref][reference]`,
	);
	const result = build();
	assert.deepEqual(result.diagnostics, []);
	const output = readNote(result.outputs.get("src/content/posts/post.md")).body;
	assert.match(
		output,
		/!\[photo\]\(\/images\/vault\/[a-f0-9]+\.png "title \]\( untouched"\)/,
	);
	assert.match(
		output,
		/\[target\]\(\/posts\/target\/ "title \]\( untouched"\)/,
	);
	assert.match(
		output,
		/\[!\[nested\]\(https:\/\/example.com\/icon.png\)\]\(\/posts\/target\/\)/,
	);
	assert.match(
		output,
		/\[reference\]: \/posts\/target\/ "title \]\( untouched"/,
	);
});

test("note links use album and series detail routes rather than their indexes", (t) => {
	const { note, build } = fixture(t);
	note(
		"album.md",
		{
			type: "album",
			publish: true,
			key: "travel",
			title: "Travel",
			photos: [],
		},
		"",
	);
	note(
		"series.md",
		{ type: "series", publish: true, key: "tutorial", title: "Tutorial" },
		"",
	);
	note(
		"post.md",
		{ type: "article", publish: true, slug: "post" },
		"[Album](album.md) [Series](series.md)",
	);
	const result = build();
	assert.deepEqual(result.diagnostics, []);
	const output = readNote(result.outputs.get("src/content/posts/post.md")).body;
	assert.match(output, /\[Album\]\(\/albums\/travel\/\)/);
	assert.match(output, /\[Series\]\(\/series\/tutorial\/\)/);
});
