import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { compileVault, noteText } from "../../tools/vault/core.mjs";
import { createNoteIndex } from "../../src/plugins/markdown/core/obsidian.mjs";
import { siteMarkdownProcessor } from "../../src/utils/markdown-processor.mjs";

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), "markdown-vault-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const sourceRoot = join(root, "vault"); mkdirSync(sourceRoot);
	const write = (path, value) => { const target = join(sourceRoot, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, value); };
	const note = (path, properties, body) => write(path, noteText(properties, body));
	const build = () => compileVault({ sourceRoot, root, previewAt: "2026-10-25T00:00:00+08:00" });
	return { root, sourceRoot, write, note, build };
}
test("all reference failures publish other content without reading or copying restricted targets", async (t) => {
	const { root, note, write, build } = fixture(t);
	note("私人.md", {}, "PRIVATE_SENTINEL_NEVER_PUBLISH");
	note("文章/A.md", { type: "article", publish: true, slug: "a" }, "BEFORE [[私人|Go]] ![[私人]] ![[missing.png]] ![[../../../outside.png]] AFTER");
	const result = build();
	assert.ok(result.diagnostics.length >= 3);
	const data = JSON.parse(readFileSync(join(root, ".vault-cache/markdown-index.json"), "utf8"));
	assert.doesNotMatch(JSON.stringify(data), /PRIVATE_SENTINEL/);
	assert.equal(result.assetOutputs.size, 0);
	const index = createNoteIndex(data.notes, { resolveAsset: (value, origin) => data.assets[`${origin}\0${value}`] });
	const r = await siteMarkdownProcessor.createRenderer({});
	const { code } = await r.render(data.notes.find(({ public: visible }) => visible).body, { context: { current: "文章/A.md", index } });
	assert.match(code, /BEFORE/); assert.match(code, /AFTER/); assert.match(code, /data-reference-status="unpublished"/); assert.match(code, /popover="auto"/);
	assert.doesNotMatch(code, /PRIVATE_SENTINEL|href=".*私人/);
});
test("selected nested embeds collect source-relative attachments and direct backlinks only", (t) => {
	const { root, note, write, build } = fixture(t);
	write("笔记/图 片.png", "PUBLIC_IMAGE"); write("笔记/private.png", "UNUSED_ATTACHMENT");
	note("A.md", { type: "article", publish: true, slug: "a" }, "![[笔记/B#公开节]]");
	note("笔记/B.md", { type: "article", publish: true, slug: "b", aliases: ["别名"], cssclasses: ["wide"], custom: { keep: true } }, "# 公开节\n![[图 片.png|300]]\n\n# 其他节\n%%![[private.png]]%%");
	const result = build();
	assert.equal(result.assetOutputs.size, 1);
	const data = JSON.parse(readFileSync(join(root, ".vault-cache/markdown-index.json"), "utf8"));
	assert.deepEqual(data.backlinks["笔记/B.md"], [{ title: "A", url: "/posts/a/" }]);
	assert.equal(data.backlinks["A.md"], undefined);
	assert.equal(data.notes.find(({ path }) => path === "笔记/B.md").properties.aliases[0], "别名");
	note("笔记/B.md", { type: "article", publish: false, slug: "b" }, "WITHDRAWN_SECRET");
	const next = build(); assert.equal(next.assetOutputs.size, 0);
	assert.equal(existsSync(join(root, "src/content/posts/b.md")), false);
	assert.doesNotMatch(readFileSync(join(root, ".vault-cache/markdown-index.json"), "utf8"), /WITHDRAWN_SECRET/);
});

test("comments never enter structured-card descriptions and encoded percent filenames resolve once", (t) => {
	const { root, note, write, build } = fixture(t);
	write("附件/100%.png", "IMAGE_PERCENT"); write("附件/a#b.png", "IMAGE_HASH");
	note("device.md", { type: "device", publish: true, name: "Device" }, "Visible %%COMMENT_NOT_PUBLIC%% description");
	note("post.md", { type: "article", publish: true, slug: "special" }, "![[附件/100%25.png]] ![[附件/a%23b.png]] #知识/Markdown");
	const result = build(); assert.equal(result.assetOutputs.size, 2);
	assert.doesNotMatch(readFileSync(join(root, "src/data/devices.ts"), "utf8"), /COMMENT_NOT_PUBLIC/);
	assert.match(readFileSync(join(root, "src/content/posts/special.md"), "utf8"), /知识\/Markdown/);
});
