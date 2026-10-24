import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	readFileSync,
	readdirSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	importImages,
	importStagedImages,
} from "../../tools/vault/import-local-images.mjs";

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), "vault-images-")),
		vault = join(root, "vault");
	mkdirSync(vault);
	mkdirSync(join(vault, "notes"));
	const external = join(root, "中文 图片.png");
	writeFileSync(external, "IMAGE_BYTES");
	t.after(() => rmSync(root, { recursive: true, force: true }));
	return { root, vault, external };
}

test("external Markdown and HTML images are copied, deduplicated and portable; code stays literal", (t) => {
	const { vault, external } = fixture(t),
		url = pathToFileURL(external).href;
	const text = `![图片](${url})\n<img src="${url}">\n\n\`![示例](${url})\`\n\n\`\`\`md\n![示例](${url})\n\`\`\``;
	const result = importImages({ vault, notePath: "notes/a.md", text });
	assert.equal(result.imported, 2);
	assert.equal(result.attachments.length, 1);
	assert.match(result.text, /!\[图片\]\(\.\.\/附件\/导入\/[a-f0-9]{64}\.png\)/);
	assert.ok(result.text.includes(`\`![示例](${url})\``));
	assert.equal(
		readFileSync(join(vault, result.attachments[0]), "utf8"),
		"IMAGE_BYTES",
	);
	assert.equal(readFileSync(external, "utf8"), "IMAGE_BYTES");
	assert.equal(
		importImages({ vault, notePath: "notes/a.md", text: result.text }).imported,
		0,
	);
});

test("relative outside paths and reference images import; remote URLs, contained files and missing originals remain", (t) => {
	const { vault } = fixture(t);
	const result = importImages({
		vault,
		notePath: "notes/a.md",
		text: "![x](../../中文%20图片.png)\n![ref][photo]\n\n[photo]: ../../中文%20图片.png\n\n![x](https://example.com/a.png)\n![x](../附件/a.png)\n![x](../../missing.png)",
	});
	assert.equal(result.imported, 2);
	assert.equal(result.missing, 1);
	assert.match(result.text, /https:\/\/example.com\/a.png/);
	assert.equal(readdirSync(join(vault, "附件/导入")).length, 1);
});

test("pre-commit stages imported attachments with the note and preserves partially staged edits", (t) => {
	const { vault, external } = fixture(t);
	const git = (args) =>
		execFileSync("git", args, { cwd: vault, encoding: "utf8" });
	git(["init", "-q"]);
	git(["config", "core.autocrlf", "false"]);
	const text = `![x](${pathToFileURL(external).href})`;
	writeFileSync(join(vault, "notes/a.md"), text);
	git(["add", "notes/a.md"]);
	assert.equal(importStagedImages(vault).imported, 1);
	assert.match(git(["diff", "--cached", "--name-only"]), /附件|\\351/);
	assert.match(git(["show", ":notes/a.md"]), /附件\/导入/);
	writeFileSync(join(vault, "notes/b.md"), text);
	git(["add", "notes/b.md"]);
	writeFileSync(join(vault, "notes/b.md"), text + "\nUNSTAGED");
	importStagedImages(vault);
	assert.equal(
		readFileSync(join(vault, "notes/b.md"), "utf8"),
		text + "\nUNSTAGED",
	);
	assert.equal(git(["show", ":notes/b.md"]), text);
});

test("Windows paths, wiki images and cover Properties are imported without rewriting prose", (t) => {
	const { vault, external } = fixture(t);
	const text = `---\ncover: ${JSON.stringify(pathToFileURL(external).href)}\n---\n\n![[${external}|300]]\n![普通图片](<${external}>)\n\n正文保留`;
	const result = importImages({ vault, notePath: "notes/a.md", text });
	assert.equal(result.imported, 3);
	assert.match(result.text, /cover: "附件\/导入\//);
	assert.match(result.text, /!\[\[附件\/导入\/[a-f0-9]{64}\.png\|300\]\]/);
	assert.match(result.text, /正文保留/);
});

test("installed pre-commit hook imports images during an ordinary Git commit", (t) => {
	const { vault, external } = fixture(t);
	const git = (args) =>
		execFileSync("git", args, {
			cwd: vault,
			encoding: "utf8",
			windowsHide: true,
		});
	git(["init", "-q"]);
	git(["config", "core.autocrlf", "false"]);
	execFileSync(process.execPath, [
		resolve("tools/vault/install-image-hook.mjs"),
		vault,
	]);
	writeFileSync(
		join(vault, "notes/a.md"),
		`![x](${pathToFileURL(external).href})`,
	);
	git(["add", "notes/a.md"]);
	git([
		"-c",
		"user.name=Fixture",
		"-c",
		"user.email=fixture@example.invalid",
		"commit",
		"-qm",
		"test",
	]);
	assert.match(git(["show", "HEAD:notes/a.md"]), /附件\/导入/);
	assert.equal(git(["status", "--porcelain"]), "");
	assert.equal(readdirSync(join(vault, "附件/导入")).length, 1);
});

test("absolute references to images already inside the Vault become portable without making copies", (t) => {
	const { vault } = fixture(t);
	const picture = join(vault, "notes/photo.png");
	writeFileSync(picture, "LOCAL_IMAGE");
	const result = importImages({
		vault,
		notePath: "notes/a.md",
		text: `![x](${pathToFileURL(picture).href} "标题")`,
	});
	assert.equal(result.imported, 1);
	assert.equal(result.text, '![x](photo.png "标题")');
	assert.deepEqual(result.attachments, ["notes/photo.png"]);
});
